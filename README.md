# savoir

**Slack knowledge platform** for **HackwithBay 3.0 / AWS Builder Hackathon**.

Next.js static frontend on [Butterbase](https://butterbase.ai), Slack OAuth ingestion into Postgres + Neo4j, and a Slack bot that answers from the graph via Nebius (OpenAI-compatible LLM).

---

## Features

| Route | Purpose |
| ----- | ------- |
| `/` | Landing page |
| `/signin` | Connect Slack — workspace install + user authorization |
| `/onboarding` | Live ingestion progress (channels + message counts) |
| `/dashboard` | Workspace digest + per-channel stats |

**Backend flow:** OAuth → chunked Slack history fetch → Nebius enrichment → Neo4j merge → Slack Events for new messages → `@bot` answers from Neo4j context.

---

## Quick start

```bash
git clone https://github.com/emilianscheel/savoir.git
cd savoir
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
```

Deploy schema + functions to Butterbase (see below), then open `/signin`.

---

## Slack app setup

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps).
2. **OAuth & Permissions**
   - Redirect URL: `https://api.butterbase.ai/v1/{APP_ID}/fn/slack_oauth_callback`
   - Bot scopes: `app_mentions:read`, `chat:write`, `channels:read`, `groups:read`, `im:read`
   - User scopes: `channels:history`, `groups:history`, `im:history`, `mpim:history`, `users:read`
3. **Event Subscriptions** — enable, Request URL:
   `https://api.butterbase.ai/v1/{APP_ID}/fn/slack_events`
   - Subscribe to: `app_mention`, `message.channels`, `message.groups`, `message.im`
4. Install the app to your test workspace.

---

## Butterbase deploy checklist

1. Apply schema: [`butterbase/schema.json`](butterbase/schema.json) via `manage_schema`.
2. Apply RLS policies: [`butterbase/rls.json`](butterbase/rls.json) via `manage_rls`.
3. Deploy functions listed in [`butterbase/functions.json`](butterbase/functions.json) (each `.ts` in `butterbase/`).
4. Set function **envVars** (see `.env.example` comments): Slack credentials, `SESSION_JWT_SECRET`, `INTERNAL_CRON_SECRET`, `FUNCTIONS_BASE_URL`, `FRONTEND_URL`, Neo4j, Nebius.
5. Apply Neo4j schema:
   ```bash
   cat butterbase/graph-schema.cypher | neo4j-cli query --credential aura --rw
   ```
6. Build + deploy frontend: `npm run build` → upload `out/` to Butterbase static hosting.

---

## Hackathon demo script

1. Open `/signin` → **Connect Slack** (workspace + account).
2. Land on `/onboarding` — watch channels fill and message counts increment.
3. When complete, open `/dashboard` for the workspace digest.
4. In Slack, `@mention` the bot and ask about something from indexed channels.
5. (Optional) Run RocketRide `pipelines/slack_ingest.pipe` locally for pipeline demos.

Set `INGEST_MAX_MESSAGES=500` on functions to cap backfill for demo workspaces.

---

## Project structure

```
savoir/
├── app/
│   ├── page.tsx              # Landing
│   ├── signin/               # Slack OAuth entry
│   ├── onboarding/           # Ingestion progress
│   └── dashboard/            # Summaries
├── butterbase/
│   ├── schema.json           # Postgres tables
│   ├── rls.json              # RLS policy definitions
│   ├── functions.json        # Function deploy manifest
│   ├── shared/runtime.ts     # Shared function helpers
│   ├── slack_oauth_*.ts      # OAuth handlers
│   ├── ingest_next_chunk.ts  # Resumable ingestion worker
│   ├── enrich_and_merge.ts   # LLM + Neo4j merge
│   ├── slack_events.ts       # Events API + bot answers
│   └── graph-schema.cypher   # Neo4j constraints
├── lib/                      # Frontend session + API helpers
├── pipelines/                # RocketRide (optional local dev)
└── scripts/mcp/              # Agent MCP wrappers
```

---

## Environment variables

See [`.env.example`](.env.example). Key groups:

- **Frontend:** `NEXT_PUBLIC_BUTTERBASE_*`
- **Slack + auth (function env):** `SLACK_*`, `SESSION_JWT_SECRET`, `INTERNAL_CRON_SECRET`
- **Neo4j:** `NEO4J_*`
- **LLM:** `NEBIUS_*` (primary) or `OPENAI_API_KEY` (fallback)

---

## Agent tooling

See [`AGENTS.md`](./AGENTS.md) for Neo4j + RocketRide MCP setup.
