/** Nebius/OpenAI-compatible message enrichment (used by bridge fallback). */
export async function enrichMessageText(text, env = process.env) {
  const apiKey = env.NEBIUS_API_KEY || env.OPENAI_API_KEY;
  const baseUrl = (env.NEBIUS_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = env.NEBIUS_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    return { summary: text.slice(0, 200), topics: [] };
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

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return { summary: text.slice(0, 200), topics: [] };

  try {
    const parsed = JSON.parse(content);
    return {
      summary: parsed.summary || text.slice(0, 200),
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
    };
  } catch {
    return { summary: text.slice(0, 200), topics: [] };
  }
}

export function parsePipelineEnrichment(result, slackMessageId) {
  if (!result) return null;
  const blobs = [];
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === "string") {
      blobs.push(v);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (typeof v === "object") walk(Object.values(v));
  };
  walk(result);

  for (const blob of blobs) {
    const trimmed = blob.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.summary) {
        return {
          slack_message_id: parsed.slack_message_id || slackMessageId,
          summary: String(parsed.summary),
          topics: Array.isArray(parsed.topics) ? parsed.topics.map(String) : [],
        };
      }
    } catch {
      /* try next blob */
    }
  }
  return null;
}
