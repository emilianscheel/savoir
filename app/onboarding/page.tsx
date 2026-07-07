"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Nav } from "../components/Nav";
import { invokeFunction } from "@/lib/api";
import {
  applySessionFromHash,
  loadSession,
  saveSession,
  type SessionData,
} from "@/lib/session";

interface ChannelProgress {
  channel_id: string;
  name: string;
  status: "pending" | "fetching" | "done" | "error";
  fetched: number;
}

interface IngestionStatus {
  user: { id: string; ingestion_status: string };
  job: {
    id: string;
    status: string;
    total_channels: number;
    completed_channels: number;
    fetched_messages: number;
    channel_progress: ChannelProgress[];
    error?: string;
  };
}

export default function OnboardingPage() {
  const [session] = useState<SessionData | null>(() => applySessionFromHash() || loadSession());
  const [status, setStatus] = useState<IngestionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    const s = loadSession();
    if (!s?.access_token) {
      setError("Not signed in. Connect Slack first.");
      return;
    }
    try {
      const data = await invokeFunction<IngestionStatus>("get_ingestion_status", {
        query: s.job_id ? { job_id: s.job_id } : {},
      });
      setStatus(data);
      setError(null);
      if (s.job_id !== data.job.id) {
        saveSession({ ...s, job_id: data.job.id });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(poll);
    const id = setInterval(() => {
      void poll();
    }, 2000);
    return () => clearInterval(id);
  }, [poll, session]);

  const job = status?.job;
  const channelPct =
    job && job.total_channels > 0
      ? Math.round((job.completed_channels / job.total_channels) * 100)
      : 0;
  const isComplete = job?.status === "complete";

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-950 px-6 py-16 font-sans text-zinc-100">
      <main className="w-full max-w-2xl">
        <Nav />
        <h1 className="text-3xl font-semibold tracking-tight">Indexing your Slack</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Fetching messages channel by channel. Progress updates every few seconds.
        </p>

        {!session?.access_token && (
          <p className="mt-6 text-amber-300">
            No session.{" "}
            <Link href="/signin" className="underline">
              Connect Slack
            </Link>
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {job && (
          <div className="mt-8 space-y-6">
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-zinc-400">Channels completed</span>
                <span>
                  {job.completed_channels} / {job.total_channels} ({channelPct}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all duration-500"
                  style={{ width: `${channelPct}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-zinc-500">
                {job.fetched_messages} messages fetched · status: {job.status}
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-900/80 text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Channel</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {(job.channel_progress || []).map((ch) => (
                    <tr key={ch.channel_id} className="border-t border-zinc-800/80">
                      <td className="px-4 py-3">#{ch.name || ch.channel_id}</td>
                      <td className="px-4 py-3 capitalize text-zinc-400">{ch.status}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{ch.fetched}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isComplete && (
              <Link
                href="/dashboard"
                className="inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
              >
                View dashboard →
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
