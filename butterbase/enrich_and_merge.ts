import {
  enrichMessage,
  json,
  mergeMessageToNeo4j,
  requireEnv,
  type FunctionContext,
} from "./shared/runtime.js";

async function authorizeInternal(req: Request, ctx: FunctionContext): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  return !!(ctx.env.INTERNAL_CRON_SECRET && auth === `Bearer ${ctx.env.INTERNAL_CRON_SECRET}`);
}

export default async function handler(req: Request, ctx: FunctionContext): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const isInternal = await authorizeInternal(req, ctx);
  const body = (await req.json()) as {
    slack_message_id?: string;
    messages?: { slack_message_id: string }[];
  };

  const ids: string[] = [];
  if (body.slack_message_id) ids.push(body.slack_message_id);
  if (body.messages) ids.push(...body.messages.map((m) => m.slack_message_id));

  if (ids.length === 0 && !isInternal) {
    return json({ error: "missing_messages" }, 400);
  }

  const { rows } = await ctx.db.query(
    ids.length
      ? `SELECT sm.*, sw.slack_team_id, sw.team_name
         FROM slack_messages sm
         JOIN slack_workspaces sw ON sw.id = sm.slack_workspace_id
         WHERE sm.slack_message_id = ANY($1::text[])`
      : `SELECT sm.*, sw.slack_team_id, sw.team_name
         FROM slack_messages sm
         JOIN slack_workspaces sw ON sw.id = sm.slack_workspace_id
         WHERE sm.enrichment_status = 'pending'
         LIMIT 20`,
    ids.length ? [ids] : [],
  );

  const processed: string[] = [];

  for (const row of rows) {
    const enrichment = await enrichMessage(ctx, row.text as string);
    await ctx.db.query(
      `UPDATE slack_messages SET summary = $2, topics = $3::jsonb, enrichment_status = 'done'
       WHERE id = $1`,
      [row.id, enrichment.summary, JSON.stringify(enrichment.topics)],
    );

    await mergeMessageToNeo4j(ctx, {
      teamId: row.slack_team_id as string,
      teamName: row.team_name as string,
      slackUserId: (row.author_slack_id as string) || "unknown",
      authorName: (row.author_slack_id as string) || "unknown",
      messageId: row.slack_message_id as string,
      channelId: row.channel_id as string,
      channelName: (row.channel_name as string) || (row.channel_id as string),
      text: row.text as string,
      ts: row.ts as string,
      threadTs: (row.thread_ts as string) || undefined,
      summary: enrichment.summary,
      topics: enrichment.topics,
    });

    await ctx.db.query(
      `UPDATE slack_messages SET neo4j_merged_at = now() WHERE id = $1`,
      [row.id],
    );
    processed.push(row.slack_message_id as string);
  }

  return json({ ok: true, processed });
}
