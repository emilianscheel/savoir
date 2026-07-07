import { SiteHeader } from "./SiteHeader";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col px-6 py-16">
      <main className="mx-auto w-full max-w-3xl">
        <SiteHeader />
        {children}
      </main>
    </div>
  );
}
