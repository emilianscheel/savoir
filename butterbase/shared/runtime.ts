/**
 * Shared runtime helpers for Butterbase serverless functions.
 * Deploy functions with access to this module (same butterbase/ directory).
 */

export type FunctionContext = {
  db: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  };
  env: Record<string, string>;
  user: { id: string } | null;
  waitUntil: (promise: Promise<unknown>) => void;
  idempotency: {
    claim: (key: string, opts?: { scope?: string; ttlSeconds?: number }) => Promise<boolean>;
  };
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function redirect(url: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: url } });
}

export function requireEnv(ctx: FunctionContext, key: string): string {
  const value = ctx.env[key];
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

// --- Session JWT (HS256, minimal) ---

function base64UrlEncode(data: Uint8Array | string): string {
  const str = typeof data === "string" ? data : String.fromCharCode(...data);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded + "==".slice(0, (4 - (padded.length % 4)) % 4));
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(sig));
}

export interface SessionPayload {
  sub: string;
  slack_user_id: string;
  slack_workspace_id: string;
  exp: number;
}

export async function mintSessionJwt(
  ctx: FunctionContext,
  payload: Omit<SessionPayload, "exp">,
  ttlSeconds = 86400 * 7,
): Promise<string> {
  const secret = requireEnv(ctx, "SESSION_JWT_SECRET");
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  );
  const sig = await hmacSign(`${header}.${body}`, secret);
  return `${header}.${body}.${sig}`;
}

export async function verifySessionJwt(
  ctx: FunctionContext,
  token: string,
): Promise<SessionPayload | null> {
  try {
    const secret = requireEnv(ctx, "SESSION_JWT_SECRET");
    const [header, body, sig] = token.split(".");
    if (!header || !body || !sig) return null;
    const expected = await hmacSign(`${header}.${body}`, secret);
    if (expected !== sig) return null;
    const payload = JSON.parse(base64UrlDecode(body)) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export async function requireSession(
  ctx: FunctionContext,
  req: Request,
): Promise<SessionPayload> {
  const token = getBearerToken(req);
  if (!token) throw new Error("Unauthorized");
  const session = await verifySessionJwt(ctx, token);
  if (!session) throw new Error("Invalid session");
  return session;
}

// --- Slack API ---

const SLACK_API = "https://slack.com/api";

export async function slackApi<T>(
  method: string,
  token: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T & { ok: boolean; error?: string }> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) body.set(k, String(v));
  }
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return res.json() as Promise<T & { ok: boolean; error?: string }>;
}

export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  const fiveMinutes = 60 * 5;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > fiveMinutes) return false;
  // Sync HMAC not available in all runtimes — use async version in slack_events
  return false;
}

