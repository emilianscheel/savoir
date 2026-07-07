"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { PageHeader } from "../../components/PageHeader";
import { exchangeOAuthCode } from "@/lib/api";
import { saveSession } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";

function OAuthCallbackContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const oauthError = params.get("error");
    if (oauthError) {
      router.replace(`/signin?error=${encodeURIComponent(oauthError)}`);
      return;
    }

    const code = params.get("code");
    if (!code) {
      router.replace("/signin");
      return;
    }

    const exchangeKey = `savoir_oauth_exchange:${code}`;
    if (sessionStorage.getItem(exchangeKey)) {
      router.replace("/onboarding");
      return;
    }
    sessionStorage.setItem(exchangeKey, "1");

    let cancelled = false;

    (async () => {
      try {
        const session = await exchangeOAuthCode(code, params.get("state"));
        if (cancelled) return;
        saveSession(session);
        router.replace("/onboarding");
      } catch (err) {
        if (cancelled) return;
        sessionStorage.removeItem(exchangeKey);
        const message = err instanceof Error ? err.message : "OAuth failed";
        setError(message);
        router.replace(`/signin?error=${encodeURIComponent(message)}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return (
    <AppShell>
      <PageHeader
        title="Connecting Slack"
        description="Finishing authorization and starting message import."
      />
      <Card>
        <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
          {error ? (
            <span>{error}</span>
          ) : (
            <>
              <Loader2 className="size-5 animate-spin" />
              <span>Completing Slack sign-in…</span>
            </>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense>
      <OAuthCallbackContent />
    </Suspense>
  );
}
