"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { PageHeader } from "../components/PageHeader";
import { oauthStartUrl } from "@/lib/api";
import { disconnectSession, loadSession } from "@/lib/session";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function SignInContent() {
  const params = useSearchParams();
  const error = params.get("error");
  const step = params.get("step");
  const [connected, setConnected] = useState(false);

  useLayoutEffect(() => {
    const sync = () => setConnected(!!loadSession()?.access_token);
    sync();
    window.addEventListener("savoir:session-changed", sync);
    return () => window.removeEventListener("savoir:session-changed", sync);
  }, []);

  if (connected) {
    return (
      <AppShell>
        <PageHeader
          title="Slack connected"
          description="Your workspace is linked. Continue indexing or reconnect with a different account."
        />
        <div className="space-y-3">
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            render={<Link href="/onboarding" />}
            nativeButton={false}
          >
            <CheckCircle2 data-icon="inline-start" />
            View indexing progress
          </Button>
          <Button
            variant="outline"
            className="w-full"
            render={<a href={oauthStartUrl("full")} />}
            nativeButton={false}
          >
            Reconnect Slack
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => {
              disconnectSession();
              setConnected(false);
            }}
          >
            Disconnect
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Connect Slack"
        description="Install Savoir in your workspace and authorize your account to index channel history."
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>OAuth error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {step === "user_needed" && (
        <Alert className="mb-6">
          <AlertTitle>Almost there</AlertTitle>
          <AlertDescription>
            The workspace is linked but your account still needs authorization to
            fetch message history. Click Connect Slack below to finish setup.
          </AlertDescription>
        </Alert>
      )}

      <Button
        className="w-full bg-[#4A154B] hover:bg-[#611f69]"
        render={<a href={oauthStartUrl("full")} />}
        nativeButton={false}
      >
        Connect Slack
      </Button>
    </AppShell>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
