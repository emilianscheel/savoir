#!/usr/bin/env node
/** Verify Nebius Token Factory key, region, and model. */
import { loadEnvLocal } from "./load-env.mjs";

loadEnvLocal();

const apiKey = process.env.NEBIUS_API_KEY;
const baseUrl = (process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.us-central1.nebius.com/v1").replace(/\/$/, "");
const model = process.env.NEBIUS_MODEL || "moonshotai/Kimi-K2.7-Code";

if (!apiKey) {
  console.error("NEBIUS_API_KEY is not set in .env.local");
  process.exit(1);
}

const res = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    messages: [{ role: "user", content: "Say OK" }],
    max_tokens: 16,
  }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`Nebius smoke test failed: ${res.status}`);
  console.error(text.slice(0, 500));
  process.exit(1);
}

let content = text;
try {
  const data = JSON.parse(text);
  content = data.choices?.[0]?.message?.content ?? text;
} catch {
  /* keep raw */
}

console.log(`OK — model=${model}`);
console.log(`Response: ${String(content).slice(0, 120)}`);
