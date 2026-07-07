#!/usr/bin/env bash
# Launches the Nebius MCP server (docs + CLI tools). Requires Nebius CLI with
# at least one profile configured: nebius profile create
set -euo pipefail

export NEBIUS_CLI_BIN="${NEBIUS_CLI_BIN:-$HOME/.nebius/bin/nebius}"

if [[ ! -x "$NEBIUS_CLI_BIN" ]]; then
  echo "Nebius CLI not found at $NEBIUS_CLI_BIN" >&2
  echo "Install: curl -sSL https://storage.eu-north1.nebius.cloud/cli/install.sh | bash" >&2
  exit 1
fi

exec uvx --refresh-package nebius-mcp-server \
  "nebius-mcp-server@git+https://github.com/nebius/mcp-server@main"
