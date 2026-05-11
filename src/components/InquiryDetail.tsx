"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { Mail, Globe, Phone, PenLine, Clock, User, Send, AlertTriangle, CheckCircle, Bot, Sparkles, Loader2, Reply, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryBadge } from "@/components/CategoryBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RichEmailEditor, type EmailAttachment } from "@/components/RichEmailEditor";
import { cn } from "@/lib/utils";
import type { InquiryRow } from "@/components/InquiryList";
import type { InquiryCategory, InquiryStatus } from "@/lib/types";

interface InquiryMessageRow {
  id: string;
  inquiry_id: string;
  direction: "inbound" | "outbound";
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  attachments: { filename: string; content?: string; mimeType: string; size?: number }[] | null;
  provider: string | null;
  status: string | null;
  error_message: string | null;
  created_at: string;
}

const sourceIcons: Record<string, React.ElementType> = {
  email: Mail, portal: Globe, phone: Phone, manual: PenLine,
};
const sourceLabels: Record<string, string> = {
  email: "Email", portal: "Patient Portal", phone: "Phone Call", manual: "Manual Entry",
};

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
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const [replyHtml, setReplyHtml] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<EmailAttachment[]>([]);
  const [sending, setSending] = useState(false);
  // Reply form is collapsed until the user clicks "Reply" — keeps the thread
  // readable when the conversation is long.
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [escalationStaffId, setEscalationStaffId] = useState<string | null>(null);
  const [assignedStaffName, setAssignedStaffName] = useState<string | null>(null);
  const [classifying, setClassifying] = useState(false);
  const SourceIcon = sourceIcons[inquiry.source] ?? Mail;

  // Pull the message thread. Migration 20260510000002 creates this table and
  // backfills existing inquiries.raw_content as the first inbound message.
  const messagesQueryKey = ["inquiry-messages", inquiry.id];
  const { data: messages = [] } = useQuery<InquiryMessageRow[]>({
    queryKey: messagesQueryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("inquiry_messages")
        .select("*")
        .eq("inquiry_id", inquiry.id)
        .order("created_at", { ascending: true });
      if (error) return [];
      return (data ?? []) as InquiryMessageRow[];
    },
  });

  // Fallback when the migration hasn't been applied yet OR the inquiry is
  // brand new and the inbound message hasn't been backfilled. Synthesise the
  // first message from inquiry.raw_content so the UI never shows a blank
  // thread. Some legacy syncs stored the HTML body verbatim inside
  // raw_content (instead of converting it to text first) — detect that and
  // route it into body_html so it renders properly instead of showing as
  // a wall of `<table>` source.
  const threadMessages = useMemo<InquiryMessageRow[]>(() => {
    if (messages.length > 0) return messages;
    const raw = inquiry.raw_content ?? "";
    const splitIdx = raw.indexOf("\n\n");
    const subject = splitIdx >= 0 ? raw.slice(0, splitIdx).trim() : null;
    const bodyRaw = splitIdx >= 0 ? raw.slice(splitIdx + 2).trim() : raw.trim();
    // Heuristic: any of the structural HTML tags or a DOCTYPE means we
    // should render as HTML, not as escaped text. We deliberately don't
    // trigger on stray `<` characters in plain prose.
    const looksHtml = /<!doctype|<html\b|<body\b|<table\b|<div\b|<p\b|<br\s*\/?>|<a\s|<img\s|<span\b/i.test(bodyRaw);
    return [{
      id: `synthetic-${inquiry.id}`,
      inquiry_id: inquiry.id,
      direction: "inbound",
      from_name: inquiry.patient_name,
      from_email: inquiry.patient_email,
      subject,
      body_text: looksHtml ? null : bodyRaw,
      body_html: looksHtml ? bodyRaw : null,
      attachments: null,
      provider: null,
      status: "received",
      error_message: null,
      created_at: inquiry.created_at,
    }];
  }, [messages, inquiry]);

  const inboundCount = threadMessages.filter((m) => m.direction === "inbound").length;
  const outboundCount = threadMessages.filter((m) => m.direction === "outbound").length;

  // Load staff list
  useEffect(() => {
    supabase.from("staff").select("id, name, role, active").eq("active", true)
      .then((staffRes) => {
        if (staffRes.data) setStaff(staffRes.data);
      });
  }, []);

  // Auto-classify when inquiry loads if not yet classified
  useEffect(() => {
    if (!inquiry.category_confidence && inquiry.status === "pending") {
      fetch("/api/classify-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inquiry_id: inquiry.id }),
      })
        .then(r => r.json())
        .then(data => { if (data?.updates) onUpdate(inquiry.id, data.updates); })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiry.id]);

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
    setSending(true);
    try {
      const res = await fetch("/api/send-inquiry-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiry_id: inquiry.id,
          reply_text: reply,
          html_content: replyHtml,
          attachments: replyAttachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            mimeType: a.mimeType,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Send failed");
      // Reply is now an additive action — multiple replies can stack on
      // the same inquiry. Status is untouched: "assigned" is reserved for
      // explicit staff assignment, "resolved" for the explicit Resolve
      // button. A reply alone doesn't reclassify the inquiry.
      const updates: Partial<InquiryRow> = { response_text: reply };
      onUpdate(inquiry.id, updates);
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      toast.success("Reply sent");
      setReply("");
      setReplyHtml("");
      setReplyAttachments([]);
      setShowReplyForm(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
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
        {/* Thread summary */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Conversation
            </p>
            <Badge variant="outline" className="text-[10px] font-mono">
              {threadMessages.length} message{threadMessages.length === 1 ? "" : "s"}
            </Badge>
            {outboundCount > 0 && (
              <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
                {outboundCount} repl{outboundCount === 1 ? "y" : "ies"}
              </Badge>
            )}
          </div>
        </div>

        {/* Threaded message list */}
        <div className="space-y-3">
          {threadMessages.map((m, idx) => (
            <MessageBubble
              key={m.id}
              message={m}
              isLast={idx === threadMessages.length - 1}
              fallbackInboundName={inquiry.patient_name}
              fallbackInboundEmail={inquiry.patient_email}
            />
          ))}
        </div>

        {inquiry.is_faq_match && inquiry.response_text && outboundCount === 0 && (
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

        {/* Action bar — Reply, Resolve, Escalate, AI Classify all live here.
            Reply no longer auto-resolves; the Resolve button is the only path
            to the resolved state (per Phase 2 requirements). */}
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

            {inquiry.status !== "resolved" && (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowReplyForm((v) => !v)}
                  className="gap-1.5"
                >
                  <Reply className="h-3.5 w-3.5" />
                  {showReplyForm ? "Cancel reply" : outboundCount > 0 ? "Reply again" : "Reply"}
                </Button>

                <Button variant="outline" size="sm" onClick={handleResolve} className="gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Mark Resolved
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
              </>
            )}

            {inquiry.status === "resolved" && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const updates = { status: "assigned" as const, resolved_at: null };
                  const { error } = await supabase
                    .from("inquiries")
                    .update(updates as never)
                    .eq("id", inquiry.id);
                  if (error) { toast.error(error.message); return; }
                  onUpdate(inquiry.id, updates);
                  toast.success("Reopened");
                }}
                className="gap-1.5"
              >
                <Reply className="h-3.5 w-3.5" />
                Reopen
              </Button>
            )}
          </div>

          {showReplyForm && inquiry.status !== "resolved" && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">
                Replying to <span className="font-medium text-foreground">{inquiry.patient_name}</span>
                {inquiry.patient_email && <span> &lt;{inquiry.patient_email}&gt;</span>}
              </p>
              <RichEmailEditor
                value={replyHtml}
                onChange={(html) => {
                  setReplyHtml(html);
                  // Extract plain text for response_text storage
                  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                  setReply(text);
                }}
                placeholder="Write your reply…"
                minHeight={150}
                subject={`Re: ${inquiry.patient_name}`}
                attachments={replyAttachments}
                onAttachmentsChange={setReplyAttachments}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowReplyForm(false); setReply(""); setReplyHtml(""); setReplyAttachments([]); }}
                  disabled={sending}
                >
                  Discard
                </Button>
                <Button
                  onClick={handleSendReply}
                  disabled={!reply.trim() || sending}
                  className="gap-1.5 gradient-brand text-primary-foreground"
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {sending ? "Sending…" : "Send Reply"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {inquiry.status === "resolved" && inquiry.resolved_at && (
          <div className="rounded-lg border-status-resolved/30 bg-status-resolved/5 border p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-status-resolved" />
              <span className="text-sm font-medium text-status-resolved">
                Resolved {format(new Date(inquiry.resolved_at), "MMM d, h:mm a")}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Email-style message bubble. Inbound (from the customer) sits left-aligned
// against the muted background; outbound (our reply) sits in a primary-tinted
// card. We render body_html when present and fall back to body_text with
// preserved newlines.
function MessageBubble({
  message,
  isLast,
  fallbackInboundName,
  fallbackInboundEmail,
}: {
  message: InquiryMessageRow;
  isLast: boolean;
  fallbackInboundName: string;
  fallbackInboundEmail: string | null;
}) {
  const isOutbound = message.direction === "outbound";
  const fromName = isOutbound
    ? "Fit Logic"
    : (message.from_name ?? fallbackInboundName);
  const fromEmail = isOutbound
    ? null
    : (message.from_email ?? fallbackInboundEmail);
  const bodyHtml = useMemo(() => {
    if (message.body_html) {
      // Transactional emails (Resend/SendGrid/Mailchimp) ship a full HTML
      // document including <!doctype>, <head>, <style>, MSO conditional
      // comments etc. DOMPurify already drops <head>, but pre-stripping
      // gives a cleaner sanitization pass.
      const stripped = message.body_html
        .replace(/<!doctype[\s\S]*?>/gi, "")
        .replace(/<\/?html[^>]*>/gi, "")
        .replace(/<head[\s\S]*?<\/head>/gi, "")
        .replace(/<\/?body[^>]*>/gi, "")
        .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/g, ""); // MSO conditional
      return DOMPurify.sanitize(stripped, {
        ALLOWED_TAGS: [
          "p", "br", "hr", "strong", "b", "em", "i", "u", "a", "ul", "ol", "li",
          "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "div", "span",
          "img", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
          "pre", "code", "small", "sub", "sup",
        ],
        ALLOWED_ATTR: [
          "href", "target", "rel", "src", "alt", "width", "height", "style",
          "class", "align", "valign", "bgcolor", "border", "cellpadding",
          "cellspacing", "colspan", "rowspan", "role",
        ],
        FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button"],
      });
    }
    const text = message.body_text ?? "";
    return text
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");
  }, [message.body_html, message.body_text]);

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden shadow-sm",
        isOutbound ? "border-primary/20 bg-primary/[0.03]" : "border-border bg-card",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-3 px-4 py-2 border-b",
          isOutbound ? "border-primary/10 bg-primary/5" : "border-border bg-muted/30",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0",
              isOutbound ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
            )}
          >
            {isOutbound ? "FL" : (fromName?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight truncate">
              {fromName}
              {fromEmail && (
                <span className="text-muted-foreground font-normal"> &lt;{fromEmail}&gt;</span>
              )}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              {format(new Date(message.created_at), "MMM d, yyyy · h:mm a")}
              <span className="mx-1.5 opacity-60">·</span>
              {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {message.status === "failed" && (
            <Badge variant="destructive" className="text-[9px]">Failed</Badge>
          )}
          {isLast && message.direction === "inbound" && (
            <Badge variant="outline" className="text-[9px]">Latest</Badge>
          )}
          {isOutbound && message.status === "sent" && (
            <Badge variant="outline" className="text-[9px] text-emerald-700 border-emerald-300/50 bg-emerald-50">
              Sent
            </Badge>
          )}
          {message.provider && (
            <Badge variant="outline" className="text-[9px] font-mono">{message.provider}</Badge>
          )}
        </div>
      </div>
      {message.subject && (
        <div className="px-4 pt-3">
          <p className="text-sm font-semibold">{message.subject}</p>
        </div>
      )}
      <div
        className={cn(
          "px-4 py-3 prose prose-sm max-w-none",
          "prose-p:my-2 prose-headings:mb-3 prose-headings:mt-4",
          "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-ul:list-disc prose-ol:list-decimal prose-ul:pl-6 prose-ol:pl-6",
          "prose-blockquote:border-l-2 prose-blockquote:border-muted prose-blockquote:pl-4 prose-blockquote:italic",
          "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
          "text-foreground",
        )}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
      {message.attachments && message.attachments.length > 0 && (
        <div className="border-t border-border/70 bg-muted/20 px-4 py-2 flex items-center gap-2 flex-wrap">
          <Paperclip className="h-3 w-3 text-muted-foreground" />
          {message.attachments.map((a, i) => (
            <Badge key={i} variant="outline" className="text-[10px] gap-1">
              {a.filename}
            </Badge>
          ))}
        </div>
      )}
      {message.error_message && (
        <div className="border-t border-destructive/20 bg-destructive/5 px-4 py-2">
          <p className="text-[11px] text-destructive">{message.error_message}</p>
        </div>
      )}
    </div>
  );
}
