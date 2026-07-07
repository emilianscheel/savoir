import {
  chatCompletion,
  json,
  neo4jQuery,
  queryNeo4jContext,
  requireEnv,
  slackApi,
  type FunctionContext,
} from "./shared/runtime.js";

async function authorizeInternal(req: Request, ctx: FunctionContext): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  return !!(ctx.env.INTERNAL_CRON_SECRET && auth === `Bearer ${ctx.env.INTERNAL_CRON_SECRET}`);
}

async function findUserDmChannel(token: string, userId: string): Promise<string | null> {
  const list = await slackApi<{ channels?: { id: string; user?: string }[] }>(
    "conversations.list",
    token,
    { types: "im", limit: 200 },
  );
  if (!list.ok || !list.channels) return null;
  return list.channels.find((c) => c.user === userId)?.id ?? null;
}

type SlackBlock = Record<string, unknown>;

async function postBotReply(
  token: string,
  channel: string,
  threadTs: string,
  text: string,
  userId?: string,
  blocks?: SlackBlock[],
): Promise<void> {
  const res = await slackApi("chat.postMessage", token, {
    channel,
    thread_ts: threadTs,
    text,
    blocks: blocks ? JSON.stringify(blocks) : undefined,
  });
  if (res.ok) return;

  if (res.error !== "not_in_channel" || !userId) return;

  const dmChannel = await findUserDmChannel(token, userId);
  if (!dmChannel) return;

  await slackApi("chat.postMessage", token, {
    channel: dmChannel,
    text:
      "I couldn't reply in that channel because I'm not a member. " +
      "Run `/invite @Savoir` there, or read my answer here:\n\n" +
      text,
      blocks: blocks ? JSON.stringify(blocks) : undefined,
  });
}

async function findWorkspace(
  ctx: FunctionContext,
  teamIds: string[],
): Promise<{ bot_access_token: string; ingestion_ready: boolean; graph_team_id: string; workspace_id: string; team_name: string } | null> {
  const ids = [...new Set(teamIds.filter(Boolean))];
  if (ids.length === 0) return null;

  const { rows } = await ctx.db.query(
    `SELECT sw.id, sw.team_name, sw.bot_access_token, sw.slack_team_id,
            bool_or(su.ingestion_status = 'complete') AS ingestion_ready
     FROM slack_workspaces sw
     JOIN slack_users su ON su.slack_workspace_id = sw.id
     WHERE sw.slack_team_id = ANY($1::text[])
     GROUP BY sw.id, sw.team_name, sw.bot_access_token, sw.slack_team_id
     LIMIT 1`,
    [ids],
  );
  const row = rows[0];
  if (!row?.bot_access_token) return null;
  return {
    bot_access_token: row.bot_access_token as string,
    ingestion_ready: row.ingestion_ready === true,
    graph_team_id: row.slack_team_id as string,
    workspace_id: row.id as string,
    team_name: (row.team_name as string) || row.slack_team_id as string,
  };
}


function wantsIntegrationStatus(question: string): boolean {
  return /\b(status|health|integration|integrations|connected|connection|connections|pipeline|sponsors|stack)\b/i.test(
    question,
  );
}

function statusIcon(ok: boolean, warn = false): string {
  if (ok) return "✅";
  if (warn) return "⚠️";
  return "❌";
}

async function getButterbaseStatus(
  ctx: FunctionContext,
  workspaceId: string,
): Promise<{ ok: boolean; line: string; details: string[] }> {
  const { rows: messageRows } = await ctx.db.query(
    `SELECT COUNT(*)::int AS messages,
            COUNT(DISTINCT channel_id)::int AS channels,
            COUNT(*) FILTER (WHERE enrichment_status = 'done')::int AS enriched,
            COUNT(*) FILTER (WHERE neo4j_merged_at IS NOT NULL)::int AS merged
     FROM slack_messages
     WHERE slack_workspace_id = $1`,
    [workspaceId],
  );
  const { rows: jobRows } = await ctx.db.query(
    `SELECT ij.status, ij.fetched_messages, ij.completed_channels, ij.total_channels
     FROM ingestion_jobs ij
     JOIN slack_users su ON su.id = ij.slack_user_id
     WHERE su.slack_workspace_id = $1
     ORDER BY ij.created_at DESC
     LIMIT 1`,
    [workspaceId],
  );

  const counts = messageRows[0] ?? {};
  const job = jobRows[0] ?? {};
  const messages = Number(counts.messages ?? 0);
  const channels = Number(counts.channels ?? 0);
  const enriched = Number(counts.enriched ?? 0);
  const merged = Number(counts.merged ?? 0);
  const jobStatus = String(job.status ?? "no job yet");

  return {
    ok: true,
    line: `${messages} messages from ${channels} chats indexed; latest job: ${jobStatus}`,
    details: [
      `Fetched: ${job.fetched_messages ?? messages} messages`,
      `Channels: ${job.completed_channels ?? 0}/${job.total_channels ?? channels}`,
      `Enriched: ${enriched}`,
      `Merged to Neo4j: ${merged}`,
    ],
  };
}

