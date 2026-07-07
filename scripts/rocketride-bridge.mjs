#!/usr/bin/env node
/**
 * HTTP bridge: Butterbase POST /ingest → RocketRide client.send → Nebius fallback → enrich_and_merge merge_only.
 *
 * Env (from .env.local): ROCKETRIDE_URI, ROCKETRIDE_AUTH, ROCKETRIDE_TOKEN,
 * ROCKETRIDE_BRIDGE_SECRET, INTERNAL_CRON_SECRET, NEBIUS_*, PORT
 */
import http from "http";
import { loadEnvLocal, projectRoot } from "./load-env.mjs";
import { enrichMessageText, parsePipelineEnrichment } from "./enrich-nebius.mjs";

loadEnvLocal({ overridePrefixes: ["ROCKETRIDE_", "NEBIUS_", "INTERNAL_", "FUNCTIONS_"] });

const port = Number(process.env.PORT || 8787);
const bridgeSecret =
  process.env.ROCKETRIDE_BRIDGE_SECRET ||
  process.env.ROCKETRIDE_AUTH ||
  process.env.ROCKETRIDE_APIKEY;
const mergeSecret = process.env.INTERNAL_CRON_SECRET;
const token = process.env.ROCKETRIDE_TOKEN;
const uri = process.env.ROCKETRIDE_URI || "https://api.rocketride.ai";
const auth = process.env.ROCKETRIDE_AUTH || process.env.ROCKETRIDE_APIKEY;
const functionsBase =
  process.env.FUNCTIONS_BASE_URL ||
  "https://api.butterbase.ai/v1/app_y6dtsszb47za/fn";

if (!bridgeSecret) {
  console.error("Set ROCKETRIDE_BRIDGE_SECRET or ROCKETRIDE_AUTH in .env.local");
  process.exit(1);
}
if (!mergeSecret) {
  console.error("Set INTERNAL_CRON_SECRET in .env.local");
  process.exit(1);
}

let RocketRideClient;
try {
  ({ RocketRideClient } = await import("rocketride"));
} catch {
  console.error("Install rocketride: npm install rocketride");
  process.exit(1);
}

const client = new RocketRideClient({ uri, auth });
let connected = false;

async function ensureConnected() {
  if (connected) return;
  await client.connect();
  connected = true;
  console.log(`RocketRide connected (${uri})`);
}

async function runPipeline(payload) {
  if (!token) return null;
  await ensureConnected();
  try {
    return await client.send(token, JSON.stringify(payload));
  } catch (err) {
    console.warn("RocketRide send failed:", err.message);
    return null;
  }
}

async function mergeToButterbase(payload, enrichment) {
  const mergeUrl = payload.merge_callback_url || `${functionsBase}/enrich_and_merge`;
  const res = await fetch(mergeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${mergeSecret}`,
    },
    body: JSON.stringify({
      slack_message_id: payload.slack_message_id,
      summary: enrichment.summary,
      topics: enrichment.topics,
      merge_only: true,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`merge callback ${res.status}: ${text}`);
  }
}

async function handleIngest(body) {
  const payload = typeof body === "string" ? JSON.parse(body) : body;
  if (!payload.slack_message_id || !payload.text) {
    throw new Error("slack_message_id and text required");
  }

  let enrichment = null;
  const pipelineResult = await runPipeline(payload);
  enrichment = parsePipelineEnrichment(pipelineResult, payload.slack_message_id);

  if (!enrichment?.summary) {
    enrichment = await enrichMessageText(payload.text);
    enrichment.slack_message_id = payload.slack_message_id;
  }

  await mergeToButterbase(payload, enrichment);
  return {
    ok: true,
    slack_message_id: payload.slack_message_id,
    via: pipelineResult ? "rocketride+merge" : "nebius+merge",
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, rocketride_token: Boolean(token) }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/ingest") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  const authHeader = req.headers.authorization || "";
  if (authHeader !== `Bearer ${bridgeSecret}`) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");

  try {
    const result = await handleIngest(body);
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error("ingest error:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`RocketRide bridge listening on 0.0.0.0:${port}`);
  console.log(`POST /ingest  (Authorization: Bearer <ROCKETRIDE_BRIDGE_SECRET>)`);
  console.log(`Set ROCKETRIDE_WEBHOOK_URL=http://<host>:${port}/ingest on Butterbase`);
  if (!token) console.warn("ROCKETRIDE_TOKEN not set — Nebius fallback only until pipeline is started");
});

process.on("SIGINT", async () => {
  if (connected) await client.disconnect().catch(() => {});
  process.exit(0);
});
