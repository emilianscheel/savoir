# savoir

Account Console for **HackwithBay 3.0 / AWS Builder Hackathon**.

A small [Next.js](https://nextjs.org) app backed by [Butterbase](https://butterbase.ai)
(managed Postgres + serverless functions + static hosting), shipped with
**MCP tooling** (Neo4j memory graph + RocketRide AI pipelines) so any teammate's
coding agent — Cursor, Claude, etc. — is productive right after cloning.

---

## What it does

- **Account lookup** — enter an email, and a Butterbase serverless function
  (`butterbase/lookup_account.ts`) returns that account's `plan` and `status`.
- **Recent accounts** — the UI lists the 20 most recent rows from the `accounts`
  table via Butterbase's auto-generated data API (no SQL in the frontend).

The data model lives in `butterbase/schema.json` (an `accounts` table:
`id`, `email`, `plan`, `status`, `created_at`).

## Tech stack

| Layer            | Tech                                                        |
| ---------------- | ---------------------------------------------------------- |
| Frontend         | Next.js 16 · React 19 · TypeScript · Tailwind CSS v4        |
| Backend / DB     | Butterbase (`@butterbase/sdk`) — Postgres-backed BaaS      |
| Agent memory     | Neo4j Aura (graph DB) via the `neo4j` MCP server           |
| AI pipelines     | RocketRide (`.pipe` files) via the `rocketride` MCP server |
| Deployment       | Static export (`next build` → `out/`) on Butterbase hosting |

---

## Prerequisites

- **Node.js 20+** and npm
- **[uv](https://docs.astral.sh/uv/)** (`brew install uv`) — the MCP wrappers use
  `uvx` to run the Python MCP servers with no manual install
- Access to the shared secrets (Butterbase app ID, Neo4j Aura password, RocketRide
  key, OpenAI key) — they live in the team password manager, **not** in git

## Quick start

```bash
git clone https://github.com/emilianscheel/savoir.git
cd savoir
npm install
cp .env.example .env.local   # then fill in the real values
npm run dev                  # http://localhost:3000
```

Build the static site for Butterbase hosting:

```bash
npm run build                # output in out/
```

---

## Set your agent loose (MCP tooling)

This repo ships MCP servers so your coding agent can use the shared Neo4j memory
graph and RocketRide pipelines immediately. Config is in `.cursor/mcp.json`; it
calls wrapper scripts in `scripts/mcp/` that read secrets from your local
`.env.local`. **No secrets are committed.**

1. `cp .env.example .env.local` and fill in the values.
2. Make sure `uv` is installed (`brew install uv`).
3. Reload your editor (or toggle the servers on in Cursor → Settings → MCP).

`neo4j` and `rocketride` then appear as MCP servers to your agent. See
[`AGENTS.md`](./AGENTS.md) for the full details on each server, the memory-graph
entity model, and how to write to memory via `neo4j-cli`.

### What each server gives your agent

- **neo4j** — read-only access to the shared Aura memory graph
  (`(:Entity {name, type, observations, created_at})` nodes). Read-only over MCP
  by design; write with `neo4j-cli` (see `AGENTS.md`).
- **rocketride** — exposes every *running* RocketRide pipeline as a callable
  tool. Pipelines are `.pipe` JSON files in `pipelines/` (start with
  `pipelines/chat.pipe`, a `Chat → LLM → response` starter). Requires a running
  RocketRide engine — see `AGENTS.md`.

---

## Project structure

```
savoir/
├── app/                    # Next.js App Router (UI)
│   ├── page.tsx            # Account Console: lookup form + recent-accounts table
│   └── layout.tsx          # Root layout + metadata
├── lib/
│   └── butterbase.ts       # Butterbase SDK client + Account type
├── butterbase/             # Backend definitions deployed to Butterbase
│   ├── schema.json         # accounts table schema
│   ├── lookup_account.ts   # serverless function (email → account)
│   └── graph-schema.cypher # Neo4j memory-graph schema
├── pipelines/
│   └── chat.pipe           # RocketRide starter pipeline
├── scripts/mcp/            # MCP launcher wrappers (secrets from .env.local)
├── .cursor/mcp.json        # MCP config (neo4j + rocketride, secret-free)
├── .env.example            # Env var template — copy to .env.local
└── AGENTS.md               # Agent + MCP setup guide
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable                          | Purpose                                   |
| --------------------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_BUTTERBASE_APP_ID`   | Butterbase app the frontend talks to      |
| `NEXT_PUBLIC_BUTTERBASE_API_URL`  | Butterbase API base URL                   |
| `NEO4J_URI` / `_USERNAME` / `_PASSWORD` / `_DATABASE` | Aura memory graph (neo4j MCP) |
| `ROCKETRIDE_URI` / `ROCKETRIDE_AUTH` | RocketRide engine (rocketride MCP)     |
| `OPENAI_API_KEY`                  | LLM key referenced by `pipelines/*.pipe`  |

`.env.local` is gitignored, so secrets never get pushed. Only `.env.example`
(placeholders) is committed.
