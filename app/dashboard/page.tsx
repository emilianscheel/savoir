"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Nav } from "../components/Nav";
import { invokeFunction } from "@/lib/api";
import { loadSession } from "@/lib/session";

interface DashboardData {
  user: { display_name?: string; ingestion_status?: string };
  summary: {
    summary_text: string;
    message_count: number;
    generated_at: string;
  } | null;
  totals: {
    total_messages?: number;
    total_channels?: number;
    earliest_ts?: string;
    latest_ts?: string;
  };
  channels: {
    channel_name: string;
    channel_id: string;
    message_count: number;
    latest_ts: string;
  }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!loadSession()?.access_token) {
      setError("Sign in required");
      return;
    }
    try {
      const result = await invokeFunction<DashboardData>("get_dashboard_data");
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-950 px-6 py-16 font-sans text-zinc-100">
      <main className="w-full max-w-3xl">
        <Nav />
        <h1 className="text-3xl font-semibold tracking-tight">Workspace dashboard</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Summary of indexed Slack messages
          {data?.user?.display_name ? ` for ${data.user.display_name}` : ""}.
        </p>

        {error && (
          <p className="mt-6 text-sm text-amber-300">
            {error}.{" "}
            <Link href="/signin" className="underline">
              Connect Slack
            </Link>
          </p>
        )}

        {data && (
          <div className="mt-8 space-y-8">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Messages", value: data.totals.total_messages ?? 0 },
                { label: "Channels", value: data.totals.total_channels ?? 0 },
                { label: "Status", value: data.user.ingestion_status ?? "—" },
                {
                  label: "Latest",
                  value: data.totals.latest_ts?.slice(0, 10) ?? "—",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-wide text-zinc-500">{stat.label}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{stat.value}</p>
                </div>
              ))}
            </div>

            {data.summary && (
              <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
                <h2 className="text-lg font-medium">Workspace digest</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                  {data.summary.summary_text}
                </p>
                <p className="mt-4 text-xs text-zinc-500">
                  Based on {data.summary.message_count} messages · updated{" "}
                  {new Date(data.summary.generated_at).toLocaleString()}
                </p>
              </section>
            )}

            <section>
              <h2 className="mb-4 text-lg font-medium">By channel</h2>
              <div className="overflow-hidden rounded-xl border border-zinc-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-900/80 text-zinc-400">
                    <tr>
                      <th className="px-4 py-3">Channel</th>
                      <th className="px-4 py-3 text-right">Messages</th>
                      <th className="px-4 py-3 text-right">Latest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.channels.map((ch) => (
                      <tr key={ch.channel_id} className="border-t border-zinc-800/80">
                        <td className="px-4 py-3">#{ch.channel_name || ch.channel_id}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{ch.message_count}</td>
                        <td className="px-4 py-3 text-right text-zinc-500">{ch.latest_ts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
