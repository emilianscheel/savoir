import Link from "next/link";
import { AppShell } from "./components/AppShell";
import { PageHeader } from "./components/PageHeader";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <AppShell width="sm">
      <PageHeader
        title="Slack knowledge platform"
        description="Index workspace messages into Neo4j and ask @Savoir in Slack."
      />
      <Button render={<Link href="/signin" />} nativeButton={false}>
        Get started
      </Button>
    </AppShell>
  );
}
