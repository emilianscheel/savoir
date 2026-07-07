import { json, requireSession, type FunctionContext } from "./shared/runtime.js";

export default async function handler(req: Request, ctx: FunctionContext): Promise<Response> {
  try {
    const session = await requireSession(ctx, req);

    const { rows: summaryRows } = await ctx.db.query(
      `SELECT summary_text, message_count, generated_at
       FROM workspace_summaries WHERE slack_user_id = $1`,
      [session.slack_user_id],
    );

    const { rows: channelStats } = await ctx.db.query(
      `SELECT channel_name, channel_id, COUNT(*)::int AS message_count, MAX(ts) AS latest_ts
       FROM slack_messages
       WHERE slack_user_id = $1
       GROUP BY channel_name, channel_id
       ORDER BY message_count DESC
       LIMIT 50`,
      [session.slack_user_id],
    );

    const { rows: totals } = await ctx.db.query(
      `SELECT COUNT(*)::int AS total_messages,
              COUNT(DISTINCT channel_id)::int AS total_channels,
              MIN(ts) AS earliest_ts,
              MAX(ts) AS latest_ts
       FROM slack_messages WHERE slack_user_id = $1`,
      [session.slack_user_id],
    );

    const { rows: userRows } = await ctx.db.query(
      `SELECT ingestion_status, display_name FROM slack_users WHERE id = $1`,
      [session.slack_user_id],
    );

    return json({
      user: {
        display_name: userRows[0]?.display_name,
        ingestion_status: userRows[0]?.ingestion_status,
      },
      summary: summaryRows[0] ?? null,
      totals: totals[0] ?? {},
      channels: channelStats,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "unauthorized" }, 401);
  }
}
