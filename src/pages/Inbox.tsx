import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { InquiryList, type InquiryRow } from "@/components/InquiryList";
import { InquiryDetail } from "@/components/InquiryDetail";
import { Inbox as InboxIcon, Bot, AlertTriangle, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const Inbox = () => {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: inquiries = [], isLoading } = useQuery({
    queryKey: QK.inquiries,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inquiries")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as InquiryRow[];
    },
  });

  const selected = inquiries.find((i) => i.id === selectedId) || null;

  const handleUpdate = (id: string, updates: Partial<InquiryRow>) => {
    // Optimistic update for instant UI response
    queryClient.setQueryData(QK.inquiries, (old: InquiryRow[] | undefined) =>
      (old ?? []).map((i) => (i.id === id ? { ...i, ...updates } : i))
    );
    // Background refetch so all consumers get the server-authoritative state
    queryClient.invalidateQueries({ queryKey: QK.inquiries });
  };

  const pending = inquiries.filter((i) => i.status === "pending").length;
  const autoResponded = inquiries.filter((i) => i.status === "auto_responded").length;
  const escalated = inquiries.filter((i) => i.status === "escalated").length;
  const resolved = inquiries.filter((i) => i.status === "resolved").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Inbox</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage incoming inquiries · AI routes non-critical questions automatically
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Pending", value: pending, icon: InboxIcon, color: "text-amber-600", bg: "bg-amber-500/10" },
          { label: "AI Answered", value: autoResponded, icon: Bot, color: "text-primary", bg: "bg-primary/10" },
          { label: "Escalated", value: escalated, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
          { label: "Resolved", value: resolved, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-500/10" },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`rounded-lg p-2 ${m.bg}`}>
                <m.icon className={`h-4 w-4 ${m.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-lg font-bold font-heading">{m.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Split panel */}
      <div className="grid lg:grid-cols-5 gap-0 border rounded-xl overflow-hidden bg-card shadow-card min-h-[500px]">
        <div className="lg:col-span-2 border-r overflow-y-auto max-h-[600px]">
          <InquiryList
            inquiries={inquiries}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
        <div className="lg:col-span-3 overflow-y-auto max-h-[600px]">
          {selected ? (
            <InquiryDetail inquiry={selected} onUpdate={handleUpdate} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20">
              <InboxIcon className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Select an inquiry to view details</p>
              <p className="text-xs mt-1">AI automatically answers FAQ-matched inquiries</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Inbox;
