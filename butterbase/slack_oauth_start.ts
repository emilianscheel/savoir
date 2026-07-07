import {
  redirect,
  requireEnv,
  type FunctionContext,
} from "./shared/runtime.js";

/** Public-channel demo scopes (Free / Pro / Business+). */
const BOT_SCOPES = [
  "app_mentions:read",
  "chat:write",
  "chat:write.public",
  "channels:read",
].join(",");

const USER_SCOPES = ["channels:history", "channels:read", "users:read"].join(",");

/** Private channels + DMs — requires workspace admin / often Enterprise. */
const BOT_SCOPES_FULL = [
  "app_mentions:read",
  "chat:write",
  "chat:write.public",
  "channels:read",
  "groups:read",
  "im:read",
].join(",");

const USER_SCOPES_FULL = [
  "channels:history",
  "groups:history",
  "im:history",
  "mpim:history",
  "users:read",
].join(",");

function scopesFor(ctx: FunctionContext) {
  const full = ctx.env.SLACK_SCOPE_PROFILE === "full";
  return {
    bot: full ? BOT_SCOPES_FULL : BOT_SCOPES,
    user: full ? USER_SCOPES_FULL : USER_SCOPES,
  };
}

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

  const { bot, user } = scopesFor(ctx);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  if (step === "workspace" || step === "full") {
    params.set("scope", bot);
  }
  if (step === "user" || step === "full") {
    params.set("user_scope", user);
  }
  if (step === "user") {
    params.delete("scope");
  }

  const teamId = ctx.env.SLACK_TEAM_ID || url.searchParams.get("team");
  if (teamId) {
    params.set("team", teamId);
  }

  return redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
}
