import { json, requireSession, type FunctionContext } from "./shared/runtime.js";

export default async function handler(req: Request, ctx: FunctionContext): Promise<Response> {
  try {
    const session = await requireSession(ctx, req);
    const url = new URL(req.url);
    const jobId = url.searchParams.get("job_id");

    const { rows: users } = await ctx.db.query(
      `SELECT id, ingestion_status FROM slack_users WHERE id = $1`,
      [session.slack_user_id],
    );
    if (!users[0]) return json({ error: "user_not_found" }, 404);

    let jobQuery = `SELECT * FROM ingestion_jobs WHERE slack_user_id = $1 ORDER BY created_at DESC LIMIT 1`;
    let jobParams: unknown[] = [session.slack_user_id];
    if (jobId) {
      jobQuery = `SELECT * FROM ingestion_jobs WHERE id = $1 AND slack_user_id = $2`;
      jobParams = [jobId, session.slack_user_id];
    }

    const { rows: jobs } = await ctx.db.query(jobQuery, jobParams);
    const job = jobs[0];
    if (!job) return json({ error: "job_not_found" }, 404);

    const { rows: recentMessages } = await ctx.db.query(
      `SELECT channel_name, text, ts, enrichment_status
       FROM slack_messages
       WHERE slack_user_id = $1
       ORDER BY ts DESC NULLS LAST
       LIMIT 25`,
      [session.slack_user_id],
    ).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    const { rows: enrichCounts } = await ctx.db.query(
      `SELECT enrichment_status, COUNT(*)::int AS count
       FROM slack_messages
       WHERE slack_user_id = $1
       GROUP BY enrichment_status`,
      [session.slack_user_id],
    );

    const enrichment_totals: Record<string, number> = {};
    for (const row of enrichCounts) {
      enrichment_totals[row.enrichment_status as string] = row.count as number;
    }

    return json({
      user: {
        id: session.slack_user_id,
        ingestion_status: users[0].ingestion_status,
      },
      job: {
        id: job.id,
        status: job.status,
        total_channels: job.total_channels,
        completed_channels: job.completed_channels,
        fetched_messages: job.fetched_messages,
        channel_progress: job.channel_progress,
        error: job.error,
        started_at: job.started_at,
        finished_at: job.finished_at,
      },
      recent_messages: recentMessages.map((m) => ({
        channel_name: (m.channel_name as string) || "channel",
        text: ((m.text as string) || "").slice(0, 280),
        ts: m.ts as string,
        enrichment_status: (m.enrichment_status as string) || "pending",
      })),
      enrichment_totals,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "unauthorized" }, 401);
  }
}
