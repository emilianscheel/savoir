"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Progress,
    ProgressLabel,
    ProgressValue,
} from "@/components/ui/progress";
import { invokeFunction } from "@/lib/api";
import {
    applySessionFromUrl,
    loadSession,
    saveSession,
    type SessionData,
} from "@/lib/session";
import {
    CheckCircle2,
    Hash,
    Link2,
    Loader2,
    MessageSquare,
    Radio,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { ChannelTable } from "../components/ChannelTable";
import {
    IndexingMessageFeed,
    type IndexingMessage,
} from "../components/IndexingMessageFeed";
import { PageHeader } from "../components/PageHeader";

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
    recent_messages?: IndexingMessage[];
    enrichment_totals?: Record<string, number>;
}

function readClientSession(): SessionData | null {
    if (typeof window === "undefined") return null;
    return applySessionFromUrl() || loadSession();
}

function jobStatusLabel(status: string | undefined): string {
    switch (status) {
        case "queued":
            return "Starting ingestion";
        case "running":
            return "Indexing in progress";
        case "complete":
            return "Indexing complete";
        case "error":
        case "failed":
            return "Indexing paused";
        default:
            return "Preparing";
    }
}

function StatCard({
    label,
    value,
    icon: Icon,
}: {
    label: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
}) {
    return (
        <Card size="sm">
            <CardHeader className="pb-0">
                <div className="flex items-center justify-between gap-2">
                    <CardDescription>{label}</CardDescription>
                    <Icon className="size-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
            </CardHeader>
        </Card>
    );
}

