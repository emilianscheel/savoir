"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "../components/AppShell";
import { PageHeader } from "../components/PageHeader";
import { oauthStartUrl } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function SignInContent() {
  const params = useSearchParams();
  const error = params.get("error");
  const step = params.get("step");

  return (
    <AppShell width="sm">
      <PageHeader
        title="Connect Slack"
        description="Add the bot, then authorize your account to index history."
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>OAuth error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {step === "user_needed" && (
        <Alert className="mb-6">
          <AlertTitle>Workspace connected</AlertTitle>
          <AlertDescription>
            Authorize your Slack account to fetch message history.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        <Button
          className="w-full bg-[#4A154B] hover:bg-[#611f69]"
          render={<a href={oauthStartUrl("full")} />}
          nativeButton={false}
        >
          Connect workspace + account
        </Button>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            className="w-full"
            render={<a href={oauthStartUrl("workspace")} />}
            nativeButton={false}
          >
            Workspace only
          </Button>
          <Button
            variant="outline"
            className="w-full"
            render={<a href={oauthStartUrl("user")} />}
            nativeButton={false}
          >
            Account only
          </Button>
        </div>
      </div>
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
