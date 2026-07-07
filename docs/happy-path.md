# Savoir Happy Path

## Purpose

This document defines the intended end-to-end happy path for Savoir so the team can review the product flow before implementation or demo changes are merged.

The happy path should prove one clear story:

> A Slack workspace connects Savoir, Savoir indexes workspace knowledge, the user sees ingestion progress and a dashboard, and the Slack bot answers with graph-grounded context while showing the sponsor integration stack.

## Scope

This is a product and demo flow document only. It does not introduce code changes.

Included:

- User-facing web flow from landing page to dashboard.
- Slack OAuth and ingestion flow.
- Butterbase, RocketRide, Neo4j, and Slack bot evidence points.
- Review checklist for teammates before opening or reviewing the PR.

Not included:

- Error-state design beyond the existing “connect first” and OAuth error messages.
- Permission-recovery flows for failed Slack scopes.
- Admin setup instructions beyond prerequisites.
- Production hardening, billing, workspace management, or multi-tenant admin UX.


## Happy path at a glance

The happy path should feel like a single guided product story, not a list of infrastructure steps:

```text
Landing page
  → Connect Slack
  → Watch indexing progress
  → Review workspace dashboard
  → Ask Savoir in Slack
  → Show integration status inside Slack
```

| Moment | What the user sees | What Savoir proves |
| --- | --- | --- |
| Landing | A focused promise: “Slack knowledge platform” and one **Get started** button. | Savoir has a clear user-facing value proposition. |
| Sign in | One primary Slack OAuth button, with optional split steps for workspace install and user authorization. | Slack is the source system and the user can connect without manual setup. |
| Onboarding | A live progress bar, message count, channel table, and status updates every few seconds. | Slack history is being ingested into Savoir. |
| Dashboard | Workspace totals, status, latest activity, digest, and channel stats. | Indexed Slack knowledge is visible in the web app. |
| Slack Q&A | A threaded bot reply to a workspace question. | The bot can answer from indexed team context. |
| Integration status | A Slack Block Kit card for Butterbase, RocketRide, Neo4j, and Slack bot evidence. | The sponsor integration stack is observable in the product, not only in code. |

## Storyboard

### Screen 1: Landing page

The landing page should be intentionally minimal. A first-time user should immediately understand three things:

1. This is Savoir.
2. It connects to Slack.
3. It turns Slack history into a queryable knowledge layer.

Expected shape:

```text
[Savoir]
Slack knowledge platform
Connect Slack, index your workspace messages into Neo4j, and ask the bot
questions grounded in your team's conversations.

[Get started →]
```

Primary CTA: **Get started →**

### Screen 2: Slack connection

The sign-in page should make OAuth feel safe and explain why there are two authorization parts.

Expected shape:

```text
[Savoir]
Connect Slack
Two steps: add the Savoir bot to your workspace, then authorize your Slack
account so we can index your channel history.

[Connect Slack (workspace + account)]

[Step 1 — Add bot to workspace] [Step 2 — Authorize your account]
```

Primary CTA: **Connect Slack (workspace + account)**

Success state: Slack redirects back to `/onboarding`; the user does not handle tokens manually.

### Screen 3: Live indexing

The onboarding page should make ingestion feel alive. The user should not wonder whether anything is happening.

Expected shape:

```text
Indexing your Slack
Fetching messages channel by channel. Progress updates every few seconds.

Channels completed                    3 / 12 (25%)
[██████------------------]
428 messages fetched · status: running

| Channel       | Status   | Messages |
| #general      | done     | 180      |
| #engineering  | fetching | 248      |
| #design       | pending  | 0        |
```

Completion state:

```text
[View dashboard →]
```

### Screen 4: Workspace dashboard

The dashboard should answer: “What did Savoir learn from this Slack workspace?”

Expected shape:

```text
Workspace dashboard
Summary of indexed Slack messages for <user>.

[Messages: 1,240] [Channels: 12] [Status: complete] [Latest: 2026-07-07]

Workspace digest
<Generated summary of the workspace knowledge>

By channel
| Channel      | Messages | Latest     |
| #general     | 420      | 2026-07-07 |
| #engineering | 390      | 2026-07-07 |
```

