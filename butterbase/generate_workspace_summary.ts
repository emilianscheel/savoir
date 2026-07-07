import { chatCompletion, json, type FunctionContext } from "./shared/runtime.js";

async function authorizeInternal(req: Request, ctx: FunctionContext): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  return !!(ctx.env.INTERNAL_CRON_SECRET && auth === `Bearer ${ctx.env.INTERNAL_CRON_SECRET}`);
}

export default async function handler(req: Request, ctx: FunctionContext): Promise<Response> {
  if (!(await authorizeInternal(req, ctx))) {
    return json({ error: "forbidden" }, 403);
  }

  const body = (await req.json()) as { slack_user_id?: string };
  if (!body.slack_user_id) return json({ error: "missing_slack_user_id" }, 400);

  const { rows: messages } = await ctx.db.query(
    `SELECT channel_name, ts, coalesce(summary, text) AS content
     FROM slack_messages
     WHERE slack_user_id = $1
     ORDER BY ts DESC
     LIMIT 100`,
    [body.slack_user_id],
  );

  const messageCount = messages.length;
  const digestSource = messages
    .slice(0, 30)
    .map(
      (m) =>
        `[${m.channel_name || "channel"} | ${m.ts}] ${String(m.content).slice(0, 300)}`,
    )
    .join("\n");

  const summaryText = await chatCompletion(
    ctx,
    "Write a concise workspace digest summarizing themes, decisions, and active discussions from these Slack messages.",
    digestSource || "No messages ingested yet.",
  );

  await ctx.db.query(
    `INSERT INTO workspace_summaries (slack_user_id, summary_text, message_count, generated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (slack_user_id) DO UPDATE SET
       summary_text = EXCLUDED.summary_text,
       message_count = EXCLUDED.message_count,
       generated_at = now()`,
    [body.slack_user_id, summaryText, messageCount],
  );

  return json({ ok: true, message_count: messageCount });
}
