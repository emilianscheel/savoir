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

async function answerMention(
  ctx: FunctionContext,
  teamId: string,
  event: { text?: string; channel?: string; ts?: string },
): Promise<void> {
  const { rows } = await ctx.db.query(
    `SELECT su.id, su.ingestion_status, sw.bot_access_token
     FROM slack_workspaces sw
     JOIN slack_users su ON su.slack_workspace_id = sw.id
     WHERE sw.slack_team_id = $1
     LIMIT 1`,
    [teamId],
  );
  const row = rows[0];
  if (!row?.bot_access_token) return;

  const question = (event.text || "").replace(/<@[^>]+>/g, "").trim();
  const channel = event.channel!;
  const threadTs = event.ts!;

  if (row.ingestion_status !== "complete") {
    await slackApi("chat.postMessage", row.bot_access_token as string, {
      channel,
      thread_ts: threadTs,
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
    channel,
    thread_ts: threadTs,
    text: answer,
  });
}

export default async function handler(req: Request, ctx: FunctionContext): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await authorizeInternal(req, ctx))) return json({ error: "forbidden" }, 403);

  const body = (await req.json()) as {
    team_id?: string;
    event?: { text?: string; channel?: string; ts?: string };
  };

  if (!body.team_id || !body.event?.channel || !body.event?.ts) {
    return json({ error: "missing_team_or_event" }, 400);
  }

  requireEnv(ctx, "FUNCTIONS_BASE_URL");

  ctx.waitUntil(answerMention(ctx, body.team_id, body.event));
  return json({ ok: true, queued: true });
}