The dashboard is not the final product value by itself. Its job is to prove that Slack data has been indexed before the user asks the bot questions.

### Screen 5: Slack bot answer

After indexing, the user should be able to ask Savoir a practical workspace question in Slack.

Expected user prompt:

```text
@Savoir who should I ask about onboarding?
```

Expected bot behavior:

```text
Savoir replies in the same Slack thread with a graph-grounded answer,
using indexed Slack context rather than a generic answer.
```

The answer should feel like:

- It names the likely person, channel, topic, or thread to inspect.
- It explains why that context was selected.
- It avoids pretending to know things that were not indexed.

### Screen 6: Slack integration status card

The status card is the demo proof surface. It should make the integration stack visible inside Slack.

Expected user prompt:

```text
@Savoir integration status
```

Expected card shape:

```text
Savoir integration status
Workspace: <workspace name>
Slack → Butterbase → RocketRide → Neo4j → Slack bot

Butterbase
✅ 1,240 messages from 12 chats indexed; latest job: complete

Neo4j
✅ 18 people, 1,210 Slack messages, 42 topics in the graph

RocketRide
✅ RocketRide bridge webhook is configured for message enrichment

Butterbase evidence
• Fetched: 1,240 messages
• Channels: 12/12
• Enriched: 1,210
• Merged to Neo4j: 1,210

Neo4j evidence
• Graph query succeeded
• Team node: <team id>
• Expertise evidence paths available: yes

RocketRide evidence
• Webhook: configured
• Pipeline token: set
• Cloud auth: set
```

If RocketRide is not configured, the happy-path PR should not hide it. The status card should show a warning and explain that enrichment is falling back to the inline model path.

## Preconditions

Before the happy path starts, the environment should already be configured:

1. The Slack app exists and has the required OAuth redirect URL and event subscription URL.
2. Butterbase schema, RLS policies, and serverless functions are deployed.
3. Function environment variables are set for Slack, session JWTs, Butterbase URLs, Neo4j, Nebius or OpenAI-compatible inference, and optional RocketRide routing.
4. The Neo4j graph schema has been applied.
5. The frontend is deployed or running locally with `NEXT_PUBLIC_BUTTERBASE_*` values.
6. For a fast demo, ingestion may be capped with `INGEST_MAX_MESSAGES`.

## Primary happy path

### 1. User lands on Savoir

**Entry point:** `/`

The user sees Savoir presented as a Slack knowledge platform. The page explains the core value in one sentence: connect Slack, index workspace messages into Neo4j, and ask questions grounded in team conversations.

**User action:** Click **Get started**.

**Expected result:** The user moves to the Slack connection page.

### 2. User connects Slack

**Entry point:** `/signin`

The user sees one primary call to action: **Connect Slack (workspace + account)**.

The copy should make the two OAuth responsibilities explicit:

1. Add the Savoir bot to the Slack workspace.
2. Authorize the user account so Savoir can fetch channel history.

**User action:** Click **Connect Slack (workspace + account)** and approve Slack OAuth.

**Expected backend result:**

- `slack_oauth_start` redirects the user to Slack OAuth.
- `slack_oauth_callback` stores or updates the Slack workspace.
- The authenticated Slack user and user token are stored.
- An ingestion job is created or reused.
- A short-lived Savoir session token is minted.
- The browser is redirected to `/onboarding` with the session token and job ID in the URL hash.

**Expected user result:** The user lands on onboarding without manually copying tokens or IDs.

### 3. Savoir starts indexing Slack

**Entry point:** `/onboarding`

The onboarding page reads the session token, stores it locally, and polls ingestion status every few seconds.

**Expected backend result:**

- `ingest_next_chunk` fetches Slack channels and channel history in resumable chunks.
- Messages are inserted into Butterbase-backed storage.
- Each message is routed for enrichment.
- Enriched messages are merged into Neo4j as graph evidence.
- The ingestion job updates channel progress, completed channel count, and fetched message count.

**Expected user result:** The user sees live progress:

- Channels completed.
- Total channels.
- Fetched message count.
- Per-channel status.
- Per-channel message count.

