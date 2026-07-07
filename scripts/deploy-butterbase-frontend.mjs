#!/usr/bin/env node
/** Build Next static export and deploy to Butterbase frontend hosting. */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvLocal } from "./load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "out");
const zipPath = path.join(root, "frontend.zip");

loadEnvLocal();

const appId =
  process.env.BUTTERBASE_APP_ID ||
  process.env.NEXT_PUBLIC_BUTTERBASE_APP_ID ||
  "app_y6dtsszb47za";
const token = process.env.BUTTERBASE_API_KEY;
if (!token) {
  console.error("BUTTERBASE_API_KEY required");
  process.exit(1);
}

const apiBase = `https://api.butterbase.ai/v1/${appId}`;

async function api(pathname, { method = "GET", body } = {}) {
  const res = await fetch(`${apiBase}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathname}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

function zipOutDir() {
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(`cd "${outDir}" && zip -r -q "${zipPath}" .`);
  return fs.statSync(zipPath).size;
}

async function waitForReady(deploymentId, maxMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const dep = await api(`/frontend/deployments/${deploymentId}`);
    console.log(`  status: ${dep.status}${dep.url ? ` → ${dep.url}` : ""}`);
    if (dep.status === "READY" && dep.url) return dep;
    if (dep.status === "ERROR") throw new Error(dep.error || "deployment failed");
    await new Promise((r) => setTimeout(r, 4000));
    await api(`/frontend/deployments/${deploymentId}/sync`, { method: "POST" }).catch(() => {});
  }
  throw new Error("deployment timed out");
}

async function updateFunctionEnv(frontendUrl) {
  const oauthRedirectUri = `${frontendUrl}/oauth/callback`;
  const { functions } = await api("/functions");
  for (const fn of functions ?? []) {
    const res = await fetch(`${apiBase}/functions/${fn.name}/env`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        envVars: {
          FRONTEND_URL: frontendUrl,
          SLACK_REDIRECT_URI: oauthRedirectUri,
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`  ⚠ could not patch ${fn.name} env: ${res.status} ${text}`);
    } else {
      console.log(`  ✓ FRONTEND_URL + SLACK_REDIRECT_URI → ${fn.name}`);
    }
  }
}

const canonicalUrl = (
  process.env.FRONTEND_URL || "https://aws-builder-hackathon.butterbase.dev"
).replace(/\/$/, "");

console.log(`Building Next.js static export (NEXT_PUBLIC_APP_URL=${canonicalUrl})…`);
execSync("npm run build", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_APP_URL: canonicalUrl },
});

if (!fs.existsSync(path.join(outDir, "index.html"))) {
  console.error("out/index.html missing — build failed?");
  process.exit(1);
}

console.log("Creating frontend.zip…");
const bytes = zipOutDir();
console.log(`  ${bytes} bytes`);

console.log("Creating Butterbase frontend deployment…");
const created = await api("/frontend/deployments", {
  method: "POST",
  body: { framework: "nextjs-static" },
});
const deploymentId = created.id || created.deployment_id;
const uploadUrl = created.uploadUrl || created.upload_url;
if (!deploymentId || !uploadUrl) {
  throw new Error(`Unexpected create response: ${JSON.stringify(created)}`);
}

console.log(`  deployment: ${deploymentId}`);
console.log("Uploading zip…");
const zip = fs.readFileSync(zipPath);
const uploadRes = await fetch(uploadUrl, {
  method: "PUT",
  headers: { "Content-Type": "application/zip" },
  body: zip,
});
if (!uploadRes.ok) {
  throw new Error(`Upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
}

console.log("Starting deployment…");
await api(`/frontend/deployments/${deploymentId}/start`, { method: "POST" });

console.log("Waiting for READY…");
const ready = await waitForReady(deploymentId);
const frontendUrl = ready.url.replace(/\/$/, "");

console.log(`\nFrontend live at: ${frontendUrl}`);
console.log("Updating FRONTEND_URL + SLACK_REDIRECT_URI on all functions…");
await updateFunctionEnv(frontendUrl);

console.log(`\nDone. Slack redirect URL: ${frontendUrl}/oauth/callback`);
