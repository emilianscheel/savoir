const SESSION_KEY = "savoir_session";

export interface SessionData {
  access_token: string;
  job_id?: string;
}

export function saveSession(data: SessionData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  window.dispatchEvent(new Event("savoir:session-changed"));
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
  window.dispatchEvent(new Event("savoir:session-changed"));
}

/** Parse #access_token=... from OAuth redirect hash (legacy). */
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

/** Parse ?access_token=... from OAuth redirect query (preferred). */
export function parseOAuthQuery(): SessionData | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const access_token = params.get("access_token");
  if (!access_token) return null;
  return {
    access_token,
    job_id: params.get("job_id") ?? undefined,
  };
}

export function parseOAuthParams(): SessionData | null {
  return parseOAuthQuery() || parseOAuthHash();
}

/** Persist session from OAuth redirect and strip tokens from the URL. */
export function applySessionFromUrl(): SessionData | null {
  const parsed = parseOAuthParams();
  if (parsed) {
    saveSession(parsed);
    const url = new URL(window.location.href);
    url.searchParams.delete("access_token");
    url.searchParams.delete("job_id");
    url.hash = "";
    window.history.replaceState(null, "", url.pathname + url.search);
  }
  return parsed;
}

/** @deprecated Use applySessionFromUrl */
export const applySessionFromHash = applySessionFromUrl;
