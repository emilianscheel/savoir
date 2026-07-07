"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Nav } from "../components/Nav";
import { oauthStartUrl } from "@/lib/api";

function SignInContent() {
  const params = useSearchParams();
  const error = params.get("error");
  const step = params.get("step");

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-950 px-6 py-16 font-sans text-zinc-100">
      <main className="w-full max-w-lg">
        <Nav />
        <span className="mb-4 inline-block rounded-full border border-violet-400/25 bg-violet-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-violet-300">
          Savoir
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Connect Slack</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Two steps: add the Savoir bot to your workspace, then authorize your Slack account
          so we can index your channel history. The bot answers questions from your indexed
          knowledge graph.
        </p>

        {error && (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            OAuth error: {error}
          </p>
        )}
        {step === "user_needed" && (
          <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Workspace connected. Authorize your Slack account to fetch message history.
          </p>
        )}

        <div className="mt-8 space-y-4">
          <a
            href={oauthStartUrl("full")}
            className="flex w-full items-center justify-center rounded-lg bg-[#4A154B] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#611f69]"
          >
            Connect Slack (workspace + account)
          </a>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <a
              href={oauthStartUrl("workspace")}
              className="rounded-lg border border-zinc-700 px-4 py-3 text-center text-sm text-zinc-300 hover:border-zinc-500"
            >
              Step 1 — Add bot to workspace
            </a>
            <a
              href={oauthStartUrl("user")}
              className="rounded-lg border border-zinc-700 px-4 py-3 text-center text-sm text-zinc-300 hover:border-zinc-500"
            >
              Step 2 — Authorize your account
            </a>
          </div>
        </div>

        <p className="mt-8 text-xs text-zinc-500">
          Requires a configured Slack app with OAuth redirect pointing at your Butterbase{" "}
          <code className="text-zinc-400">slack_oauth_callback</code> function URL.
        </p>
      </main>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
