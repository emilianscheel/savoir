#!/usr/bin/env bash
# Shared helper: resolve the repo root and export vars from .env.local / .env.
# Sourced by the MCP wrapper scripts so secrets live in gitignored env files,
# never in the committed .cursor/mcp.json.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

load_env_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  set -a
  # shellcheck disable=SC1090
  . "$file"
  set +a
}

# .env is the committed non-secret defaults; .env.local overrides with secrets.
load_env_file "$REPO_ROOT/.env"
load_env_file "$REPO_ROOT/.env.local"
