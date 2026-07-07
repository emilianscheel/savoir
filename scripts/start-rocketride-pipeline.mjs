#!/usr/bin/env node
/**
 * Start slack_ingest.pipe on a RocketRide engine (local or cloud) and print the webhook URL
 * to set as ROCKETRIDE_WEBHOOK_URL on Butterbase functions.
 *
 * Requires: npm install rocketride (or npx rocketride)
 * Env: ROCKETRIDE_URI, ROCKETRIDE_AUTH (or ROCKETRIDE_APIKEY), ROCKETRIDE_OPENAI_KEY
 */
import { loadEnvLocal, projectRoot } from "./load-env.mjs";
import path from "path";

loadEnvLocal();

const auth = process.env.ROCKETRIDE_AUTH || process.env.ROCKETRIDE_APIKEY;
const uri = process.env.ROCKETRIDE_URI || "https://api.rocketride.ai";

if (!auth) {
  console.error("Set ROCKETRIDE_AUTH (or ROCKETRIDE_APIKEY) in .env.local");
  process.exit(1);
}

let RocketRideClient;
try {
  ({ RocketRideClient } = await import("rocketride"));
} catch {
  console.error("Install rocketride: npm install rocketride");
  process.exit(1);
}

const pipePath = path.join(projectRoot, "pipelines/slack_ingest.pipe");
const client = new RocketRideClient({ uri, auth });

console.log(`Connecting to RocketRide at ${uri}...`);
await client.connect();

const result = await client.use({ filepath: pipePath });
console.log("\nPipeline started.");
console.log("Token:", result.token);
console.log("\nSet on Butterbase function env (and .env.local):");
console.log(`ROCKETRIDE_WEBHOOK_URL=<your-engine-send-url-for-token-${result.token}>`);
console.log(`ROCKETRIDE_AUTH=${auth.slice(0, 8)}...`);
console.log("\nThen redeploy: npm run deploy:butterbase");
console.log("\nPipeline flow:");
console.log("  Slack → Butterbase enrich_and_merge → RocketRide webhook → LLM → merge callback → Neo4j");

await client.disconnect();
