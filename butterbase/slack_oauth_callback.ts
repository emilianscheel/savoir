import {
  frontendUrl,
  json,
  mintSessionJwt,
  redirect,
  requireEnv,
  slackApi,
  type FunctionContext,
} from "./shared/runtime.js";

interface OAuthState {
  step?: string;
  nonce?: string;
  ts?: number;
}

export default async function handler(req: Request, ctx: FunctionContext): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const stateRaw = url.searchParams.get("state");

  if (error) {
    return redirect(frontendUrl(ctx, `/signin?error=${encodeURIComponent(error)}`));
  }
  if (!code) {
    return json({ error: "missing_code" }, 400);
  }

  let state: OAuthState = {};
  try {
    if (stateRaw) state = JSON.parse(atob(stateRaw)) as OAuthState;
  } catch {
    /* ignore */
  }

  const clientId = requireEnv(ctx, "SLACK_CLIENT_ID");
  const clientSecret = requireEnv(ctx, "SLACK_CLIENT_SECRET");
  const redirectUri = requireEnv(ctx, "SLACK_REDIRECT_URI");

  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const oauth = (await tokenRes.json()) as {
    ok: boolean;
    error?: string;
    access_token?: string;
    bot_user_id?: string;
    team?: { id: string; name: string };
    authed_user?: {
      id: string;
      access_token?: string;
      scope?: string;
    };
  };

  if (!oauth.ok || !oauth.team?.id) {
    return redirect(
      frontendUrl(ctx, `/signin?error=${encodeURIComponent(oauth.error || "oauth_failed")}`),
    );
  }

  const teamId = oauth.team.id;
  const teamName = oauth.team.name;

  const { rows: wsRows } = await ctx.db.query(
    `INSERT INTO slack_workspaces (slack_team_id, team_name, bot_user_id, bot_access_token, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (slack_team_id) DO UPDATE SET
       team_name = EXCLUDED.team_name,
       bot_user_id = COALESCE(EXCLUDED.bot_user_id, slack_workspaces.bot_user_id),
       bot_access_token = COALESCE(EXCLUDED.bot_access_token, slack_workspaces.bot_access_token),
       updated_at = now()
     RETURNING id`,
    [teamId, teamName, oauth.bot_user_id ?? null, oauth.access_token ?? null],
  );
  const workspaceId = wsRows[0]?.id as string;

  if (!oauth.authed_user?.id || !oauth.authed_user.access_token) {
    return redirect(
      frontendUrl(ctx, `/signin?workspace=${workspaceId}&step=user_needed`),
    );
  }

  let displayName = oauth.authed_user.id;
  let email: string | null = null;
  const userInfo = await slackApi<{ user?: { real_name?: string; profile?: { email?: string } } }>(
    "users.info",
    oauth.authed_user.access_token,
    { user: oauth.authed_user.id },
  );
  if (userInfo.ok && userInfo.user) {
    displayName = userInfo.user.real_name || displayName;
    email = userInfo.user.profile?.email ?? null;
  }

  const authUserId = crypto.randomUUID();

  const { rows: userRows } = await ctx.db.query(
    `INSERT INTO slack_users (
       butterbase_auth_user_id, slack_workspace_id, slack_user_id,
       display_name, email, ingestion_status, updated_at
     ) VALUES ($1, $2, $3, $4, $5, 'pending', now())
     ON CONFLICT (slack_workspace_id, slack_user_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       email = COALESCE(EXCLUDED.email, slack_users.email),
       updated_at = now()
     RETURNING id, butterbase_auth_user_id`,
    [authUserId, workspaceId, oauth.authed_user.id, displayName, email],
  );

  const slackUserId = userRows[0]?.id as string;
  const butterbaseAuthUserId = userRows[0]?.butterbase_auth_user_id as string;

  await ctx.db.query(
    `INSERT INTO slack_tokens (slack_user_id, user_access_token, scope, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (slack_user_id) DO UPDATE SET
       user_access_token = EXCLUDED.user_access_token,
       scope = EXCLUDED.scope,
       token_version = slack_tokens.token_version + 1,
       updated_at = now()`,
    [slackUserId, oauth.authed_user.access_token, oauth.authed_user.scope ?? null],
  );

  const { rows: existingJobs } = await ctx.db.query(
    `SELECT id FROM ingestion_jobs
     WHERE slack_user_id = $1 AND status IN ('queued', 'running')
     ORDER BY created_at DESC LIMIT 1`,
    [slackUserId],
  );

  let jobId = existingJobs[0]?.id as string | undefined;
  if (!jobId) {
    const { rows: jobRows } = await ctx.db.query(
      `INSERT INTO ingestion_jobs (slack_user_id, status, channel_progress, cursor, started_at)
       VALUES ($1, 'queued', '[]'::jsonb, '{"channel_index":0,"message_cursor":null}'::jsonb, now())
       RETURNING id`,
      [slackUserId],
    );
    jobId = jobRows[0]?.id as string;
  }

  await ctx.db.query(
    `UPDATE slack_users SET ingestion_status = 'running', updated_at = now() WHERE id = $1`,
    [slackUserId],
  );

  ctx.waitUntil(
    fetch(
      `${requireEnv(ctx, "FUNCTIONS_BASE_URL")}/ingest_next_chunk`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${requireEnv(ctx, "INTERNAL_CRON_SECRET")}`,
        },
        body: JSON.stringify({ job_id: jobId }),
      },
    ),
  );

  const sessionToken = await mintSessionJwt(ctx, {
    sub: butterbaseAuthUserId,
    slack_user_id: slackUserId,
    slack_workspace_id: workspaceId,
  });

  return redirect(
    `${frontendUrl(ctx, "/onboarding")}#access_token=${encodeURIComponent(sessionToken)}&job_id=${jobId}`,
  );
}
