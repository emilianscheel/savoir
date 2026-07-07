import {
  ingestMaxMessages,
  json,
  mergeMessageToNeo4j,
  messageId,
  requireEnv,
  routeMessageEnrichment,
  slackApi,
  type FunctionContext,
  type SlackChannel,
} from "./shared/runtime.js";

interface ChannelProgress {
  channel_id: string;
  name: string;
  status: "pending" | "fetching" | "done" | "error";
  fetched: number;
}

interface JobCursor {
  channel_index: number;
  message_cursor: string | null;
}

async function authorizeInternal(req: Request, ctx: FunctionContext): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  const secret = ctx.env.INTERNAL_CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) return true;
  // Butterbase cron trigger has no Authorization header
  if (new URL(req.url).pathname.includes("/cron/")) return true;
  return false;
}

export default async function handler(req: Request, ctx: FunctionContext): Promise<Response> {
  if (!(await authorizeInternal(req, ctx))) {
    return json({ error: "forbidden" }, 403);
  }

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const jobIdParam = (body as { job_id?: string }).job_id;

  let jobId = jobIdParam;
  if (!jobId) {
    const { rows } = await ctx.db.query(
      `SELECT id FROM ingestion_jobs WHERE status IN ('queued', 'running') ORDER BY created_at ASC LIMIT 1`,
    );
    jobId = rows[0]?.id as string | undefined;
  }
  if (!jobId) return json({ ok: true, message: "no_jobs" });

  const { rows: jobs } = await ctx.db.query(`SELECT * FROM ingestion_jobs WHERE id = $1`, [jobId]);
  const job = jobs[0];
  if (!job) return json({ error: "job_not_found" }, 404);
  if (job.status === "complete" || job.status === "failed") {
    return json({ ok: true, status: job.status });
  }

  await ctx.db.query(`UPDATE ingestion_jobs SET status = 'running' WHERE id = $1`, [jobId]);

  const slackUserId = job.slack_user_id as string;
  const maxMessages = ingestMaxMessages(ctx);

  const { rows: userRows } = await ctx.db.query(
    `SELECT su.*, sw.slack_team_id, sw.team_name, sw.bot_access_token,
            st.user_access_token
     FROM slack_users su
     JOIN slack_workspaces sw ON sw.id = su.slack_workspace_id
     JOIN slack_tokens st ON st.slack_user_id = su.id
     WHERE su.id = $1`,
    [slackUserId],
  );
  const user = userRows[0];
  if (!user?.user_access_token) {
    await ctx.db.query(
      `UPDATE ingestion_jobs SET status = 'failed', error = 'missing_user_token', finished_at = now() WHERE id = $1`,
      [jobId],
    );
    return json({ error: "missing_user_token" }, 400);
  }

  let channels = (job.channels as SlackChannel[] | null) ?? null;
  if (!channels) {
    const channelTypes =
      ctx.env.SLACK_SCOPE_PROFILE === "full"
        ? "public_channel,private_channel,im,mpim"
        : "public_channel";
    const list = await slackApi<{ channels?: SlackChannel[] }>(
      "conversations.list",
      user.user_access_token as string,
      { types: channelTypes, limit: 200 },
    );
    if (!list.ok || !list.channels) {
      await ctx.db.query(
        `UPDATE ingestion_jobs SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`,
        [jobId, list.error || "conversations.list failed"],
      );
      return json({ error: list.error }, 500);
    }
    channels = list.channels;
    const progress: ChannelProgress[] = channels.map((c) => ({
      channel_id: c.id,
      name: c.name || (c.is_im ? "DM" : c.id),
      status: "pending",
      fetched: 0,
    }));
    await ctx.db.query(
      `UPDATE ingestion_jobs SET channels = $2::jsonb, channel_progress = $3::jsonb,
       total_channels = $4, cursor = '{"channel_index":0,"message_cursor":null}'::jsonb
       WHERE id = $1`,
      [jobId, JSON.stringify(channels), JSON.stringify(progress), channels.length],
    );
  }

  const cursor = (job.cursor as JobCursor) || { channel_index: 0, message_cursor: null };
  const progress = [...((job.channel_progress as ChannelProgress[]) || [])];
  const channelIndex = cursor.channel_index ?? 0;

  if (channelIndex >= channels.length) {
    await finishJob(ctx, jobId, slackUserId);
    return json({ ok: true, status: "complete" });
  }

  const channel = channels[channelIndex];
  progress[channelIndex] = { ...progress[channelIndex], status: "fetching" };

  const history = await slackApi<{
    messages?: { ts: string; text?: string; user?: string; thread_ts?: string }[];
    has_more?: boolean;
    response_metadata?: { next_cursor?: string };
  }>("conversations.history", user.user_access_token as string, {
    channel: channel.id,
    limit: 100,
    cursor: cursor.message_cursor || undefined,
  });

  if (!history.ok) {
    progress[channelIndex] = { ...progress[channelIndex], status: "error" };
    await ctx.db.query(
      `UPDATE ingestion_jobs SET channel_progress = $2::jsonb, cursor = $3::jsonb WHERE id = $1`,
      [
        jobId,
        JSON.stringify(progress),
        JSON.stringify({ channel_index: channelIndex + 1, message_cursor: null }),
      ],
    );
    scheduleNext(ctx, jobId);
    return json({ ok: true, warning: history.error });
  }

  const messages = history.messages ?? [];
  let fetchedInJob = Number(job.fetched_messages) || 0;
  let channelFetched = progress[channelIndex]?.fetched ?? 0;

  for (const msg of messages) {
    if (!msg.text || !msg.ts) continue;
    if (channelFetched >= maxMessages) break;

    const slackMessageId = messageId(
      user.slack_team_id as string,
      channel.id,
      msg.ts,
    );

    await ctx.db.query(
      `INSERT INTO slack_messages (
         slack_user_id, slack_workspace_id, slack_message_id,
         channel_id, channel_name, author_slack_id, text, ts, thread_ts,
         enrichment_status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
       ON CONFLICT (slack_message_id) DO NOTHING`,
      [
        slackUserId,
        user.slack_workspace_id,
        slackMessageId,
        channel.id,
        channel.name || channel.id,
        msg.user ?? null,
        msg.text,
        msg.ts,
        msg.thread_ts ?? null,
      ],
    );

    ctx.waitUntil(enrichAndStore(ctx, user, slackUserId, slackMessageId, msg, channel));

    channelFetched++;
    fetchedInJob++;
  }

  const channelDone =
    channelFetched >= maxMessages || !history.has_more || !history.response_metadata?.next_cursor;

  if (channelDone) {
    progress[channelIndex] = {
      channel_id: channel.id,
      name: channel.name || channel.id,
      status: "done",
      fetched: channelFetched,
    };
    cursor.channel_index = channelIndex + 1;
    cursor.message_cursor = null;
  } else {
    progress[channelIndex] = {
      channel_id: channel.id,
      name: channel.name || channel.id,
      status: "fetching",
      fetched: channelFetched,
    };
    cursor.message_cursor = history.response_metadata?.next_cursor ?? null;
  }

  const completedChannels = progress.filter((p) => p.status === "done").length;

  await ctx.db.query(
    `UPDATE ingestion_jobs SET
       channel_progress = $2::jsonb,
       cursor = $3::jsonb,
       fetched_messages = $4,
       completed_channels = $5
     WHERE id = $1`,
    [jobId, JSON.stringify(progress), JSON.stringify(cursor), fetchedInJob, completedChannels],
  );

  if (cursor.channel_index >= channels.length) {
    await finishJob(ctx, jobId, slackUserId);
    return json({ ok: true, status: "complete" });
  }

  scheduleNext(ctx, jobId);
  return json({ ok: true, status: "running", channel_index: cursor.channel_index });
}

