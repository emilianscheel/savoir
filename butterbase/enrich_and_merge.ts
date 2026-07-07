import {
  json,
  mergeMessageToNeo4j,
  routeMessageEnrichment,
  type FunctionContext,
} from "./shared/runtime.js";

async function authorizeInternal(req: Request, ctx: FunctionContext): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  return !!(ctx.env.INTERNAL_CRON_SECRET && auth === `Bearer ${ctx.env.INTERNAL_CRON_SECRET}`);
}

interface EnrichBody {
  slack_message_id?: string;
  messages?: { slack_message_id: string }[];
  summary?: string;
  topics?: string[];
  merge_only?: boolean;
}

async function processRow(
  ctx: FunctionContext,
  row: Record<string, unknown>,
  enrichment: { summary: string; topics: string[] },
): Promise<string> {
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

  return row.slack_message_id as string;
}

async function processBatch(
  ctx: FunctionContext,
  rows: Record<string, unknown>[],
  precomputed?: Map<string, { summary: string; topics: string[] }>,
): Promise<string[]> {
  const processed: string[] = [];
  for (const row of rows) {
    const id = row.slack_message_id as string;
    const pre = precomputed?.get(id);
    if (pre) {
      processed.push(await processRow(ctx, row, pre));
      continue;
    }

    const enrichment = await routeMessageEnrichment(ctx, row);
    if (enrichment.deferred) continue;
    processed.push(await processRow(ctx, row, enrichment));
  }
  return processed;
}

export default async function handler(req: Request, ctx: FunctionContext): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const isInternal = await authorizeInternal(req, ctx);
  const body = (await req.json()) as EnrichBody;

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

  if (rows.length === 0) return json({ ok: true, processed: [] });

  const precomputed = new Map<string, { summary: string; topics: string[] }>();
  if (body.merge_only && body.slack_message_id && body.summary) {
    precomputed.set(body.slack_message_id, {
      summary: body.summary,
      topics: Array.isArray(body.topics) ? body.topics : [],
    });
  }

  ctx.waitUntil(processBatch(ctx, rows, precomputed.size ? precomputed : undefined));

  return json({ ok: true, queued: rows.length });
}
