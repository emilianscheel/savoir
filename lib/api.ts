import { loadSession } from "./session";

const appId = process.env.NEXT_PUBLIC_BUTTERBASE_APP_ID!;
const apiUrl = (process.env.NEXT_PUBLIC_BUTTERBASE_API_URL || "https://api.butterbase.ai").replace(
  /\/$/,
  "",
);

function functionsBase(): string {
  return `${apiUrl}/v1/${appId}/fn`;
}

export async function invokeFunction<T>(
  name: string,
  options: { method?: string; query?: Record<string, string>; body?: unknown } = {},
): Promise<T> {
  const session = loadSession();
  const url = new URL(`${functionsBase()}/${name}`);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Function ${name} failed`);
  }
  return data as T;
}

export function oauthStartUrl(step: "workspace" | "user" | "full" = "full"): string {
  return `${functionsBase()}/slack_oauth_start?step=${step}`;
}

export async function exchangeOAuthCode(
  code: string,
  state?: string | null,
): Promise<{ access_token: string; job_id?: string }> {
  const url = new URL(`${functionsBase()}/slack_oauth_callback`);
  url.searchParams.set("code", code);
  url.searchParams.set("json", "1");
  if (state) url.searchParams.set("state", state);

  const res = await fetch(url.toString());
  const data = (await res.json()) as { access_token?: string; job_id?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error || "OAuth exchange failed");
  }
  return { access_token: data.access_token, job_id: data.job_id };
}
