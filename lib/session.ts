const SESSION_KEY = "savoir_session";

export interface SessionData {
  access_token: string;
  job_id?: string;
}

export function saveSession(data: SessionData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export function loadSession(): SessionData | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}

/** Parse #access_token=... from OAuth redirect hash */
export function parseOAuthHash(): SessionData | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const access_token = params.get("access_token");
  if (!access_token) return null;
  return {
    access_token,
    job_id: params.get("job_id") ?? undefined,
  };
}

export function applySessionFromHash(): SessionData | null {
  const parsed = parseOAuthHash();
  if (parsed) {
    saveSession(parsed);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  return parsed;
}
