"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Send, Eye, MousePointerClick, AlertCircle, Clock } from "lucide-react";

const STATUS_ICONS: Record<string, any> = {
  queued: Clock,
  sent: Send,
  opened: Eye,
  clicked: MousePointerClick,
  failed: AlertCircle,
};

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  sent: "bg-primary/10 text-primary",
  failed: "bg-destructive/10 text-destructive",
};

export function CampaignActivityLog({ campaignId }: { campaignId: string }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["campaign-send-log", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_send_log")
        .select("*, campaign_recipients(name, email)")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading activity...</CardContent></Card>;
  }

  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No send activity yet. Schedule the campaign to start sending.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Recipient</TableHead>
                <TableHead className="text-xs">Step</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Sent</TableHead>
                <TableHead className="text-xs">Opened</TableHead>
                <TableHead className="text-xs">Clicked</TableHead>
                <TableHead className="text-xs">Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs">
                    <div>
                      <span className="font-medium">{log.campaign_recipients?.name || "—"}</span>
                      <span className="text-muted-foreground ml-1">{log.campaign_recipients?.email}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">Step {log.step_number}</TableCell>
                  <TableCell>
                    <Badge className={`${STATUS_COLORS[log.status] || "bg-muted"} border-0 text-[10px]`}>
                      {log.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {log.sent_at ? new Date(log.sent_at).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {log.opened_at ? (
                      <span className="text-category-scheduling">{new Date(log.opened_at).toLocaleString()}</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {log.clicked_at ? (
                      <span className="text-category-health">{new Date(log.clicked_at).toLocaleString()}</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-destructive truncate max-w-[150px]">
                    {log.error_message || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
