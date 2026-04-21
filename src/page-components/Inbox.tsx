"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { InquiryList, type InquiryRow } from "@/components/InquiryList";
import { InquiryDetail } from "@/components/InquiryDetail";
import {
  Inbox as InboxIcon, Bot, AlertTriangle, CheckCircle, RefreshCw, UserX, Users, Tag,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "General_Info", label: "General Info" },
  { value: "Appointment", label: "Appointment" },
  { value: "Billing", label: "Billing" },
  { value: "Medical", label: "Medical" },
  { value: "Complaint", label: "Complaint" },
  { value: "Sales", label: "Sales" },
  { value: "Spam", label: "Spam" },
  { value: "Other", label: "Other" },
];

const Inbox = () => {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [inboxTab, setInboxTab] = useState<"all" | "contacts" | "unknown">("all");

  const handleGmailSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync-gmail", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Gmail sync failed");
      } else if (data.synced === 0) {
        toast.info(data.message ?? "No new emails");
      } else {
        const msg = `Synced ${data.synced} email${data.synced !== 1 ? "s" : ""}`
          + (data.contacts_matched > 0 ? ` · ${data.contacts_matched} from contacts` : "")
          + (data.unknown_senders > 0 ? ` · ${data.unknown_senders} unknown senders` : "");
        toast.success(msg);
        queryClient.invalidateQueries({ queryKey: QK.inquiries });
      }
    } catch {
      toast.error("Failed to reach sync endpoint");
    } finally {
      setSyncing(false);
    }
  };

  const { data: inquiries = [] } = useQuery({
    queryKey: QK.inquiries,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inquiries")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as InquiryRow[];
    },
  });

  const categoryMutation = useMutation({
    mutationFn: async ({ id, category }: { id: string; category: string }) => {
      const { error } = await supabase.from("inquiries").update({ category }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.setQueryData(QK.inquiries, (old: InquiryRow[] | undefined) =>
        (old ?? []).map((i) => i.id === vars.id ? { ...i, category: vars.category } : i)
      );
      toast.success("Category updated");
    },
    onError: () => toast.error("Failed to update category"),
  });

  // Tab filter
  const tabFiltered = inquiries.filter((i) => {
    if (inboxTab === "contacts") return !!i.patient_id;
    if (inboxTab === "unknown") return !i.patient_id;
    return true;
  });

  useEffect(() => {
    if (!tabFiltered.length) { setSelectedId(null); return; }
    if (!selectedId || !tabFiltered.some((i) => i.id === selectedId)) {
      setSelectedId(tabFiltered[0].id);
    }
  }, [tabFiltered, selectedId]);

  const selected = tabFiltered.find((i) => i.id === selectedId) || null;

  const handleUpdate = (id: string, updates: Partial<InquiryRow>) => {
    queryClient.setQueryData(QK.inquiries, (old: InquiryRow[] | undefined) =>
      (old ?? []).map((i) => (i.id === id ? { ...i, ...updates } : i))
    );
    queryClient.invalidateQueries({ queryKey: QK.inquiries });
  };

  const pending = inquiries.filter((i) => i.status === "pending").length;
  const autoResponded = inquiries.filter((i) => i.status === "auto_responded").length;
  const escalated = inquiries.filter((i) => i.status === "escalated").length;
  const resolved = inquiries.filter((i) => i.status === "resolved").length;
  const unknownCount = inquiries.filter((i) => !i.patient_id).length;
  const contactCount = inquiries.filter((i) => !!i.patient_id).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Inbox</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All incoming emails · {inquiries.length} total · {unknownCount} unknown senders
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleGmailSync} disabled={syncing} className="gap-1.5 shrink-0">
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : "Sync Gmail"}
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Pending",     value: pending,       icon: InboxIcon,    color: "text-amber-600",    bg: "bg-amber-500/10" },
          { label: "AI Answered", value: autoResponded, icon: Bot,          color: "text-primary",      bg: "bg-primary/10" },
          { label: "Escalated",   value: escalated,     icon: AlertTriangle,color: "text-destructive",  bg: "bg-destructive/10" },
          { label: "Resolved",    value: resolved,      icon: CheckCircle,  color: "text-emerald-600",  bg: "bg-emerald-500/10" },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`rounded-lg p-2 ${m.bg}`}><m.icon className={`h-4 w-4 ${m.color}`} /></div>
              <div>
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-lg font-bold font-heading">{m.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-card border rounded-lg p-0.5 w-fit shadow-card">
        {([
          { key: "all",      label: "All Emails",       icon: InboxIcon, count: inquiries.length },
          { key: "contacts", label: "From Contacts",    icon: Users,     count: contactCount },
          { key: "unknown",  label: "Unknown Senders",  icon: UserX,     count: unknownCount },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setInboxTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              inboxTab === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            <span className="ml-0.5 opacity-70">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Split panel */}
      <div className="border rounded-xl overflow-hidden bg-card shadow-card">
        {/* Mobile */}
        <div className="lg:hidden">
          {selectedId && selected ? (
            <div>
              <div className="border-b px-3 py-2 flex items-center justify-between">
                <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" onClick={() => setSelectedId(null)}>
                  ← Back to inbox
                </button>
                <CategoryPicker inquiry={selected} onSave={(cat) => categoryMutation.mutate({ id: selected.id, category: cat })} />
              </div>
              <div className="overflow-y-auto max-h-[70vh]">
                <InquiryDetail inquiry={selected} onUpdate={handleUpdate} />
              </div>
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[70vh]">
              <InquiryList inquiries={tabFiltered} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
          )}
        </div>

        {/* Desktop */}
        <div className="hidden lg:grid lg:grid-cols-5 min-h-[500px]">
          <div className="lg:col-span-2 border-r overflow-y-auto max-h-[650px]">
            <InquiryList inquiries={tabFiltered} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
          <div className="lg:col-span-3 overflow-y-auto max-h-[650px] flex flex-col">
            {selected ? (
              <>
                <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 shrink-0">
                  <div className="flex items-center gap-2">
                    {!selected.patient_id && (
                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400/30 bg-amber-500/10">
                        <UserX className="h-3 w-3 mr-1" />Unknown sender
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">{selected.patient_email}</Badge>
                  </div>
                  <CategoryPicker
                    inquiry={selected}
                    onSave={(cat) => categoryMutation.mutate({ id: selected.id, category: cat })}
                  />
                </div>
                <div className="flex-1 overflow-y-auto">
                  <InquiryDetail inquiry={selected} onUpdate={handleUpdate} />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20">
                <InboxIcon className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">Select an email to view details</p>
                <p className="text-xs mt-1">AI automatically answers FAQ-matched inquiries</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function CategoryPicker({ inquiry, onSave }: { inquiry: InquiryRow; onSave: (cat: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Select value={inquiry.category ?? "General_Info"} onValueChange={onSave}>
        <SelectTrigger className="h-7 text-xs w-36 border-muted">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CATEGORIES.map((c) => (
            <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default Inbox;
