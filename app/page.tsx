"use client";

import { useCallback, useEffect, useState } from "react";
import { butterbase, type Account } from "@/lib/butterbase";

type LookupResult =
  | { kind: "found"; account: Pick<Account, "id" | "plan" | "status"> }
  | { kind: "not_found"; email: string }
  | { kind: "error"; message: string };

function StatusPill({ status }: { status: string }) {
  const styles =
    status === "active"
      ? "bg-emerald-500/15 text-emerald-400"
      : status === "suspended"
        ? "bg-red-500/15 text-red-400"
        : "bg-zinc-500/15 text-zinc-400";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${styles}`}>
      {status}
    </span>
  );
}

export default function Home() {
  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    const { data, error } = await butterbase
      .from<Account>("accounts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      setAccountsError(typeof error === "string" ? error : "Failed to load accounts");
    } else {
      setAccountsError(null);
      setAccounts(data ?? []);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setResult(null);
    try {
      const { data, error } = await butterbase.functions.invoke("lookup_account", {
        method: "POST",
        body: { email: email.trim() },
      });
      if (error) {
        setResult({ kind: "error", message: String(error) });
      } else if (data && typeof data === "object" && "id" in data) {
        setResult({ kind: "found", account: data as Pick<Account, "id" | "plan" | "status"> });
      } else {
        setResult({ kind: "not_found", email: email.trim() });
      }
    } catch (err) {
      setResult({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-950 px-6 py-16 font-sans text-zinc-100">
      <main className="w-full max-w-2xl">
        <span className="mb-4 inline-block rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-amber-300">
          HackwithBay 3.0
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Account Console</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Next.js + Butterbase. The lookup calls the deployed{" "}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-amber-300">
            lookup_account
          </code>{" "}
          serverless function; the table below reads the{" "}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-amber-300">
            accounts
          </code>{" "}
          table through the auto-generated data API.
        </p>

        <form onSubmit={handleLookup} className="mt-8 flex gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm outline-none transition-colors focus:border-amber-400"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-300 disabled:cursor-wait disabled:opacity-50"
          >
            {searching ? "Searching…" : "Look up"}
          </button>
        </form>

        {result && (
          <div
            className={`mt-4 rounded-lg border p-4 text-sm ${
              result.kind === "found"
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-red-500/30 bg-red-500/5"
            }`}
          >
            {result.kind === "found" && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
                <dt className="text-zinc-400">Account ID</dt>
                <dd className="font-mono break-all">{result.account.id}</dd>
                <dt className="text-zinc-400">Plan</dt>
                <dd className="font-mono">{result.account.plan}</dd>
                <dt className="text-zinc-400">Status</dt>
                <dd>
                  <StatusPill status={result.account.status} />
                </dd>
              </dl>
            )}
            {result.kind === "not_found" && (
              <p className="font-medium text-red-400">No account found for {result.email}</p>
            )}
            {result.kind === "error" && (
              <p className="font-medium text-red-400">Request failed: {result.message}</p>
            )}
          </div>
        )}

        <section className="mt-12">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">All accounts</h2>
            <button
              onClick={loadAccounts}
              className="rounded-md border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500"
            >
              Refresh
            </button>
          </div>
          {accountsError ? (
            <p className="text-sm text-red-400">{accountsError}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-4 py-2.5">Email</th>
                    <th className="px-4 py-2.5">Plan</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {accounts.map((a) => (
                    <tr key={a.id} className="hover:bg-zinc-900/60">
                      <td className="px-4 py-2.5 font-mono">{a.email}</td>
                      <td className="px-4 py-2.5">{a.plan}</td>
                      <td className="px-4 py-2.5">
                        <StatusPill status={a.status} />
                      </td>
                      <td className="px-4 py-2.5 text-zinc-400">
                        {new Date(a.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {accounts.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                        Loading accounts…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="mt-10 text-center text-xs text-zinc-600">
          Butterbase app <code className="font-mono">app_y6dtsszb47za</code> · us-west-2
        </footer>
      </main>
    </div>
  );
}