**Completion condition:** When ingestion status becomes `complete`, the user sees **View dashboard**.

### 4. User reviews the workspace dashboard

**Entry point:** `/dashboard`

The dashboard summarizes indexed Slack knowledge for the authenticated user.

**Expected backend result:**

- `get_dashboard_data` validates the session.
- It returns the user ingestion status.
- It returns workspace totals.
- It returns channel-level message statistics.
- If available, it returns the generated workspace summary.

**Expected user result:** The user can review:

- Total indexed messages.
- Total indexed channels.
- Current ingestion status.
- Latest indexed activity date.
- Workspace digest.
- Per-channel message counts and latest activity.

**Success signal:** The dashboard makes it obvious that Slack data has moved from OAuth into an indexed Savoir workspace view.

### 5. User asks the Slack bot about indexed knowledge

**Entry point:** Slack app mention, direct message, or supported thread reply.

**User action:** Ask a graph-grounded question, for example:

```text
@Savoir who should I ask about onboarding?
```

**Expected backend result:**

- `slack_events` verifies the Slack request signature and quickly acknowledges Slack.
- The event is delegated to `slack_bot_answer`.
- `slack_bot_answer` finds the workspace and checks ingestion readiness.
- The bot queries Neo4j for relevant context.
- The answer is generated with the configured OpenAI-compatible model path.
- The bot posts a threaded Slack reply.

**Expected user result:** The user receives an answer that is grounded in indexed workspace messages rather than a generic chatbot response.

### 6. User proves the sponsor integration stack inside Slack

**Entry point:** Slack app mention.

**User action:** Ask for integration status, for example:

```text
@Savoir integration status
@Savoir health
@Savoir connected stack
@Savoir pipeline status
```

**Expected backend result:**

- The bot recognizes the status intent.
- Butterbase status is read from indexed messages, channels, enrichment count, and Neo4j merge count.
- Neo4j status is read from graph counts for people, Slack messages, and topics.
- RocketRide status is read from bridge-related environment configuration.

**Expected user result:** The bot posts a Slack Block Kit status card showing:

- Workspace name.
- Pipeline: `Slack → Butterbase → RocketRide → Neo4j → Slack bot`.
- Butterbase evidence.
- Neo4j evidence.
- RocketRide evidence.
- A prompt to ask a graph-grounded follow-up question.

**Success signal:** A teammate or judge can see the integration stack from inside Slack without reading terminal logs or source code.

## End-to-end demo script

Use this sequence for a clean review or hackathon demo:

1. Open Savoir at `/`.
2. Click **Get started**.
3. Click **Connect Slack (workspace + account)**.
4. Approve Slack OAuth.
5. Watch `/onboarding` until channels and messages are visible.
6. Click **View dashboard** after ingestion completes.
7. Confirm dashboard totals and channel stats are populated.
8. In Slack, ask:

   ```text
   @Savoir integration status
   ```

9. Confirm the status card shows Butterbase, RocketRide, Neo4j, and Slack bot evidence.
10. Ask a graph-grounded question, such as:

    ```text
    @Savoir who should I ask about onboarding?
    ```

11. Confirm the bot replies in Slack using indexed workspace context.

## Product acceptance criteria

The happy path is working when all of the following are true:

- The web flow has a single obvious path: `/` → `/signin` → `/onboarding` → `/dashboard`.
- Slack OAuth does not require manual token handling by the user.
- Onboarding visibly updates while ingestion is running.
- Dashboard content is based on the authenticated user’s indexed Slack workspace.
- Slack bot answers are triggered from Slack events and posted back into Slack.
- The integration status card exposes Butterbase, RocketRide, Neo4j, and Slack bot evidence in one place.
- The demo can be understood by a teammate who has not read the source code.

## PR review checklist

Before opening a PR for this happy path, reviewers should confirm:

- The PR is limited to happy-path product documentation unless code changes are intentionally added later.
- The happy path matches current route names and function names.
- The flow does not overclaim unsupported behavior.
- Sponsor integrations are described as observable evidence, not just implementation details.
- Out-of-scope items remain out of scope for this PR.
