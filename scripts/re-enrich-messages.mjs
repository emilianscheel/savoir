#!/usr/bin/env node
/**
 * Re-run LLM enrichment for all ingested Slack messages via enrich_and_merge.
 * Requires BUTTERBASE_API_KEY (service) and INTERNAL_CRON_SECRET in .env.local.
 */
import { loadEnvLocal, projectRoot } from "./load-env.mjs";

loadEnvLocal();

const appId = process.env.BUTTERBASE_APP_ID || process.env.NEXT_PUBLIC_BUTTERBASE_APP_ID || "app_y6dtsszb47za";
const apiUrl = (process.env.NEXT_PUBLIC_BUTTERBASE_API_URL || "https://api.butterbase.ai").replace(/\/$/, "");
const functionsBase = process.env.FUNCTIONS_BASE_URL || `${apiUrl}/v1/${appId}/fn`;
const cronSecret = process.env.INTERNAL_CRON_SECRET;
const serviceKey = process.env.BUTTERBASE_API_KEY;

if (!cronSecret) {
  console.error("INTERNAL_CRON_SECRET required in .env.local");
  process.exit(1);
}
if (!serviceKey) {
  console.error("BUTTERBASE_API_KEY required (export or add to .env.local)");
  process.exit(1);
}

const batchSize = Number(process.env.RE_ENRICH_BATCH_SIZE || "10");

async function fetchMessageIds() {
  const res = await fetch(
    `${apiUrl}/v1/${appId}/slack_messages?select=slack_message_id&order=ts.asc`,
    { headers: { Authorization: `Bearer ${serviceKey}` } },
  );
  if (!res.ok) {
    throw new Error(`Failed to list messages: ${res.status} ${await res.text()}`);
  }
  const rows = await res.json();
  return rows.map((r) => r.slack_message_id).filter(Boolean);
}

async function enrichBatch(ids) {
  const res = await fetch(`${functionsBase}/enrich_and_merge`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: ids.map((slack_message_id) => ({ slack_message_id })),
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`enrich_and_merge failed: ${res.status} ${text}`);
  }
  return JSON.parse(text);
}

async function fetchSlackUserId() {
  const res = await fetch(`${apiUrl}/v1/${appId}/slack_users?select=id&limit=1`, {
    headers: { Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0]?.id ?? null;
}

async function regenerateSummary(slackUserId) {
  const res = await fetch(`${functionsBase}/generate_workspace_summary`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ slack_user_id: slackUserId }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`generate_workspace_summary failed: ${res.status} ${text}`);
  }
  return JSON.parse(text);
}

const ids = await fetchMessageIds();
console.log(`Found ${ids.length} messages in ${projectRoot}`);

let totalProcessed = 0;
for (let i = 0; i < ids.length; i += batchSize) {
  const batch = ids.slice(i, i + batchSize);
  const result = await enrichBatch(batch);
  totalProcessed += result.processed?.length ?? 0;
  console.log(`Batch ${Math.floor(i / batchSize) + 1}: processed ${result.processed?.length ?? 0}`);
}

console.log(`Re-enriched ${totalProcessed} messages total`);

const slackUserId = await fetchSlackUserId();
if (slackUserId) {
  const summary = await regenerateSummary(slackUserId);
  console.log(`Workspace summary regenerated (message_count=${summary.message_count})`);
} else {
  console.warn("No slack_users row found — skip summary regeneration");
}
