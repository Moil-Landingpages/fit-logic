"use client";

import { useState, useEffect } from "react";
import { Mail, Globe, Phone, PenLine, Clock, User, Send, AlertTriangle, CheckCircle, Bot, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryBadge } from "@/components/CategoryBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { InquiryRow } from "@/components/InquiryList";
import type { InquiryCategory, InquiryStatus } from "@/lib/types";

const sourceIcons: Record<string, React.ElementType> = {
  email: Mail, portal: Globe, phone: Phone, manual: PenLine,
};
const sourceLabels: Record<string, string> = {
  email: "Email", portal: "Patient Portal", phone: "Phone Call", manual: "Manual Entry",
};

const QUICK_REPLIES = [
  "Thanks for reaching out! We'll get back to you within 24 hours.",
  "Your appointment has been confirmed. See you soon!",
  "Lab results typically process within 3-5 business days.",
  "Please call our office for immediate assistance.",
];

interface StaffRow {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

interface Props {
  inquiry: InquiryRow;
  onUpdate: (id: string, updates: Partial<InquiryRow>) => void;
}

export function InquiryDetail({ inquiry, onUpdate }: Props) {
  const [reply, setReply] = useState("");
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [escalationStaffId, setEscalationStaffId] = useState<string | null>(null);
  const [assignedStaffName, setAssignedStaffName] = useState<string | null>(null);
  const [classifying, setClassifying] = useState(false);
  const SourceIcon = sourceIcons[inquiry.source] ?? Mail;

  // Load staff list and escalation target from practice_settings
  useEffect(() => {
    supabase.from("staff").select("id, name, role, active").eq("active", true)
      .then((staffRes) => {
        if (staffRes.data) setStaff(staffRes.data);
      });
  }, []);

  useEffect(() => {
    if (inquiry.assigned_to && staff.length) {
      const s = staff.find((s) => s.id === inquiry.assigned_to);
      setAssignedStaffName(s?.name ?? null);
    } else {
      setAssignedStaffName(null);
    }
  }, [inquiry.assigned_to, staff]);

  const handleClassify = async () => {
    setClassifying(true);
    try {
      const res = await fetch("/api/classify-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inquiry_id: inquiry.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Classification failed");
      if (data?.updates) {
        onUpdate(inquiry.id, data.updates);
        toast.success(data.classification?.is_faq_match
          ? "AI matched to FAQ and auto-responded"
          : "AI classified successfully");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Classification failed");
    } finally {
      setClassifying(false);
    }
  };

  const handleAssign = async (staffId: string) => {
    const { error } = await supabase
      .from("inquiries")
      .update({ assigned_to: staffId, status: "assigned" })
      .eq("id", inquiry.id);
    if (error) { toast.error(error.message); return; }
    onUpdate(inquiry.id, { assigned_to: staffId, status: "assigned" });
    const s = staff.find((s) => s.id === staffId);
    toast.success(`Assigned to ${s?.name}`);
  };

  const handleResolve = async () => {
    const updates = {
      status: "resolved" as const,
      resolved_at: new Date().toISOString(),
      response_text: reply || null,
    };
    const { error } = await supabase.from("inquiries").update(updates).eq("id", inquiry.id);
    if (error) { toast.error(error.message); return; }
    onUpdate(inquiry.id, updates);
    toast.success("Inquiry resolved");
  };

  const handleEscalate = async () => {
    const targetId = escalationStaffId ?? staff[0]?.id ?? null;
    const updates = { status: "escalated" as const, assigned_to: targetId };
    const { error } = await supabase.from("inquiries").update(updates).eq("id", inquiry.id);
    if (error) { toast.error(error.message); return; }
    onUpdate(inquiry.id, updates);
    const target = staff.find((s) => s.id === targetId);
    toast.warning(target ? `Escalated to ${target.name}` : "Escalated");
  };

  const handleSendReply = async () => {
    if (!reply.trim()) return;
    const updates = {
      response_text: reply,
      status: "resolved" as const,
      resolved_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("inquiries").update(updates).eq("id", inquiry.id);
    if (error) { toast.error(error.message); return; }
    onUpdate(inquiry.id, updates);
    toast.success("Reply sent & inquiry resolved");
    setReply("");
  };

  return (
    <div className="flex flex-col h-full animate-slide-in-right">
      <div className="px-6 py-4 border-b bg-card">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="font-heading text-lg font-bold">{inquiry.patient_name}</h2>
            <p className="text-sm text-muted-foreground">{inquiry.patient_email}</p>
          </div>
          <div className="flex items-center gap-2">
            <CategoryBadge category={inquiry.category as InquiryCategory} />
            <StatusBadge status={inquiry.status as InquiryStatus} />
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <SourceIcon className="h-3.5 w-3.5" />
            {sourceLabels[inquiry.source] ?? inquiry.source}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {format(new Date(inquiry.created_at), "MMM d, h:mm a")}
          </span>
          {assignedStaffName && (
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {assignedStaffName}
            </span>
          )}
          <span className="ml-auto text-[11px]">
            AI Confidence: {Math.round((inquiry.category_confidence ?? 0) * 100)}%
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
        <div className="rounded-lg bg-muted/50 p-4">
          <p className="text-sm leading-relaxed">{inquiry.raw_content}</p>
        </div>

        {inquiry.is_faq_match && inquiry.response_text && (
          <div className="rounded-lg border border-status-auto/30 bg-status-auto/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="h-4 w-4 text-status-auto" />
              <span className="text-xs font-medium text-status-auto">Auto-Response Sent</span>
            </div>
            <p className="text-sm text-muted-foreground">{inquiry.response_text}</p>
          </div>
        )}

        {inquiry.staff_notes && (
          <div className="rounded-lg border p-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">Staff Notes</p>
            <p className="text-sm">{inquiry.staff_notes}</p>
          </div>
        )}

        <Separator />

        {inquiry.status !== "resolved" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={inquiry.assigned_to ?? ""} onValueChange={handleAssign}>
                <SelectTrigger className="w-[180px] h-9">
                  <User className="h-3.5 w-3.5 mr-1" />
                  <SelectValue placeholder="Assign to..." />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} — {s.role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={handleResolve} className="gap-1.5">
                <CheckCircle className="h-3.5 w-3.5" />
                Resolve
              </Button>

              {inquiry.status !== "escalated" && (
                <Button variant="destructive" size="sm" onClick={handleEscalate} className="gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Escalate
                </Button>
              )}

              <Button variant="secondary" size="sm" onClick={handleClassify} disabled={classifying} className="gap-1.5">
                {classifying
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Sparkles className="h-3.5 w-3.5" />}
                AI Classify
              </Button>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Quick Replies</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_REPLIES.map((qr, i) => (
                  <button
                    key={i}
                    onClick={() => setReply(qr)}
                    className="text-xs rounded-full border px-3 py-1.5 hover:bg-accent transition-colors text-left"
                  >
                    {qr.length > 50 ? qr.substring(0, 50) + "…" : qr}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Textarea
                placeholder="Write a reply..."
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                className="min-h-[100px] bg-background"
              />
              <div className="flex justify-end mt-2">
                <Button
                  onClick={handleSendReply}
                  disabled={!reply.trim()}
                  className="gap-1.5 gradient-brand text-primary-foreground"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send Reply
                </Button>
              </div>
            </div>
          </div>
        )}

        {inquiry.status === "resolved" && inquiry.resolved_at && (
          <div className="rounded-lg border-status-resolved/30 bg-status-resolved/5 border p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-status-resolved" />
              <span className="text-sm font-medium text-status-resolved">
                Resolved {format(new Date(inquiry.resolved_at), "MMM d, h:mm a")}
              </span>
            </div>
            {inquiry.response_text && !inquiry.is_faq_match && (
              <p className="text-sm text-muted-foreground mt-2">{inquiry.response_text}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
