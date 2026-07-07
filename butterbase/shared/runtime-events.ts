/** Slim runtime for slack_events — faster cold starts for Slack URL verification. */

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

export function requireEnv(ctx: FunctionContext, key: string): string {
  const value = ctx.env[key];
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
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

const SLACK_API = "https://slack.com/api";

export async function slackApi<T>(
  method: string,
  token: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

export function messageId(teamId: string, channelId: string, ts: string): string {
  return `${teamId}:${channelId}:${ts}`;
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

async function neo4jQuery(
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
