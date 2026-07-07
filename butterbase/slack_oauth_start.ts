import {
  redirect,
  requireEnv,
  type FunctionContext,
} from "./shared/runtime.js";

const BOT_SCOPES = [
  "app_mentions:read",
  "chat:write",
  "channels:read",
  "groups:read",
  "im:read",
].join(",");

const USER_SCOPES = [
  "channels:history",
  "groups:history",
  "im:history",
  "mpim:history",
  "users:read",
].join(",");

export default async function handler(req: Request, ctx: FunctionContext): Promise<Response> {
  const url = new URL(req.url);
  const step = url.searchParams.get("step") || "full";

  const clientId = requireEnv(ctx, "SLACK_CLIENT_ID");
  const redirectUri = requireEnv(ctx, "SLACK_REDIRECT_URI");

  const state = btoa(
    JSON.stringify({
      step,
      nonce: crypto.randomUUID(),
      ts: Date.now(),
    }),
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  if (step === "workspace" || step === "full") {
    params.set("scope", BOT_SCOPES);
  }
  if (step === "user" || step === "full") {
    params.set("user_scope", USER_SCOPES);
  }
  if (step === "user") {
    params.delete("scope");
  }

  return redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
}
