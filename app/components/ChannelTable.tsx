import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type StatsRow = {
  channel_id: string;
  channel_name: string;
  message_count: number;
  latest_ts: string;
};

type ProgressRow = {
  channel_id: string;
  name: string;
  status: string;
  fetched: number;
};

export function ChannelTable(
  props:
    | { mode: "stats"; channels: StatsRow[] }
    | { mode: "progress"; channels: ProgressRow[] }
) {
  if (props.mode === "stats") {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Channel</TableHead>
            <TableHead className="text-right">Messages</TableHead>
            <TableHead className="text-right">Latest</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.channels.map((ch) => (
            <TableRow key={ch.channel_id}>
              <TableCell>#{ch.channel_name || ch.channel_id}</TableCell>
              <TableCell className="text-right tabular-nums">
                {ch.message_count}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {ch.latest_ts}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Channel</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Messages</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.channels.map((ch) => (
          <TableRow key={ch.channel_id}>
            <TableCell>#{ch.name || ch.channel_id}</TableCell>
            <TableCell className="capitalize text-muted-foreground">
              {ch.status}
            </TableCell>
            <TableCell className="text-right tabular-nums">{ch.fetched}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