async function getNeo4jStatus(
  ctx: FunctionContext,
  teamId: string,
): Promise<{ ok: boolean; line: string; details: string[] }> {
  try {
    const rows = await neo4jQuery(
      ctx,
      `
      MATCH (team:Team {slack_team_id: $teamId})
      OPTIONAL MATCH (team)<-[:MEMBER_OF]-(person:Person)
      OPTIONAL MATCH (person)-[:POSTED]->(message:SlackMessage)
      OPTIONAL MATCH (message)-[:MENTIONS]->(topic:Topic)
      RETURN count(DISTINCT person) AS people,
             count(DISTINCT message) AS messages,
             count(DISTINCT topic) AS topics
      `,
      { teamId },
    );
    const row = rows[0] ?? {};
    const people = Number(row.people ?? row["0"] ?? 0);
    const messages = Number(row.messages ?? row["1"] ?? 0);
    const topics = Number(row.topics ?? row["2"] ?? 0);
    return {
      ok: true,
      line: `${people} people, ${messages} Slack messages, ${topics} topics in the graph`,
      details: [
        "Graph query succeeded",
        `Team node: ${teamId}`,
        `Expertise evidence paths available: ${messages > 0 ? "yes" : "not yet"}`,
      ],
    };
  } catch (err) {
    return {
      ok: false,
      line: "Neo4j query failed or credentials are missing",
      details: [err instanceof Error ? err.message.slice(0, 180) : "Unknown Neo4j error"],
    };
  }
}

function getRocketRideStatus(ctx: FunctionContext): { ok: boolean; warn: boolean; line: string; details: string[] } {
  const webhook = ctx.env.ROCKETRIDE_WEBHOOK_URL;
  const token = ctx.env.ROCKETRIDE_TOKEN;
  const auth = ctx.env.ROCKETRIDE_AUTH || ctx.env.ROCKETRIDE_APIKEY;
  const bridge = ctx.env.ROCKETRIDE_BRIDGE_SECRET;

  if (webhook) {
    return {
      ok: true,
      warn: false,
      line: "RocketRide bridge webhook is configured for message enrichment",
      details: [
        `Webhook: ${webhook.replace(/\/[^/]*$/, "/…")}`,
        `Pipeline token: ${token ? "set" : "not set"}`,
        `Cloud auth: ${auth ? "set" : "not set"}`,
      ],
    };
  }

  return {
    ok: false,
    warn: true,
    line: "RocketRide webhook is not configured; enrichment falls back to Nebius/OpenAI inline",
    details: [
      `Bridge secret: ${bridge ? "set" : "not set"}`,
      `Cloud auth: ${auth ? "set" : "not set"}`,
      "Set ROCKETRIDE_WEBHOOK_URL to make RocketRide load-bearing in the demo.",
    ],
  };
}

function fields(title: string, items: string[]): SlackBlock {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${title}*\n${items.map((item) => `• ${item}`).join("\n")}`,
    },
  };
}

function renderIntegrationStatusBlocks(input: {
  teamName: string;
  butterbase: { ok: boolean; line: string; details: string[] };
  neo4j: { ok: boolean; line: string; details: string[] };
  rocketRide: { ok: boolean; warn: boolean; line: string; details: string[] };
}): SlackBlock[] {
  const { teamName, butterbase, neo4j, rocketRide } = input;
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Savoir integration status", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `Workspace: *${teamName}*\n` +
          "`Slack → Butterbase → RocketRide → Neo4j → Slack bot`",
      },
    },
    { type: "divider" },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Butterbase*\n${statusIcon(butterbase.ok)} ${butterbase.line}` },
        { type: "mrkdwn", text: `*Neo4j*\n${statusIcon(neo4j.ok)} ${neo4j.line}` },
        {
          type: "mrkdwn",
          text: `*RocketRide*\n${statusIcon(rocketRide.ok, rocketRide.warn)} ${rocketRide.line}`,
        },
      ],
    },
    fields("Butterbase evidence", butterbase.details),
    fields("Neo4j evidence", neo4j.details),
    fields("RocketRide evidence", rocketRide.details),
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Ask `@Savoir who should I ask about <topic>?` after the graph has indexed messages.",
        },
      ],
    },
  ];
}

