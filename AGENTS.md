<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# MCP tooling (Neo4j + RocketRide)

This repo ships MCP servers so any teammate's coding agent (Cursor, Claude, etc.)
can use them right after cloning. Config lives in `.cursor/mcp.json`; it calls
wrapper scripts in `scripts/mcp/` that read secrets from a local `.env.local`.
No secrets are committed.

## One-time setup after cloning

1. `cp .env.example .env.local` and fill in the values.
2. Install [`uv`](https://docs.astral.sh/uv/) (`brew install uv`).
3. Reload the editor (or toggle MCP servers in Cursor → Settings → MCP).

## Slack platform (Butterbase functions)

| Function | Role |
| -------- | ---- |
| `slack_oauth_start` | Redirect to Slack OAuth (bot + user scopes) |
| `slack_oauth_callback` | Store tokens, start ingestion, mint session JWT |
| `ingest_next_chunk` | Resumable history fetch (cron + self-chain) |
| `get_ingestion_status` | Poll job progress for `/onboarding` |
| `enrich_and_merge` | LLM enrichment (or RocketRide handoff) → Neo4j MERGE |
| `slack_events` | Slack Events API (fast ack; delegates work) |
| `slack_bot_answer` | Neo4j context + Kimi answer → `chat.postMessage` |
| `generate_workspace_summary` | Precomputed dashboard digest |
| `get_dashboard_data` | Authenticated dashboard API |

Shared logic: `butterbase/shared/runtime.ts` (Slack API, JWT session, Neo4j HTTP, Nebius, RocketRide routing).

## Data pipeline (visible in code)

```
Slack message / @mention
  → slack_events.ts          (verify signature, return 200 quickly)
  → enrich_and_merge.ts      (Nebius Kimi OR ROCKETRIDE_WEBHOOK_URL)
  → mergeMessageToNeo4j()    (Person, Team, SlackMessage, Topic entities)
  → Neo4j Aura

@Savoir New mention
  → slack_events.ts → slack_bot_answer.ts → Neo4j + Kimi → Slack reply
```

Optional RocketRide cloud path: set `ROCKETRIDE_WEBHOOK_URL` on Butterbase functions and run `npm run rocketride:start` against `https://api.rocketride.ai` or your VM. See `pipelines/slack_ingest.pipe`.

Neo4j graph model: `Team`, `Person`, `SlackMessage`, `Topic` — see `butterbase/graph-schema.cypher`.

Apply graph schema: `cat butterbase/graph-schema.cypher | neo4j-cli query --credential aura --rw`

## MCP servers

- **neo4j** — read-only Aura access via `neo4j-mcp.sh`. Writes go through `neo4j-cli --rw` or Butterbase `enrich_and_merge`.
- **rocketride** — exposes running pipelines as tools via `rocketride-mcp.sh`.

## Pipelines

- `pipelines/chat.pipe` — starter chat pipeline
- `pipelines/slack_ingest.pipe` — cloud/local RocketRide enrichment (when `ROCKETRIDE_WEBHOOK_URL` is set)
