"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../components/AppShell";
import { PageHeader } from "../components/PageHeader";
import { ChannelTable } from "../components/ChannelTable";
import { invokeFunction } from "@/lib/api";
import {
  applySessionFromHash,
  loadSession,
  saveSession,
  type SessionData,
} from "@/lib/session";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";

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
  const [session] = useState<SessionData | null>(
    () => applySessionFromHash() || loadSession()
  );
  const [status, setStatus] = useState<IngestionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    const s = loadSession();
    if (!s?.access_token) {
      setError("Sign in required");
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
    queueMicrotask(() => {
      void poll();
    });
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [poll]);

  const job = status?.job;
  const channelPct =
    job && job.total_channels > 0
      ? Math.round((job.completed_channels / job.total_channels) * 100)
      : 0;
  const isComplete = job?.status === "complete";
  const needsSignIn = !session?.access_token || error === "Sign in required";

  return (
    <AppShell width="md">
      <PageHeader title="Indexing" />

      {needsSignIn && (
        <Alert className="mb-6">
          <AlertTitle>Sign in required</AlertTitle>
          <AlertDescription>
            <Link href="/signin" className="underline underline-offset-4">
              Connect Slack
            </Link>{" "}
            to continue.
          </AlertDescription>
        </Alert>
      )}

      {error && error !== "Sign in required" && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {job && (
        <div className="space-y-6">
          <Progress value={channelPct}>
            <ProgressLabel>Channels</ProgressLabel>
            <ProgressValue>
              {() =>
                `${job.completed_channels} / ${job.total_channels} (${channelPct}%)`
              }
            </ProgressValue>
          </Progress>
          <p className="text-sm text-muted-foreground">
            {job.fetched_messages} messages · {job.status}
          </p>

          <ChannelTable
            mode="progress"
            channels={job.channel_progress || []}
          />

          {isComplete && (
            <Button render={<Link href="/dashboard" />} nativeButton={false}>
              Dashboard
            </Button>
          )}
        </div>
      )}
    </AppShell>
  );
}
