#!/usr/bin/env bash
# Launches the RocketRide MCP server, which exposes every running RocketRide
# pipeline as an MCP tool. Requires a running RocketRide engine (see AGENTS.md).
# Connection details come from .env.local via _load-env.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/_load-env.sh"

export ROCKETRIDE_URI="${ROCKETRIDE_URI:-ws://localhost:5565}"
: "${ROCKETRIDE_AUTH:?set ROCKETRIDE_AUTH in .env.local (your RocketRide API key)}"
export ROCKETRIDE_AUTH

exec uvx rocketride-mcp
