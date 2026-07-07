"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

const links = [
  { href: "/", label: "Home" },
  { href: "/signin", label: "Connect" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/dashboard", label: "Dashboard" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="mb-10 flex items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Savoir
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "text-muted-foreground transition-colors hover:text-foreground",
                pathname === href && "text-foreground"
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
