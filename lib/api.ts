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