export async function verifySlackSignatureAsync(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string,
): Promise<boolean> {
  const fiveMinutes = 60 * 5;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > fiveMinutes) return false;
  const base = `v0:${timestamp}:${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return signature === `v0=${hex}`;
}

export interface SlackChannel {
  id: string;
  name?: string;
  is_im?: boolean;
  is_mpim?: boolean;
  is_private?: boolean;
}

export function messageId(teamId: string, channelId: string, ts: string): string {
  return `${teamId}:${channelId}:${ts}`;
}

// --- Nebius / OpenAI-compatible LLM ---

export interface EnrichmentResult {
  summary: string;
  topics: string[];
}

export async function enrichMessage(
  ctx: FunctionContext,
  text: string,
): Promise<EnrichmentResult> {
  const apiKey = ctx.env.NEBIUS_API_KEY || ctx.env.OPENAI_API_KEY;
  const baseUrl = (ctx.env.NEBIUS_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = ctx.env.NEBIUS_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    return { summary: text.slice(0, 200), topics: [] };
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Summarize the Slack message and extract 0-5 topic tags. Reply JSON: {"summary":"...","topics":["..."]}',
        },
        { role: "user", content: text },
      ],
    }),
  });

  if (!res.ok) {
    return { summary: text.slice(0, 200), topics: [] };
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return { summary: text.slice(0, 200), topics: [] };
  try {
    const parsed = JSON.parse(content) as EnrichmentResult;
    return {
      summary: parsed.summary || text.slice(0, 200),
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
    };
  } catch {
    return { summary: text.slice(0, 200), topics: [] };
  }
}

export type RoutedEnrichment = EnrichmentResult & { deferred?: boolean };

/** Enrich inline (Nebius) or hand off to RocketRide webhook when ROCKETRIDE_WEBHOOK_URL is set. */
export async function routeMessageEnrichment(
  ctx: FunctionContext,
  row: Record<string, unknown>,
): Promise<RoutedEnrichment> {
  const webhook = ctx.env.ROCKETRIDE_WEBHOOK_URL;
  if (webhook) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (ctx.env.ROCKETRIDE_AUTH) {
      headers.Authorization = `Bearer ${ctx.env.ROCKETRIDE_AUTH}`;
    }
    const res = await fetch(webhook, {
      method: "POST",
      headers,
      body: JSON.stringify({
        slack_message_id: row.slack_message_id,
        text: row.text,
        channel_name: row.channel_name,
        merge_callback_url: `${requireEnv(ctx, "FUNCTIONS_BASE_URL")}/enrich_and_merge`,
      }),
    });
    if (res.ok) return { summary: "", topics: [], deferred: true };
  }
  return enrichMessage(ctx, (row.text as string) || "");
}

export async function chatCompletion(
  ctx: FunctionContext,
  system: string,
  user: string,
): Promise<string> {
  const apiKey = ctx.env.NEBIUS_API_KEY || ctx.env.OPENAI_API_KEY;
  const baseUrl = (ctx.env.NEBIUS_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = ctx.env.NEBIUS_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    return "I don't have an LLM API key configured yet. Please set NEBIUS_API_KEY or OPENAI_API_KEY.";
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(55_000),
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    return "Sorry, I couldn't generate an answer right now.";
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() || "No answer generated.";
}

// --- Neo4j HTTP Query API v2 ---

export async function neo4jQuery(
  ctx: FunctionContext,
  statement: string,
  parameters: Record<string, unknown> = {},
): Promise<Record<string, unknown>[]> {
  const uri = requireEnv(ctx, "NEO4J_URI");
  const username = requireEnv(ctx, "NEO4J_USERNAME");
  const password = requireEnv(ctx, "NEO4J_PASSWORD");
  const database = ctx.env.NEO4J_DATABASE || "neo4j";

  const host = uri.replace(/^neo4j(\+s)?:\/\//, "").replace(/\/$/, "");
  const url = `https://${host}/db/${database}/query/v2`;

  const auth = btoa(`${username}:${password}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ statement, parameters }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Neo4j query failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as { data?: { values?: unknown[][] } };
  return (data.data?.values ?? []).map((row) => {
    const obj: Record<string, unknown> = {};
    row.forEach((v, i) => {
      obj[String(i)] = v;
    });
    return obj;
  });
}

export interface MergeMessageInput {
  teamId: string;
  teamName: string;
  slackUserId: string;
  authorName: string;
  authorEmail?: string;
  messageId: string;
  channelId: string;
  channelName: string;
  text: string;
  ts: string;
  threadTs?: string;
  summary?: string;
  topics?: string[];
}

export async function mergeMessageToNeo4j(
  ctx: FunctionContext,
  msg: MergeMessageInput,
): Promise<void> {
  const topics = msg.topics ?? [];
  await neo4jQuery(
    ctx,
    `
    MERGE (team:Team {slack_team_id: $teamId})
    ON CREATE SET team.name = $teamName
    ON MATCH SET team.name = coalesce(team.name, $teamName)
    MERGE (person:Person {slack_user_id: $slackUserId})
    ON CREATE SET person.name = $authorName, person.email = $authorEmail
    ON MATCH SET person.name = coalesce(person.name, $authorName)
    MERGE (person)-[:MEMBER_OF]->(team)
    MERGE (m:SlackMessage {id: $messageId})
    SET m.text = $text, m.ts = $ts, m.channel_id = $channelId,
        m.channel_name = $channelName, m.summary = $summary
    MERGE (person)-[:POSTED {at: $ts}]->(m)
    `,
    {
      teamId: msg.teamId,
      teamName: msg.teamName,
      slackUserId: msg.slackUserId,
      authorName: msg.authorName,
      authorEmail: msg.authorEmail ?? null,
      messageId: msg.messageId,
      channelId: msg.channelId,
      channelName: msg.channelName,
      text: msg.text,
      ts: msg.ts,
      summary: msg.summary ?? null,
      topics,
    },
  );

  if (topics.length > 0) {
    await neo4jQuery(
      ctx,
      `
      MATCH (m:SlackMessage {id: $messageId})
      UNWIND $topics AS topicName
      MERGE (t:Topic {name: topicName})
      MERGE (m)-[:MENTIONS]->(t)
      `,
      { messageId: msg.messageId, topics },
    );
  }

  if (msg.threadTs) {
    const parentId = messageId(msg.teamId, msg.channelId, msg.threadTs);
    await neo4jQuery(
      ctx,
      `
      MATCH (child:SlackMessage {id: $childId})
      MERGE (parent:SlackMessage {id: $parentId})
      MERGE (child)-[:REPLIES_TO]->(parent)
      `,
      { childId: msg.messageId, parentId },
    );
  }
}

export async function queryNeo4jContext(
  ctx: FunctionContext,
  teamId: string,
  question: string,
  limit = 50,
): Promise<string> {
  const keywords = question
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3)
    .slice(0, 8);

  const rows = await neo4jQuery(
    ctx,
    `
    MATCH (team:Team {slack_team_id: $teamId})<-[:MEMBER_OF]-(person:Person)-[:POSTED]->(m:SlackMessage)
    WHERE any(k IN $keywords WHERE toLower(m.text) CONTAINS k)
       OR size($keywords) = 0
    OPTIONAL MATCH (m)-[:MENTIONS]->(t:Topic)
    WITH m, person, collect(DISTINCT t.name) AS topics
    RETURN m.channel_name AS channel, m.ts AS ts, person.name AS author,
           coalesce(m.summary, m.text) AS content, topics
    ORDER BY m.ts DESC
    LIMIT $limit
    `,
    { teamId, keywords, limit },
  );

  if (rows.length === 0) {
    const fallback = await neo4jQuery(
      ctx,
      `
      MATCH (team:Team {slack_team_id: $teamId})<-[:MEMBER_OF]-(person:Person)-[:POSTED]->(m:SlackMessage)
      RETURN m.channel_name AS channel, m.ts AS ts, person.name AS author,
             coalesce(m.summary, m.text) AS content
      ORDER BY m.ts DESC
      LIMIT $limit
      `,
      { teamId, limit: 20 },
    );
    return formatContext(fallback);
  }

  return formatContext(rows);
}

function formatContext(rows: Record<string, unknown>[]): string {
  return rows
    .map((r) => {
      const channel = r.channel ?? r["0"] ?? "unknown";
      const ts = r.ts ?? r["1"] ?? "";
      const author = r.author ?? r["2"] ?? "";
      const content = r.content ?? r["3"] ?? "";
      return `[#${channel} | ${ts} | ${author}] ${content}`;
    })
    .join("\n");
}

export function ingestMaxMessages(ctx: FunctionContext): number {
  return Number(ctx.env.INGEST_MAX_MESSAGES || "500");
}

export function frontendUrl(ctx: FunctionContext, path: string): string {
  const base = ctx.env.FRONTEND_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}