async function postIntegrationStatus(
  ctx: FunctionContext,
  workspace: {
    bot_access_token: string;
    graph_team_id: string;
    workspace_id: string;
    team_name: string;
  },
  event: { user?: string; channel?: string; ts?: string; thread_ts?: string },
): Promise<void> {
  const [butterbase, neo4j] = await Promise.all([
    getButterbaseStatus(ctx, workspace.workspace_id),
    getNeo4jStatus(ctx, workspace.graph_team_id),
  ]);
  const rocketRide = getRocketRideStatus(ctx);
  const blocks = renderIntegrationStatusBlocks({
    teamName: workspace.team_name,
    butterbase,
    neo4j,
    rocketRide,
  });
  await postBotReply(
    workspace.bot_access_token,
    event.channel!,
    event.thread_ts || event.ts!,
    `Savoir integration status for ${workspace.team_name}: Butterbase ${butterbase.ok ? "connected" : "not ready"}, Neo4j ${neo4j.ok ? "connected" : "not ready"}, RocketRide ${rocketRide.ok ? "configured" : "needs configuration"}.`,
    event.user,
    blocks,
  );
}

async function answerMention(
  ctx: FunctionContext,
  teamIds: string[],
  event: { text?: string; user?: string; channel?: string; ts?: string; thread_ts?: string },
): Promise<void> {
  const workspace = await findWorkspace(ctx, teamIds);
  if (!workspace) return;

  const question = (event.text || "").replace(/<@[^>]+>/g, "").trim();
  const channel = event.channel!;
  const threadTs = event.thread_ts || event.ts!;
  const token = workspace.bot_access_token;
  const userId = event.user;

  if (!question) {
    await postBotReply(
      token,
      channel,
      threadTs,
      "Ask me something after @Savoir — for example: `@Savoir integration status` or `@Savoir who should I ask about Slack ingestion failures?`",
      userId,
    );
    return;
  }

  if (wantsIntegrationStatus(question)) {
    await postIntegrationStatus(ctx, workspace, event);
    return;
  }

  if (!workspace.ingestion_ready) {
    await postBotReply(
      token,
      channel,
      threadTs,
      "Still indexing your workspace — I'll be able to answer soon.",
      userId,
    );
    return;
  }

  try {
    await postBotReply(token, channel, threadTs, "Searching the workspace…", userId);

    const context = await queryNeo4jContext(ctx, workspace.graph_team_id, question, 10);
    const answer = await chatCompletion(
      ctx,
      "You answer questions about Slack workspace knowledge. Use only the provided context. Be concise: 2-4 sentences unless the user asks for detail. Cite channel when relevant. If unknown, say so.",
      `Context:\n${context}\n\nQuestion: ${question}`,
      { timeoutMs: 28_000, maxTokens: 350 },
    );
    await postBotReply(token, channel, threadTs, answer, userId);
  } catch {
    await postBotReply(
      token,
      channel,
      threadTs,
      "Sorry, I hit an error while looking that up. Please try again in a moment.",
      userId,
    );
  }
}

export default async function handler(req: Request, ctx: FunctionContext): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await authorizeInternal(req, ctx))) return json({ error: "forbidden" }, 403);

  const body = (await req.json()) as {
    team_id?: string;
    context_team_id?: string;
    event?: { text?: string; user?: string; channel?: string; ts?: string; thread_ts?: string };
  };

  if (!body.team_id || !body.event?.channel || !body.event?.ts) {
    return json({ error: "missing_team_or_event" }, 400);
  }

  requireEnv(ctx, "FUNCTIONS_BASE_URL");

  const teamIds = [body.team_id, body.context_team_id].filter(Boolean) as string[];
  ctx.waitUntil(answerMention(ctx, teamIds, body.event));
  return json({ ok: true, queued: true });
}
