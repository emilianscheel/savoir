"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { loadSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

const links = [
  { href: "/onboarding", label: "Onboarding" },
  { href: "/dashboard", label: "Dashboard" },
];

function isConnected(): boolean {
  return !!loadSession()?.access_token;
}

export function SiteHeader() {
  const pathname = usePathname();
  const [connected, setConnected] = useState(false);

  useLayoutEffect(() => {
    setConnected(isConnected());

    const sync = () => setConnected(isConnected());
    window.addEventListener("savoir:session-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("savoir:session-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, [pathname]);

  const connectHref = connected ? "/onboarding" : "/signin";
  const connectLabel = connected ? "Connected" : "Connect";
  const connectActive = connected
    ? pathname === "/onboarding"
    : pathname === "/signin";

  return (
    <header className="mb-10 flex items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Link href="/onboarding" className="text-sm font-semibold tracking-tight">
          Savoir
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm">
          <Link
            href={connectHref}
            className={cn(
              "inline-flex items-center gap-1.5 transition-colors",
              connected
                ? "text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                : "text-muted-foreground hover:text-foreground",
              connectActive && (connected ? "" : "text-foreground"),
            )}
          >
            {connected && <CheckCircle2 className="size-3.5" aria-hidden />}
            {connectLabel}
          </Link>
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "text-muted-foreground transition-colors hover:text-foreground",
                pathname === href && "text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <ThemeToggle />
    </header>
  );
}
