#!/usr/bin/env node
/** Deploy bundled functions via Butterbase HTTP API (same as deploy_function MCP). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvLocal } from "./load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

loadEnvLocal({
  overridePrefixes: ["SLACK_", "INTERNAL_", "SESSION_", "NEBIUS_", "NEO4J_", "ROCKETRIDE_"],
});

const appId = process.env.BUTTERBASE_APP_ID || process.env.NEXT_PUBLIC_BUTTERBASE_APP_ID || "app_y6dtsszb47za";
const token = process.env.BUTTERBASE_API_KEY;
if (!token) {
  console.error("BUTTERBASE_API_KEY required");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "butterbase/functions.json"), "utf8"));
const bundledDir = path.join(root, "butterbase/.bundled");
const bb = path.join(root, "butterbase");

function stripExports(src) {
  return src
    .replace(/\bexport type /g, "type ")
    .replace(/\bexport interface /g, "interface ")
    .replace(/\bexport async function /g, "async function ")
    .replace(/\bexport function /g, "function ")
    .replace(/\bexport const /g, "const ")
    .replace(/\bexport default /g, "");
}

function bundleFunction(fn) {
  const runtimePath = fn.runtime || "shared/runtime.ts";
  const runtime = stripExports(fs.readFileSync(path.join(bb, runtimePath), "utf8"));
  let handler = fs.readFileSync(path.join(bb, fn.file), "utf8");
  handler = handler.replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*\n?/gm, "");
  return runtime + "\n" + handler;
}

fs.mkdirSync(bundledDir, { recursive: true });
for (const fn of manifest.functions) {
  fs.writeFileSync(path.join(bundledDir, `${fn.name}.js`), bundleFunction(fn));
}

const deployOnly = process.env.DEPLOY_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
const toDeploy = deployOnly?.length
  ? manifest.functions.filter((fn) => deployOnly.includes(fn.name))
  : manifest.functions;

const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

const envVars = {
  FUNCTIONS_BASE_URL: `https://api.butterbase.ai/v1/${appId}/fn`,
  FRONTEND_URL: frontendUrl,
  SLACK_REDIRECT_URI: `${frontendUrl}/oauth/callback`,
  SESSION_JWT_SECRET: process.env.SESSION_JWT_SECRET || "df61a671fa83e0d7187769a96947a871bfff4afc711a6874c256f8f23af9fbbe",
  INTERNAL_CRON_SECRET: process.env.INTERNAL_CRON_SECRET || "9c454b368509452d1c1933208854e24dfdfed5501583c5743ce7870063d481f8",
  NEO4J_URI: process.env.NEO4J_URI,
  NEO4J_USERNAME: process.env.NEO4J_USERNAME,
  NEO4J_PASSWORD: process.env.NEO4J_PASSWORD,
  NEO4J_DATABASE: process.env.NEO4J_DATABASE || "neo4j",
  INGEST_MAX_MESSAGES: process.env.INGEST_MAX_MESSAGES || "500",
  NEBIUS_BASE_URL: process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.us-central1.nebius.com/v1",
  NEBIUS_MODEL: process.env.NEBIUS_MODEL || "moonshotai/Kimi-K2.7-Code",
  NEBIUS_API_KEY: process.env.NEBIUS_API_KEY || "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID || "",
  SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET || "",
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET || "",
  SLACK_SCOPE_PROFILE: process.env.SLACK_SCOPE_PROFILE || "standard",
  SLACK_TEAM_ID: process.env.SLACK_TEAM_ID || "",
  ROCKETRIDE_WEBHOOK_URL: process.env.ROCKETRIDE_WEBHOOK_URL || "",
  ROCKETRIDE_AUTH: process.env.ROCKETRIDE_AUTH || "",
  ROCKETRIDE_BRIDGE_SECRET: process.env.ROCKETRIDE_BRIDGE_SECRET || process.env.ROCKETRIDE_AUTH || "",
};

function memoryLimitMb(name) {
  if (name === "slack_events" || name === "slack_bot_answer" || name.includes("oauth")) return 256;
  return 128;
}

function timeoutMs(name) {
  if (name === "slack_oauth_callback") return 60_000;
  if (name === "slack_bot_answer" || name === "enrich_and_merge" || name === "ingest_next_chunk") {
    return 120_000;
  }
  if (name === "slack_events") return 60_000;
  return 30_000;
}

for (const fn of toDeploy) {
  const code = fs.readFileSync(path.join(bundledDir, fn.name + ".js"), "utf8");
  const body = {
    name: fn.name,
    code,
    envVars,
    memoryLimitMb: memoryLimitMb(fn.name),
    timeoutMs: timeoutMs(fn.name),
    ...(fn.triggers ? { triggers: fn.triggers } : { trigger: fn.trigger }),
  };

  const res = await fetch(`https://api.butterbase.ai/v1/${appId}/functions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`✖ ${fn.name}: ${res.status} ${text}`);
    process.exit(1);
  }
  const data = JSON.parse(text);
  console.log(`✓ ${fn.name} → ${data.url || data.function?.url || "deployed"}`);
}
