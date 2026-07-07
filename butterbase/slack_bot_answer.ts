import {
  chatCompletion,
  json,
  queryNeo4jContext,
  requireEnv,
  slackApi,
  type FunctionContext,
} from "./shared/runtime.js";

async function authorizeInternal(req: Request, ctx: FunctionContext): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  return !!(ctx.env.INTERNAL_CRON_SECRET && auth === `Bearer ${ctx.env.INTERNAL_CRON_SECRET}`);
}

async function findUserDmChannel(token: string, userId: string): Promise<string | null> {
  const list = await slackApi<{ channels?: { id: string; user?: string }[] }>(
    "conversations.list",
    token,
    { types: "im", limit: 200 },
  );
  if (!list.ok || !list.channels) return null;
  return list.channels.find((c) => c.user === userId)?.id ?? null;
}

async function postBotReply(
  token: string,
  channel: string,
  threadTs: string,
  text: string,
  userId?: string,
): Promise<void> {
  const res = await slackApi("chat.postMessage", token, {
    channel,
    thread_ts: threadTs,
    text,
  });
  if (res.ok) return;

  if (res.error !== "not_in_channel" || !userId) return;

  const dmChannel = await findUserDmChannel(token, userId);
  if (!dmChannel) return;

  await slackApi("chat.postMessage", token, {
    channel: dmChannel,
    text:
      "I couldn't reply in that channel because I'm not a member. " +
      "Run `/invite @Savoir` there, or read my answer here:\n\n" +
      text,
  });
}

async function findWorkspace(
  ctx: FunctionContext,
  teamIds: string[],
): Promise<{ bot_access_token: string; ingestion_ready: boolean; graph_team_id: string } | null> {
  const ids = [...new Set(teamIds.filter(Boolean))];
  if (ids.length === 0) return null;

  const { rows } = await ctx.db.query(
    `SELECT sw.bot_access_token, sw.slack_team_id,
            bool_or(su.ingestion_status = 'complete') AS ingestion_ready
     FROM slack_workspaces sw
     JOIN slack_users su ON su.slack_workspace_id = sw.id
     WHERE sw.slack_team_id = ANY($1::text[])
     GROUP BY sw.id, sw.bot_access_token, sw.slack_team_id
     LIMIT 1`,
    [ids],
  );
  const row = rows[0];
  if (!row?.bot_access_token) return null;
  return {
    bot_access_token: row.bot_access_token as string,
    ingestion_ready: row.ingestion_ready === true,
    graph_team_id: row.slack_team_id as string,
  };
}

async function answerMention(
  ctx: FunctionContext,
  teamIds: string[],
  event: { text?: string; user?: string; channel?: string; ts?: string; thread_ts?: string },
): Promise<void> {
  const workspace = await findWorkspace(ctx, teamIds);
  if (!workspace) return;

  const question = (event.text || "").replace(/<@[^>]+>/g, "").trim();
  const channel = event.channel!;
  const threadTs = event.thread_ts || event.ts!;
  const token = workspace.bot_access_token;
  const userId = event.user;

  if (!question) {
    await postBotReply(
      token,
      channel,
      threadTs,
      "Ask me something after @Savoir — for example: `@Savoir what meetings are coming up?`",
      userId,
    );
    return;
  }

  if (!workspace.ingestion_ready) {
    await postBotReply(
      token,
      channel,
      threadTs,
      "Still indexing your workspace — I'll be able to answer soon.",
      userId,
    );
    return;
  }

  try {
    await postBotReply(token, channel, threadTs, "Searching the workspace…", userId);

    const context = await queryNeo4jContext(ctx, workspace.graph_team_id, question, 10);
    const answer = await chatCompletion(
      ctx,
      "You answer questions about Slack workspace knowledge. Use only the provided context. Be concise: 2-4 sentences unless the user asks for detail. Cite channel when relevant. If unknown, say so.",
      `Context:\n${context}\n\nQuestion: ${question}`,
      { timeoutMs: 28_000, maxTokens: 350 },
    );
    await postBotReply(token, channel, threadTs, answer, userId);
  } catch {
    await postBotReply(
      token,
      channel,
      threadTs,
      "Sorry, I hit an error while looking that up. Please try again in a moment.",
      userId,
    );
  }
}

export default async function handler(req: Request, ctx: FunctionContext): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await authorizeInternal(req, ctx))) return json({ error: "forbidden" }, 403);

  const body = (await req.json()) as {
    team_id?: string;
    context_team_id?: string;
    event?: { text?: string; user?: string; channel?: string; ts?: string; thread_ts?: string };
  };

  if (!body.team_id || !body.event?.channel || !body.event?.ts) {
    return json({ error: "missing_team_or_event" }, 400);
  }

  requireEnv(ctx, "FUNCTIONS_BASE_URL");

  const teamIds = [body.team_id, body.context_team_id].filter(Boolean) as string[];
  ctx.waitUntil(answerMention(ctx, teamIds, body.event));
  return json({ ok: true, queued: true });
}
