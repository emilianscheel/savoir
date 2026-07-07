import { SiteHeader } from "./SiteHeader";

export function AppShell({
  children,
  width = "lg",
}: {
  children: React.ReactNode;
  width?: "sm" | "md" | "lg";
}) {
  const maxWidth =
    width === "sm" ? "max-w-lg" : width === "md" ? "max-w-2xl" : "max-w-3xl";

  return (
    <div className="flex min-h-full flex-1 flex-col items-center px-6 py-16">
      <main className={`w-full ${maxWidth}`}>
        <SiteHeader />
        {children}
      </main>
    </div>
  );
}
