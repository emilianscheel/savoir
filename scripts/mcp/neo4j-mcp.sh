#!/usr/bin/env bash
# Launches the official Neo4j MCP server (read-only) against the Aura instance.
# Credentials come from .env.local via _load-env.sh, so nothing secret is committed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/_load-env.sh"

: "${NEO4J_URI:?set NEO4J_URI in .env.local (copy from .env.example)}"
: "${NEO4J_USERNAME:?set NEO4J_USERNAME in .env.local}"
: "${NEO4J_PASSWORD:?set NEO4J_PASSWORD in .env.local}"

export NEO4J_URI NEO4J_USERNAME NEO4J_PASSWORD
export NEO4J_DATABASE="${NEO4J_DATABASE:-neo4j}"
export NEO4J_READ_ONLY="${NEO4J_READ_ONLY:-true}"
export NEO4J_TELEMETRY="${NEO4J_TELEMETRY:-false}"
export NEO4J_LOG_LEVEL="${NEO4J_LOG_LEVEL:-info}"
export NEO4J_LOG_FORMAT="${NEO4J_LOG_FORMAT:-text}"
export NEO4J_SCHEMA_SAMPLE_SIZE="${NEO4J_SCHEMA_SAMPLE_SIZE:-100}"

exec uvx neo4j-mcp-server
