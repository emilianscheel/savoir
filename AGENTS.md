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

1. `cp .env.example .env.local` and fill in the values (ask the team for the
   Neo4j Aura password, RocketRide API key, and OpenAI key — they're in the
   shared password manager, not in git).
2. Install [`uv`](https://docs.astral.sh/uv/) if you don't have it
   (`brew install uv`). The wrappers use `uvx` to run the MCP servers with no
   manual pip install.
3. Reload the editor (or toggle the servers on in Cursor → Settings → MCP).

That's it — `neo4j` and `rocketride` then appear as MCP servers to your agent.

## What each server gives your agent

- **neo4j** — read-only access to the shared Aura memory graph via `get-schema`
  and `read-cypher`. Entities live as `(:Entity {name, type, observations,
  created_at})` nodes. To write memory, use the CLI instead:
  `neo4j-cli query --credential aura --rw '<cypher>'` (writes are intentionally
  blocked over MCP; set `NEO4J_READ_ONLY=false` in `.env.local` only if you
  really need agent writes).
- **rocketride** — exposes every *running* RocketRide pipeline as a callable
  tool. Pipelines are `.pipe` JSON files in `pipelines/`. This server only sees
  pipelines once the RocketRide engine is running and a pipeline is started:
  install the RocketRide IDE extension (Open VSX), deploy a local engine, then
  Run a pipeline (or start it via the SDK/CLI). Set `ROCKETRIDE_AUTH` in
  `.env.local` to your engine API key.

## Pipelines

`pipelines/chat.pipe` is a starter `Chat -> LLM -> response` pipeline. Edit it
visually with the RocketRide extension or by hand (it's plain JSON). Add new
`.pipe` files here; they become MCP tools automatically when started.
