# Savoir

**Slack knowledge platform** — HackwithBay 3.0 / AWS Builder Hackathon.

Turn Slack history into a searchable knowledge graph and answer questions in Slack with AI.

**Live app:** https://aws-builder-hackathon.butterbase.dev  
**Sign in:** https://aws-builder-hackathon.butterbase.dev/signin

*Last updated: July 7, 2026 at 4:28 PM PT*

---

## What's live in production

| Layer | Status |
| ----- | ------ |
| Slack OAuth + ingestion | ✅ Active |
| Postgres message store | ✅ Active |
| **Nebius Kimi enrichment** | ✅ **Active (default path)** |
| Neo4j graph merge | ✅ Active |
| Slack bot (`@mention` → Kimi) | ✅ Active |
| **RocketRide enrichment** | ⚙️ **Wired in code, not running live** |

Production enrichment uses **inline Nebius Kimi** inside Butterbase functions. RocketRide is integrated as an optional swap-in path when a live bridge URL is configured — it is **not** processing messages in the deployed app today.

---

## Tools we used

| Tool | Role in Savoir |
| ---- | -------------- |
| **[Slack](https://api.slack.com/)** | OAuth, message history, Events API, `@mention` bot replies |
| **[Butterbase](https://butterbase.ai/)** | Serverless functions, Postgres database, static frontend hosting |
| **[Neo4j Aura](https://neo4j.com/cloud/aura/)** | Knowledge graph — teams, people, messages, topics |
| **[Nebius Token Factory](https://nebius.com/)** | **Active** — primary LLM for enrichment + bot (Kimi K2.7 Code) |
| **[RocketRide](https://rocketride.ai/)** | **Optional** — enrichment pipeline wired in code; not live until bridge + webhook are running |
| **[OpenAI](https://platform.openai.com/)** | Fallback LLM + RocketRide pipeline profile (`gpt-4o-mini`) |
| **Next.js** | Static frontend (`/signin`, `/onboarding`, `/dashboard`) |
| **Postgres** | Raw Slack messages, ingestion jobs, tokens (via Butterbase) |

---

## The pipeline (end to end)

This is how data flows through Savoir from sign-in to bot answers.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  1. CONNECT                                                             │
│     User → /signin → Slack OAuth → tokens saved in Postgres             │
│     → session JWT → redirect to /onboarding                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  2. BACKFILL (history)                                                  │
│     ingest_next_chunk  (cron + self-chain)                              │
│     → Slack conversations.history                                       │
│     → rows in slack_messages (Postgres)                                 │
│     → progress shown on /onboarding                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  3. ENRICH (per message)                                                │
│     enrich_and_merge  →  routeMessageEnrichment                         │
│                                                                         │
│     ✅ LIVE TODAY — Path A (default):                                   │
│       Nebius Kimi inline → summary + topic tags                         │
│                                                                         │
│     ⚙️ OPTIONAL — Path B (requires live ROCKETRIDE_WEBHOOK_URL):          │
│       POST bridge → slack_ingest.pipe → callback enrich_and_merge       │
│       If bridge unreachable → falls back to Path A automatically        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  4. GRAPH (Neo4j)                                                       │
│     mergeMessageToNeo4j                                                   │
│     → Person, Team, SlackMessage, Topic nodes + relationships           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌──────────────────────────────┐   ┌──────────────────────────────────────┐
│  5. LIVE MESSAGES            │   │  6. DASHBOARD                        │
│     slack_events             │   │     generate_workspace_summary       │
│     → new Slack message      │   │     → workspace digest in Postgres   │
│     → enrich_and_merge       │   │     get_dashboard_data → /dashboard    │
│     → Neo4j updated          │   └──────────────────────────────────────┘
└──────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  7. BOT Q&A                                                             │
│     User @mentions bot in Slack                                         │
│     → slack_events (verify signature, ack fast)                         │
│     → slack_bot_answer                                                  │
│     → query Neo4j for context                                           │
│     → Nebius Kimi generates answer                                      │
│     → chat.postMessage reply in thread                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Step-by-step (plain English)

1. **Connect** — User authorizes Slack once. We store workspace + user tokens and start a session.
2. **Backfill** — `ingest_next_chunk` pulls channel history in chunks until the job is complete.
3. **Enrich** — Each message gets a summary and topic tags via **Nebius Kimi** (production default). RocketRide can replace this step when a public bridge is running; otherwise the code falls back to Kimi automatically.
4. **Graph** — Enriched messages are merged into **Neo4j** (people, teams, topics, message nodes).
5. **Live** — New Slack messages hit `slack_events` and go through the same enrich → graph path.
6. **Dashboard** — A precomputed digest and per-channel stats appear on `/dashboard`.
7. **Bot** — `@Savoir` questions pull graph context from Neo4j and answer with Kimi.

---

## Frontend routes

| Route | Purpose |
| ----- | ------- |
| `/` | Landing page |
| `/signin` | Connect Slack (one-time — gets the session token) |
| `/onboarding` | Live indexing progress after OAuth |
| `/dashboard` | Workspace digest + channel stats |

---

## Butterbase functions

| Function | Pipeline step |
| -------- | ------------- |
| `slack_oauth_start` | Redirect to Slack OAuth |
| `slack_oauth_callback` | Save tokens, start ingestion, mint session JWT |
| `ingest_next_chunk` | Resumable Slack history fetch (cron + chain) |
| `get_ingestion_status` | Poll job progress for `/onboarding` |
| `enrich_and_merge` | LLM enrichment → Neo4j merge |
| `slack_events` | Slack Events API entry point |
| `slack_bot_answer` | Neo4j context + Kimi → Slack reply |
| `generate_workspace_summary` | Build dashboard digest |
| `get_dashboard_data` | Dashboard API |

Shared helpers: `butterbase/shared/runtime.ts` (Slack, JWT, Neo4j, Nebius, RocketRide routing).

---

## Neo4j graph model

Nodes: `Team`, `Person`, `SlackMessage`, `Topic` (plus optional `Project`, `Skill`, etc.)

Schema file: [`butterbase/graph-schema.cypher`](butterbase/graph-schema.cypher)

```bash
npm run neo4j:schema
# or: cat butterbase/graph-schema.cypher | neo4j-cli query --credential aura --rw
```

---

## RocketRide (optional — not live in production)

RocketRide is **fully wired** in the codebase (`routeMessageEnrichment`, bridge script, `slack_ingest.pipe`) but **not actively processing** deployed traffic unless all of the following are true:

1. `ROCKETRIDE_WEBHOOK_URL` points to a **reachable public** bridge (not a stale local/ngrok URL)
2. The bridge is running (`npm run rocketride:bridge` or deploy via `render.yaml`)
3. `slack_ingest.pipe` is started on RocketRide (`npm run rocketride:start`)
4. Functions are redeployed with `npm run deploy:butterbase`

**Today:** enrichment runs on **Nebius Kimi inline**. If `ROCKETRIDE_WEBHOOK_URL` is set but the bridge is down, functions time out after 5s and **still use Kimi**.

When the bridge is live, the flow is:

```
Butterbase enrich_and_merge
  → POST ROCKETRIDE_WEBHOOK_URL (bridge /ingest)
  → RocketRide slack_ingest.pipe (extract_data → LLM)
  → callback enrich_and_merge (merge_only) → Neo4j
```

```bash
npm run rocketride:start     # start slack_ingest.pipe, save ROCKETRIDE_TOKEN
npm run rocketride:bridge    # local HTTP bridge (or deploy render.yaml)
# set public ROCKETRIDE_WEBHOOK_URL, then:
npm run deploy:butterbase
```

Pipeline files: `pipelines/slack_ingest.pipe`, `pipelines/chat.pipe`

---

## Quick start

```bash
git clone https://github.com/emilianscheel/savoir.git
cd savoir
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
```

Deploy:

```bash
FRONTEND_URL=https://aws-builder-hackathon.butterbase.dev npm run deploy:butterbase
FRONTEND_URL=https://aws-builder-hackathon.butterbase.dev npm run deploy:frontend
```

---

## Slack app setup

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps).
2. **OAuth redirect URL:** `https://api.butterbase.ai/v1/{APP_ID}/fn/slack_oauth_callback`
3. **Bot scopes:** `app_mentions:read`, `chat:write`, `channels:read`, `groups:read`, `im:read`
4. **User scopes:** `channels:history`, `groups:history`, `im:history`, `mpim:history`, `users:read`
5. **Events URL:** `https://api.butterbase.ai/v1/{APP_ID}/fn/slack_events`
   - Subscribe to: `app_mention`, `message.channels`, `message.groups`, `message.im`
6. Install the app to your workspace.

---

## Butterbase deploy checklist

1. Apply schema: [`butterbase/schema.json`](butterbase/schema.json)
2. Apply RLS: [`butterbase/rls.json`](butterbase/rls.json)
3. Deploy functions: `npm run deploy:butterbase`
4. Apply Neo4j schema: `npm run neo4j:schema`
5. Deploy frontend: `npm run deploy:frontend`

Set `INGEST_MAX_MESSAGES=500` to cap backfill for demo workspaces.

---

## Demo script

1. Open **https://aws-builder-hackathon.butterbase.dev/signin** → Connect Slack.
2. Watch **/onboarding** — channels and message counts update live.
3. When complete, open **/dashboard** for the workspace digest.
4. In Slack, `@mention` the bot and ask about something from indexed channels.

---

## Project structure

```
savoir/
├── app/                    # Next.js pages (signin, onboarding, dashboard)
├── butterbase/             # Serverless functions + Postgres schema + Neo4j Cypher
├── lib/                    # Frontend session + API helpers
├── pipelines/              # RocketRide pipeline definitions
└── scripts/                # Deploy, Neo4j schema, RocketRide bridge
```

---

## Environment variables

See [`.env.example`](.env.example).

| Group | Variables |
| ----- | --------- |
| Frontend | `NEXT_PUBLIC_BUTTERBASE_*`, `NEXT_PUBLIC_APP_URL` |
| Slack + auth | `SLACK_*`, `SESSION_JWT_SECRET`, `INTERNAL_CRON_SECRET`, `FRONTEND_URL` |
| Neo4j | `NEO4J_*` |
| Inference | `NEBIUS_*` (**active in production**), `OPENAI_API_KEY` (fallback) |
| RocketRide | `ROCKETRIDE_*`, `ROCKETRIDE_WEBHOOK_URL` (optional; unset or unreachable → Kimi inline) |

---

## Agent tooling

See [`AGENTS.md`](./AGENTS.md) for Neo4j + RocketRide MCP setup in Cursor.
