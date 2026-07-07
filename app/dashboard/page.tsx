"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "../components/AppShell";
import { PageHeader } from "../components/PageHeader";
import { ChannelTable } from "../components/ChannelTable";
import { invokeFunction } from "@/lib/api";
import { loadSession } from "@/lib/session";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!loadSession()?.access_token) {
      setError("Sign in required");
      setLoading(false);
      return;
    }
    try {
      const result = await invokeFunction<DashboardData>("get_dashboard_data");
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const description = data?.user?.display_name
    ? `Hi, ${data.user.display_name}`
    : undefined;

  return (
    <AppShell>
      <PageHeader title="Dashboard" description={description} />

      {error && (
        <Alert className="mb-6">
          <AlertTitle>Sign in required</AlertTitle>
          <AlertDescription>
            <Link href="/signin" className="underline underline-offset-4">
              Connect Slack
            </Link>{" "}
            to view your dashboard.
          </AlertDescription>
        </Alert>
      )}

      {loading && !error && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {data && (
        <div className="space-y-8">
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
              <Card key={stat.label} size="sm">
                <CardHeader>
                  <CardDescription>{stat.label}</CardDescription>
                  <CardTitle className="text-lg tabular-nums">{stat.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          {data.summary && (
            <Card>
              <CardHeader>
                <CardTitle>Digest</CardTitle>
                <CardDescription>
                  {data.summary.message_count} messages · updated{" "}
                  {new Date(data.summary.generated_at).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {data.summary.summary_text}
                </p>
              </CardContent>
            </Card>
          )}

          <section>
            <h2 className="mb-4 text-lg font-medium">By channel</h2>
            <ChannelTable mode="stats" channels={data.channels} />
          </section>
        </div>
      )}
    </AppShell>
  );
}
