#!/usr/bin/env bash
# Bundle + deploy Butterbase functions for app_y6dtsszb47za.
# Requires: butterbase CLI, BUTTERBASE_API_KEY (or butterbase login)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_ID="${BUTTERBASE_APP_ID:-app_y6dtsszb47za}"
BB="${ROOT}/butterbase"
BUNDLED="${BB}/.bundled"

# Load local secrets (gitignored)
if [[ -f "$ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.local"
  set +a
fi

: "${BUTTERBASE_API_KEY:?Set BUTTERBASE_API_KEY or run butterbase login}"

SESSION_JWT_SECRET="${SESSION_JWT_SECRET:-$(openssl rand -hex 32)}"
INTERNAL_CRON_SECRET="${INTERNAL_CRON_SECRET:-$(openssl rand -hex 32)}"

ROOT="$ROOT" node -e '
const fs = require("fs");
const path = require("path");
const root = process.env.ROOT;
const bundled = path.join(root, "butterbase/.bundled");
fs.mkdirSync(bundled, { recursive: true });
const runtime = fs.readFileSync(path.join(root, "butterbase/shared/runtime.ts"), "utf8")
  .replace(/\bexport type /g, "type ")
  .replace(/\bexport interface /g, "interface ")
  .replace(/\bexport async function /g, "async function ")
  .replace(/\bexport function /g, "function ")
  .replace(/\bexport const /g, "const ");
for (const file of fs.readdirSync(path.join(root, "butterbase")).filter(f => f.endsWith(".ts"))) {
  let handler = fs.readFileSync(path.join(root, "butterbase", file), "utf8");
  handler = handler.replace(/^import[\s\S]*?from\s+["'"'"'][^"'"'"']+["'"'"'];\s*\n?/gm, "");
  const name = file.replace(/\.ts$/, "");
  fs.writeFileSync(path.join(bundled, name + ".js"), runtime + "\n" + handler);
}
'

common_env=(
  --env "FUNCTIONS_BASE_URL=https://api.butterbase.ai/v1/${APP_ID}/fn"
  --env "FRONTEND_URL=${FRONTEND_URL:-http://localhost:3000}"
  --env "SLACK_REDIRECT_URI=https://api.butterbase.ai/v1/${APP_ID}/fn/slack_oauth_callback"
  --env "SESSION_JWT_SECRET=${SESSION_JWT_SECRET}"
  --env "INTERNAL_CRON_SECRET=${INTERNAL_CRON_SECRET}"
  --env "NEO4J_URI=${NEO4J_URI:?NEO4J_URI required}"
  --env "NEO4J_USERNAME=${NEO4J_USERNAME:?NEO4J_USERNAME required}"
  --env "NEO4J_PASSWORD=${NEO4J_PASSWORD:?NEO4J_PASSWORD required}"
  --env "NEO4J_DATABASE=${NEO4J_DATABASE:-neo4j}"
  --env "INGEST_MAX_MESSAGES=${INGEST_MAX_MESSAGES:-500}"
  --env "NEBIUS_BASE_URL=${NEBIUS_BASE_URL:-https://api.tokenfactory.us-central1.nebius.com/v1}"
  --env "NEBIUS_MODEL=${NEBIUS_MODEL:-moonshotai/Kimi-K2.7-Code}"
  --env "NEBIUS_API_KEY=${NEBIUS_API_KEY:-}"
  --env "OPENAI_API_KEY=${OPENAI_API_KEY:-}"
  --env "SLACK_CLIENT_ID=${SLACK_CLIENT_ID:-}"
  --env "SLACK_CLIENT_SECRET=${SLACK_CLIENT_SECRET:-}"
  --env "SLACK_SIGNING_SECRET=${SLACK_SIGNING_SECRET:-}"
)

deploy_http() {
  local name="$1" method="$2"
  butterbase functions deploy "${BUNDLED}/${name}.js" \
    --app "$APP_ID" --name "$name" \
    --trigger http --trigger-config "{\"method\":\"${method}\",\"auth\":\"none\"}" \
    "${common_env[@]}"
}

deploy_http slack_oauth_start GET
deploy_http slack_oauth_callback GET
deploy_http get_ingestion_status GET
deploy_http get_dashboard_data GET
deploy_http enrich_and_merge POST
deploy_http slack_events POST
deploy_http generate_workspace_summary POST

butterbase functions deploy "${BUNDLED}/ingest_next_chunk.js" \
  --app "$APP_ID" --name ingest_next_chunk \
  --trigger cron --trigger-config '{"schedule":"* * * * *","timezone":"UTC"}' \
  "${common_env[@]}"

echo "Deployed functions to ${APP_ID}"
