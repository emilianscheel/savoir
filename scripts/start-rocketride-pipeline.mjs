#!/usr/bin/env node
/**
 * Start slack_ingest.pipe on hosted RocketRide and persist ROCKETRIDE_TOKEN to .env.local.
 */
import { loadEnvLocal, projectRoot, upsertEnvLocal } from "./load-env.mjs";
import path from "path";

loadEnvLocal({ overridePrefixes: ["ROCKETRIDE_"] });

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
const token = result.token;
upsertEnvLocal({ ROCKETRIDE_TOKEN: token });

const bridgePort = process.env.ROCKETRIDE_BRIDGE_PORT || "8787";
const bridgeUrl =
  process.env.ROCKETRIDE_WEBHOOK_URL || `http://localhost:${bridgePort}/ingest`;

console.log("\nPipeline started.");
console.log("Token:", token);
console.log("\nSaved ROCKETRIDE_TOKEN to .env.local");
console.log("\nNext:");
console.log("  1. npm run rocketride:bridge   (keep running)");
console.log(`  2. Deploy bridge publicly, then set ROCKETRIDE_WEBHOOK_URL=<public-url>/ingest`);
console.log("  3. npm run deploy:butterbase");
console.log("\nLocal dev webhook (Butterbase cloud cannot reach this):");
console.log(`  ROCKETRIDE_WEBHOOK_URL=${bridgeUrl}`);

await client.disconnect();
