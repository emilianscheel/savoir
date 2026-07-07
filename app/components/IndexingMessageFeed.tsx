import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface IndexingMessage {
  channel_name: string;
  text: string;
  ts: string;
  enrichment_status: string;
}

function enrichmentBadge(status: string) {
  switch (status) {
    case "done":
      return (
        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
          Enriched
        </Badge>
      );
    case "processing":
      return <Badge>Enriching</Badge>;
    case "error":
      return <Badge variant="destructive">Error</Badge>;
    default:
      return <Badge variant="outline">Imported</Badge>;
  }
}

export function IndexingMessageFeed({
  messages,
  totalMessages,
}: {
  messages: IndexingMessage[];
  totalMessages?: number;
}) {
  if (messages.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Live message feed</CardTitle>
          <CardDescription>
            Messages appear here as Slack history is imported. This can take a minute for large
            workspaces.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Waiting for the first messages…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live message feed</CardTitle>
        <CardDescription>
          {totalMessages != null
            ? `${totalMessages.toLocaleString()} messages imported so far · newest first`
            : "Newest imported messages"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {messages.map((msg, i) => (
          <div
            key={`${msg.ts}-${msg.channel_name}-${i}`}
            className="rounded-lg border bg-muted/30 px-3 py-2.5"
          >
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                #{msg.channel_name || "channel"}
              </span>
              {enrichmentBadge(msg.enrichment_status)}
            </div>
            <p className="line-clamp-3 text-sm leading-relaxed">{msg.text || "(empty message)"}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