export default function OnboardingPage() {
    const [hydrated, setHydrated] = useState(false);
    const [session, setSession] = useState<SessionData | null>(null);
    const [status, setStatus] = useState<IngestionStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [polling, setPolling] = useState(false);

    useLayoutEffect(() => {
        const next = readClientSession();
        setSession(next);
        setHydrated(true);
    }, []);

    const poll = useCallback(async () => {
        const s = loadSession();
        if (!s?.access_token) {
            setSession(null);
            return;
        }

        setSession(s);
        setPolling(true);

        try {
            const data = await invokeFunction<IngestionStatus>(
                "get_ingestion_status",
                {
                    query: s.job_id ? { job_id: s.job_id } : {},
                },
            );
            setStatus(data);
            setError(null);
            if (s.job_id !== data.job.id) {
                saveSession({ ...s, job_id: data.job.id });
                setSession({ ...s, job_id: data.job.id });
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setPolling(false);
        }
    }, []);

    useEffect(() => {
        if (!hydrated || !session?.access_token) return;
        void poll();
        const id = setInterval(poll, 2000);
        return () => clearInterval(id);
    }, [hydrated, session?.access_token, poll]);

    const signedIn = hydrated && !!session?.access_token;
    const job = status?.job;
    const recentMessages = status?.recent_messages ?? [];
    const channelPct =
        job && job.total_channels > 0
            ? Math.round((job.completed_channels / job.total_channels) * 100)
            : 0;
    const isComplete = job?.status === "complete";
    const isRunning = job?.status === "running" || job?.status === "queued";
    const activeChannel = job?.channel_progress?.find(
        (ch) => ch.status === "fetching",
    );
    const messageCount = job?.fetched_messages ?? recentMessages.length;

    if (!hydrated) {
        return (
            <AppShell>
                <PageHeader
                    title="Indexing your workspace"
                    description="Saving your Slack session…"
                />
                <Card>
                    <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" />
                        <span>Connecting…</span>
                    </CardContent>
                </Card>
            </AppShell>
        );
    }

    if (!signedIn) {
        return (
            <AppShell>
                <PageHeader
                    title="Indexing"
                    description="Connect Slack once — this page tracks ingestion after you authorize."
                />
                <Card className="overflow-hidden">
                    <CardHeader>
                        <div className="flex items-start gap-4">
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#4A154B]/10 text-[#4A154B]">
                                <Link2 className="size-6" />
                            </div>
                            <div className="space-y-1">
                                <CardTitle>
                                    Connect Slack to start indexing
                                </CardTitle>
                                <CardDescription>
                                    Open the app at{" "}
                                    <a
                                        href="https://aws-builder-hackathon.butterbase.dev/signin"
                                        className="underline underline-offset-4"
                                    >
                                        aws-builder-hackathon.butterbase.dev/signin
                                    </a>{" "}
                                    so your session and styles load correctly
                                    after OAuth.
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Button
                            className="bg-[#4A154B] hover:bg-[#611f69]"
                            render={<Link href="/signin" />}
                            nativeButton={false}
                        >
                            Connect Slack
                        </Button>
                    </CardContent>
                </Card>
            </AppShell>
        );
    }

    return (
        <AppShell>
            <PageHeader
                title="Indexing your workspace"
                description={
                    isComplete
                        ? "Your Slack history is indexed and ready to explore."
                        : "Importing channels and messages — updates every 2 seconds."
                }
            />

            <div className="space-y-6">
                <Card>
                    <CardHeader className="border-b">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                                <CardTitle className="flex items-center gap-2">
                                    <span
                                        className={`inline-flex size-2 rounded-full ${
                                            isComplete
                                                ? "bg-emerald-500"
                                                : isRunning || polling
                                                  ? "animate-pulse bg-sky-500"
                                                  : "bg-muted-foreground"
                                        }`}
                                        aria-hidden
                                    />
                                    Slack connected
                                </CardTitle>
                                <CardDescription>
                                    Session active · ingestion running in the
                                    background
                                </CardDescription>
                            </div>
                            <Badge
                                variant={isComplete ? "secondary" : "default"}
                                className={
                                    isComplete
                                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                        : ""
                                }
                            >
                                {isComplete ? (
                                    <>
                                        <CheckCircle2 data-icon="inline-start" />
                                        Ready
                                    </>
                                ) : isRunning || polling ? (
                                    <>
                                        <Loader2
                                            data-icon="inline-start"
                                            className="animate-spin"
                                        />
                                        Live
                                    </>
                                ) : (
                                    <>
                                        <Radio data-icon="inline-start" />
                                        Connected
                                    </>
                                )}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="grid gap-3 text-sm sm:grid-cols-2">
                            <div className="rounded-lg bg-muted/50 px-3 py-2">
                                <p className="text-muted-foreground">Job</p>
                                <p className="font-mono text-xs">
                                    {job?.id?.slice(0, 8) ??
                                        session?.job_id?.slice(0, 8) ??
                                        "starting…"}
                                </p>
                            </div>
                            <div className="rounded-lg bg-muted/50 px-3 py-2">
                                <p className="text-muted-foreground">
                                    User status
                                </p>
                                <p className="capitalize">
                                    {status?.user.ingestion_status ?? "running"}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {error && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard
                        label="Channels"
                        value={
                            job
                                ? `${job.completed_channels} / ${job.total_channels}`
                                : polling
                                  ? "…"
                                  : "0 / 0"
                        }
                        icon={Hash}
                    />
                    <StatCard
                        label="Messages"
                        value={messageCount.toLocaleString()}
                        icon={MessageSquare}
                    />
                    <StatCard
                        label="Status"
                        value={job ? jobStatusLabel(job.status) : "Starting…"}
                        icon={isComplete ? CheckCircle2 : Loader2}
                    />
                </div>

                <IndexingMessageFeed
                    messages={recentMessages}
                    totalMessages={messageCount}
                />

                {job && (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle>Overall progress</CardTitle>
                                <CardDescription>
                                    {activeChannel
                                        ? `Currently indexing #${activeChannel.name || activeChannel.channel_id}`
                                        : isComplete
                                          ? "All channels processed"
                                          : "Waiting for the next channel batch"}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Progress value={isComplete ? 100 : channelPct}>
                                    <ProgressLabel>
                                        Channels indexed
                                    </ProgressLabel>
                                    <ProgressValue>
                                        {() => `${channelPct}%`}
                                    </ProgressValue>
                                </Progress>
                                {job.error && (
                                    <p className="text-sm text-destructive">
                                        {job.error}
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        {(job.channel_progress?.length ?? 0) > 0 && (
                            <section className="space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <h2 className="text-lg font-medium">
                                        Channel breakdown
                                    </h2>
                                    <span className="text-xs text-muted-foreground">
                                        Updates every 2s
                                    </span>
                                </div>
                                <ChannelTable
                                    mode="progress"
                                    channels={job.channel_progress}
                                />
                            </section>
                        )}

                        {isComplete && (
                            <Button
                                className="w-full sm:w-auto"
                                render={<Link href="/dashboard" />}
                                nativeButton={false}
                            >
                                Open dashboard
                            </Button>
                        )}
                    </>
                )}

                {!job && polling && (
                    <Card>
                        <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
                            <Loader2 className="size-5 animate-spin" />
                            <span>Connecting to your ingestion job…</span>
                        </CardContent>
                    </Card>
                )}
            </div>
        </AppShell>
    );
}
