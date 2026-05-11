"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Globe, Phone, PenLine, Search, Filter, AlertTriangle, MessageSquare, Reply } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryBadge } from "@/components/CategoryBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { MailPreview } from "@/components/MailFormatter";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { InquiryCategory, InquiryStatus } from "@/lib/types";

const sourceIcons: Record<string, any> = { email: Mail, portal: Globe, phone: Phone, manual: PenLine };

export interface InquiryRow {
  id: string;
  patient_id: string | null;
  patient_name: string;
  patient_email: string | null;
  source: string;
  raw_content: string;
  category: string;
  category_confidence: number | null;
  is_faq_match: boolean | null;
  assigned_to: string | null;
  status: string;
  response_text: string | null;
  staff_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface Props {
  inquiries: InquiryRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function InquiryList({ inquiries, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Bulk fetch message counts so each row can show "n replies" without an N+1.
  // The query is keyed by the visible inquiry IDs so it auto-refreshes when
  // a new inquiry appears.
  const inquiryIds = inquiries.map((i) => i.id);
  const { data: replyCounts = {} } = useQuery<Record<string, { inbound: number; outbound: number }>>({
    queryKey: ["inquiry-message-counts", inquiryIds.join(",")],
    enabled: inquiryIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("inquiry_messages")
        .select("inquiry_id, direction")
        .in("inquiry_id", inquiryIds);
      if (error) return {};
      const out: Record<string, { inbound: number; outbound: number }> = {};
      for (const row of (data ?? []) as { inquiry_id: string; direction: "inbound" | "outbound" }[]) {
        if (!out[row.inquiry_id]) out[row.inquiry_id] = { inbound: 0, outbound: 0 };
        out[row.inquiry_id][row.direction]++;
      }
      return out;
    },
  });

  const filtered = inquiries.filter((inq) => {
    if (search && !inq.patient_name.toLowerCase().includes(search.toLowerCase()) && !inq.raw_content.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter !== "all" && inq.category !== categoryFilter) return false;
    if (statusFilter !== "all" && inq.status !== statusFilter) return false;
    return true;
  });

  const priorityMap: Record<string, number> = { escalated: 0, pending: 1, assigned: 2, auto_responded: 3, resolved: 4 };
  const sorted = [...filtered].sort((a, b) => {
    const pa = priorityMap[a.status] ?? 5;
    const pb = priorityMap[b.status] ?? 5;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const sections = [
    {
      key: "urgent",
      title: "Urgent & Escalated",
      subtitle: "Needs immediate attention",
      items: sorted.filter((inq) => inq.status === "escalated" || inq.category === "Urgent_Red_Flags"),
    },
    {
      key: "queue",
      title: "Open Queue",
      subtitle: "Pending and assigned inquiries",
      items: sorted.filter((inq) => {
        const urgent = inq.status === "escalated" || inq.category === "Urgent_Red_Flags";
        return !urgent && (inq.status === "pending" || inq.status === "assigned");
      }),
    },
    {
      key: "automated",
      title: "Auto-Replied",
      subtitle: "Handled by FAQ automation",
      items: sorted.filter((inq) => inq.status === "auto_responded"),
    },
    {
      key: "resolved",
      title: "Resolved",
      subtitle: "Closed conversations",
      items: sorted.filter((inq) => inq.status === "resolved"),
    },
  ].filter((section) => section.items.length > 0);

  const urgentCount = inquiries.filter((i) => i.status === "escalated" || i.category === "Urgent_Red_Flags").length;
  const pendingCount = inquiries.filter((i) => i.status === "pending").length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-heading font-bold">{inquiries.length}</span>
          <span className="text-sm text-muted-foreground">Total</span>
        </div>
        {urgentCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-category-urgent/10 px-3 py-1">
            <AlertTriangle className="h-3.5 w-3.5 text-category-urgent" />
            <span className="text-xs font-medium text-category-urgent">{urgentCount} Urgent</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 rounded-full bg-status-pending/10 px-3 py-1">
          <span className="text-xs font-medium text-status-pending">{pendingCount} Pending</span>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search inquiries..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 bg-background" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[130px] h-9">
            <Filter className="h-3.5 w-3.5 mr-1" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="Appointment_Scheduling">Consultations</SelectItem>
            <SelectItem value="Health_Questions">Results & Outcomes</SelectItem>
            <SelectItem value="Prescription_Lab_Requests">Services & Programs</SelectItem>
            <SelectItem value="Billing_Insurance">Pricing & Payment</SelectItem>
            <SelectItem value="Urgent_Red_Flags">Urgent / Escalation</SelectItem>
            <SelectItem value="General_Info">General</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="auto_responded">Auto</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="escalated">Escalated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto">
        {sections.map((section) => (
          <div key={section.key}>
            <div className="sticky top-0 z-10 border-y bg-background/95 px-4 py-2 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {section.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{section.subtitle}</p>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  {section.items.length}
                </span>
              </div>
            </div>

            {section.items.map((inq) => {
              const SourceIcon = sourceIcons[inq.source] || Mail;
              const isSelected = selectedId === inq.id;
              const isUrgent = inq.category === "Urgent_Red_Flags" || inq.status === "escalated";

              return (
                <button
                  key={inq.id}
                  onClick={() => onSelect(inq.id)}
                  className={cn(
                    "w-full border-b px-4 py-3.5 text-left transition-colors hover:bg-accent/50",
                    isSelected && "border-l-2 border-l-primary bg-accent",
                    isUrgent && !isSelected && "border-l-2 border-l-category-urgent bg-category-urgent/5"
                  )}
                >
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <SourceIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-medium">{inq.patient_name}</span>
                    </div>
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(inq.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="mb-2">
                    <MailPreview content={inq.raw_content} maxLength={100} />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <CategoryBadge category={inq.category as InquiryCategory} />
                    <StatusBadge status={inq.status as InquiryStatus} />
                    {(() => {
                      const c = replyCounts[inq.id];
                      const total = (c?.inbound ?? 0) + (c?.outbound ?? 0);
                      // Only badge when this is actually a multi-message thread —
                      // a single inbound message isn't a "thread", so skip it.
                      if (total <= 1) return null;
                      return (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-medium">
                          {(c?.outbound ?? 0) > 0 ? <Reply className="h-2.5 w-2.5" /> : <MessageSquare className="h-2.5 w-2.5" />}
                          {total} msgs
                        </span>
                      );
                    })()}
                    {(inq.category_confidence ?? 0) < 0.9 && (
                      <span className="text-[10px] text-muted-foreground">
                        ({Math.round((inq.category_confidence ?? 0) * 100)}%)
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
        {sections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Search className="h-8 w-8 mb-3 opacity-40" />
            <p className="text-sm">No inquiries match your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
