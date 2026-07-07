import {
  chatCompletion,
  json,
  mergeMessageToNeo4j,
  messageId,
  queryNeo4jContext,
  requireEnv,
  slackApi,
  verifySlackSignatureAsync,
  type FunctionContext,
} from "./shared/runtime.js";

export default async function handler(req: Request, ctx: FunctionContext): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const rawBody = await req.text();
  const payload = JSON.parse(rawBody) as {
    type?: string;
    challenge?: string;
    event_id?: string;
    team_id?: string;
    event?: {
      type?: string;
      text?: string;
      user?: string;
      channel?: string;
      ts?: string;
      thread_ts?: string;
      bot_id?: string;
    };
  };

  if (payload.type === "url_verification") {
    return json({ challenge: payload.challenge });
  }

  const signingSecret = requireEnv(ctx, "SLACK_SIGNING_SECRET");
  const timestamp = req.headers.get("x-slack-request-timestamp") || "";
  const signature = req.headers.get("x-slack-signature") || "";
  const valid = await verifySlackSignatureAsync(signingSecret, timestamp, rawBody, signature);
  if (!valid) return json({ error: "invalid_signature" }, 401);

  if (payload.event_id && !(await ctx.idempotency.claim(payload.event_id, { scope: "slack" }))) {
    return json({ ok: true, duplicate: true });
  }

  const event = payload.event;
  if (!event || !payload.team_id) return json({ ok: true });

  if (event.bot_id) return json({ ok: true, ignored: "bot_message" });

  if (event.type === "app_mention") {
    ctx.waitUntil(handleAppMention(ctx, payload.team_id, event));
    return json({ ok: true });
  }

  if (
    event.type === "message" &&
    event.text &&
    event.channel &&
    event.ts
  ) {
    ctx.waitUntil(handleMessageEvent(ctx, payload.team_id, event));
  }

  return json({ ok: true });
}

async function handleMessageEvent(
  ctx: FunctionContext,
  teamId: string,
  event: { text?: string; user?: string; channel?: string; ts?: string; thread_ts?: string },
): Promise<void> {
  const { rows: workspaces } = await ctx.db.query(
    `SELECT id FROM slack_workspaces WHERE slack_team_id = $1`,
    [teamId],
  );
  if (!workspaces[0]) return;

  const workspaceId = workspaces[0].id as string;
  const slackMessageId = messageId(teamId, event.channel!, event.ts!);

  const { rows: users } = await ctx.db.query(
    `SELECT id FROM slack_users WHERE slack_workspace_id = $1 LIMIT 1`,
    [workspaceId],
  );
  if (!users[0]) return;

  const slackUserId = users[0].id as string;

  await ctx.db.query(
    `INSERT INTO slack_messages (
       slack_user_id, slack_workspace_id, slack_message_id,
       channel_id, author_slack_id, text, ts, thread_ts, enrichment_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
     ON CONFLICT (slack_message_id) DO NOTHING`,
    [
      slackUserId,
      workspaceId,
      slackMessageId,
      event.channel,
      event.user ?? null,
      event.text,
      event.ts,
      event.thread_ts ?? null,
    ],
  );

  await fetch(`${requireEnv(ctx, "FUNCTIONS_BASE_URL")}/enrich_and_merge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireEnv(ctx, "INTERNAL_CRON_SECRET")}`,
    },
    body: JSON.stringify({ slack_message_id: slackMessageId }),
  });
}

async function handleAppMention(
  ctx: FunctionContext,
  teamId: string,
  event: { text?: string; user?: string; channel?: string; ts?: string },
): Promise<void> {
  const { rows } = await ctx.db.query(
    `SELECT su.id, su.ingestion_status, sw.bot_access_token, sw.team_name
     FROM slack_workspaces sw
     JOIN slack_users su ON su.slack_workspace_id = sw.id
     WHERE sw.slack_team_id = $1
     LIMIT 1`,
    [teamId],
  );
  const row = rows[0];
  if (!row?.bot_access_token) return;

  const question = (event.text || "").replace(/<@[^>]+>/g, "").trim();

  if (row.ingestion_status !== "complete") {
    await slackApi("chat.postMessage", row.bot_access_token as string, {
      channel: event.channel!,
      thread_ts: event.ts,
      text: "Still indexing your workspace — I'll be able to answer soon.",
    });
    return;
  }

  const context = await queryNeo4jContext(ctx, teamId, question);
  const answer = await chatCompletion(
    ctx,
    "You answer questions about Slack workspace knowledge. Use only the provided context. Cite channel and timestamp when relevant. If unknown, say so.",
    `Context:\n${context}\n\nQuestion: ${question}`,
  );

  await slackApi("chat.postMessage", row.bot_access_token as string, {
    channel: event.channel!,
    thread_ts: event.ts,
    text: answer,
  });
}