async function enrichAndStore(
  ctx: FunctionContext,
  user: Record<string, unknown>,
  slackUserId: string,
  slackMessageId: string,
  msg: { ts: string; text?: string; user?: string; thread_ts?: string },
  channel: SlackChannel,
): Promise<void> {
  const enrichment = await routeMessageEnrichment(ctx, {
    slack_message_id: slackMessageId,
    text: msg.text || "",
    channel_name: channel.name || channel.id,
  });
  if (enrichment.deferred) return;
  await ctx.db.query(
    `UPDATE slack_messages SET summary = $2, topics = $3::jsonb, enrichment_status = 'done'
     WHERE slack_message_id = $1`,
    [slackMessageId, enrichment.summary, JSON.stringify(enrichment.topics)],
  );

  await mergeMessageToNeo4j(ctx, {
    teamId: user.slack_team_id as string,
    teamName: user.team_name as string,
    slackUserId: msg.user || (user.slack_user_id as string),
    authorName: msg.user || "unknown",
    messageId: slackMessageId,
    channelId: channel.id,
    channelName: channel.name || channel.id,
    text: msg.text || "",
    ts: msg.ts,
    threadTs: msg.thread_ts,
    summary: enrichment.summary,
    topics: enrichment.topics,
  });

  await ctx.db.query(
    `UPDATE slack_messages SET neo4j_merged_at = now() WHERE slack_message_id = $1`,
    [slackMessageId],
  );
}

async function finishJob(
  ctx: FunctionContext,
  jobId: string,
  slackUserId: string,
): Promise<void> {
  await ctx.db.query(
    `UPDATE ingestion_jobs SET status = 'complete', finished_at = now() WHERE id = $1`,
    [jobId],
  );
  await ctx.db.query(
    `UPDATE slack_users SET ingestion_status = 'complete', updated_at = now() WHERE id = $1`,
    [slackUserId],
  );

  ctx.waitUntil(
    fetch(`${requireEnv(ctx, "FUNCTIONS_BASE_URL")}/generate_workspace_summary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${requireEnv(ctx, "INTERNAL_CRON_SECRET")}`,
      },
      body: JSON.stringify({ slack_user_id: slackUserId }),
    }),
  );
}

function scheduleNext(ctx: FunctionContext, jobId: string): void {
  ctx.waitUntil(
    fetch(`${requireEnv(ctx, "FUNCTIONS_BASE_URL")}/ingest_next_chunk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${requireEnv(ctx, "INTERNAL_CRON_SECRET")}`,
      },
      body: JSON.stringify({ job_id: jobId }),
    }),
  );
}
