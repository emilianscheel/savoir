"use client";

import { ThemeProvider } from "next-themes";
import { CanonicalRedirect } from "./components/CanonicalRedirect";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <CanonicalRedirect />
      {children}
    </ThemeProvider>
  );
}
