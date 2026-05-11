"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { nextBusinessDay8amChicago } from "@/lib/texas-time";
import {
  ArrowLeft, Pencil, Clock, Pause, Play, Send, Eye, Users,
  ChevronDown, ChevronUp, Mail, Layers, UserPlus, Calendar,
  CalendarClock, Shield, X, MousePointerClick, Activity, RotateCcw, Zap, Save, MapPin,
  FlaskConical, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { EmailPreview } from "@/components/EmailPreview";
import { RichEmailEditor, type EmailAttachment } from "@/components/RichEmailEditor";
import { CampaignRecipients, type Recipient } from "@/components/CampaignRecipients";
import { CAMPAIGN_STATUS_CONFIG, type CampaignStatus } from "@/lib/types";
import { CampaignActivityLog } from "@/components/CampaignActivityLog";

interface CampaignRow {
  id: string; name: string; status: string; campaign_type: string;
  template_id: string | null; segment_id: string | null;
  scheduled_at: string | null; sent_at: string | null; stats: any;
  created_at: string; updated_at: string;
  auto_schedule?: boolean; max_sends_per_day?: number;
  business_hours_start?: number; business_hours_end?: number;
  business_days?: string[];
  recipient_count?: number; sent_count?: number;
}

interface Props {
  campaign: CampaignRow;
  onBack: () => void;
  onEdit: (c: CampaignRow) => void;
}

const RECIPIENT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  sent: "bg-primary/10 text-primary",
  delivered: "bg-status-resolved/10 text-status-resolved",
  opened: "bg-category-scheduling/10 text-category-scheduling",
  clicked: "bg-category-health/10 text-category-health",
  bounced: "bg-status-pending/10 text-status-pending",
  failed: "bg-destructive/10 text-destructive",
  skipped: "bg-muted text-muted-foreground",
};

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CampaignDetail({ campaign, onBack, onEdit }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const cfg = CAMPAIGN_STATUS_CONFIG[campaign.status as CampaignStatus] || CAMPAIGN_STATUS_CONFIG.draft;
  const [expandedSequence, setExpandedSequence] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState("overview");
  const [showAddRecipients, setShowAddRecipients] = useState(false);
  const [newRecipients, setNewRecipients] = useState<Recipient[]>([]);
  const [showSchedulePanel, setShowSchedulePanel] = useState(false);
  const [showSendLog, setShowSendLog] = useState(false);

  // Email editing
  const [editingEmail, setEditingEmail] = useState<{
    type: "template" | "sequence";
    id: string;
    subject: string;
    previewText: string;
    bodyHtml: string;
    attachments: EmailAttachment[];
    stepNumber?: number;
  } | null>(null);

  // Schedule config state
  const [scheduleDate, setScheduleDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [autoSchedule, setAutoSchedule] = useState(campaign.auto_schedule ?? true);
  const [maxSendsPerDay, setMaxSendsPerDay] = useState(campaign.max_sends_per_day ?? 50);
  const [businessHoursStart, setBusinessHoursStart] = useState(campaign.business_hours_start ?? 8);
  const [businessHoursEnd, setBusinessHoursEnd] = useState(campaign.business_hours_end ?? 18);
  const [businessDays, setBusinessDays] = useState<string[]>(campaign.business_days ?? ["Mon", "Tue", "Wed", "Thu", "Fri"]);

  const { data: recipients = [], refetch: refetchRecipients } = useQuery({
    queryKey: ["campaign-recipients", campaign.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_recipients").select("*").eq("campaign_id", campaign.id).order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // Test-mode flag from practice_settings — drives the banner that warns the
  // user "Send Now" will only deliver to flagged test contacts. Toggle in
  // Settings → Campaign Defaults. Cast through unknown — auto-generated
  // supabase types predate this column.
  const { data: testModeOnly = true } = useQuery({
    queryKey: ["practice_settings_test_mode"],
    queryFn: async () => {
      const res = await (supabase.from("practice_settings") as unknown as {
        select: (cols: string) => { limit: (n: number) => { single: () => Promise<{ data: { test_mode_only?: boolean } | null }> } };
      })
        .select("test_mode_only")
        .limit(1)
        .single();
      return res.data?.test_mode_only ?? true;
    },
    staleTime: 30_000,
  });

  const { data: sendLog = [] } = useQuery({
    queryKey: ["campaign-send-log", campaign.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_send_log")
        .select("id, status, step_number, sent_at, error_message, opened_at, clicked_at, tracking_id, recipient_id")
        .eq("campaign_id", campaign.id)
        .order("sent_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: showSendLog,
  });

  const { data: sequences = [] } = useQuery({
    queryKey: ["campaign-sequences", campaign.id],
    queryFn: async () => {
      if (campaign.campaign_type !== "sequence") return [];
      const { data, error } = await supabase
        .from("campaign_sequences").select("*").eq("campaign_id", campaign.id).order("step_number");
      if (error) throw error;
      return data;
    },
  });

  const { data: template } = useQuery({
    queryKey: ["campaign-template", campaign.template_id],
    queryFn: async () => {
      if (!campaign.template_id) return null;
      const { data, error } = await supabase
        .from("email_templates").select("*").eq("id", campaign.template_id).single();
      if (error) return null;
      return data;
    },
    enabled: !!campaign.template_id,
  });

  const updateStatusMut = useMutation({
    mutationFn: async (upd: TablesUpdate<"campaigns">) => {
      const { error } = await supabase.from("campaigns").update(upd).eq("id", campaign.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  const addRecipientsMut = useMutation({
    mutationFn: async (recs: Recipient[]) => {
      const existingEmails = new Set(recipients.map(r => r.email.toLowerCase()));
      const toAdd = recs.filter(r => !existingEmails.has(r.email.toLowerCase()));
      if (toAdd.length === 0) throw new Error("All contacts are already in this campaign");
      
      const { error } = await supabase.from("campaign_recipients").insert(
        toAdd.map(r => ({
          campaign_id: campaign.id,
          email: r.email,
          name: r.name,
          patient_id: r.patient_id || null,
          source: r.source,
          status: "pending",
          current_step: 0,
        }))
      );
      if (error) throw error;

      await supabase.from("campaigns").update({
        recipient_count: recipients.length + toAdd.length,
      }).eq("id", campaign.id);

      return toAdd.length;
    },
    onSuccess: (count) => {
      refetchRecipients();
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setShowAddRecipients(false);
      setNewRecipients([]);
      toast({ title: `Added ${count} recipient(s)` });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sendNowMut = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const { error } = await supabase.from("campaigns").update({
        status: "scheduled",
        scheduled_at: now,
        auto_schedule: true,
        max_sends_per_day: maxSendsPerDay,
        business_hours_start: 0,
        business_hours_end: 23,
        business_days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      }).eq("id", campaign.id);
      if (error) throw error;

      // Trigger the queue and inspect what actually happened. Previously this
      // was fire-and-forget: a silent zero-send (test mode skipping every
      // recipient, missing Resend key, etc.) looked like success in the UI.
      const res = await fetch("/api/process-campaign-queue", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? `Queue returned ${res.status}`);
      }
      // Find this campaign's row in the response
      const row = (data?.processed as Array<{ campaign_id?: string; sent?: number; failed?: number; skipped?: number; skip_reasons?: { test_mode?: number; suppressed?: number; unsubscribed?: number; no_sequence_step?: number; sequence_completed?: number; sequence_delay?: number }; first_error?: string | null; recipients_considered?: number }> | undefined)
        ?.find(r => r.campaign_id === campaign.id);
      return {
        row,
        testModeOnly: !!data?.test_mode_only,
        providerConfigured: data?.provider_configured as { resend?: boolean; gmail?: boolean; from_address?: boolean } | undefined,
      };
    },
    onSuccess: ({ row, testModeOnly, providerConfigured }) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      refetchRecipients();

      const isSeq = campaign.campaign_type === "sequence";
      const sent = row?.sent ?? 0;
      const failed = row?.failed ?? 0;
      const skipped = row?.skipped ?? 0;

      // Provider misconfiguration — flag immediately and stop.
      if (providerConfigured && !providerConfigured.resend && !providerConfigured.gmail) {
        toast({
          title: "No email provider configured",
          description: "Add a Resend API key in Settings → Email or connect Gmail. Nothing was sent.",
          variant: "destructive",
        });
        return;
      }
      if (providerConfigured && !providerConfigured.from_address) {
        toast({
          title: "Missing 'From' address",
          description: "Set a sender email in Settings → Email. Nothing was sent.",
          variant: "destructive",
        });
        return;
      }

      if (sent > 0) {
        toast({
          title: isSeq ? `Step 1 sent to ${sent} recipient${sent === 1 ? "" : "s"}` : `Sending to ${sent} recipient${sent === 1 ? "" : "s"}`,
          description: skipped > 0 || failed > 0
            ? `${skipped > 0 ? `${skipped} skipped` : ""}${skipped > 0 && failed > 0 ? ", " : ""}${failed > 0 ? `${failed} failed` : ""}.${isSeq ? " Remaining steps will follow the scheduled cadence." : ""}`
            : isSeq ? "Remaining steps will follow the scheduled cadence." : "Emails are going out now.",
        });
        return;
      }

      // Zero sent — figure out why and tell the user.
      const tm = row?.skip_reasons?.test_mode ?? 0;
      const sup = row?.skip_reasons?.suppressed ?? 0;
      const uns = row?.skip_reasons?.unsubscribed ?? 0;
      const nss = row?.skip_reasons?.no_sequence_step ?? 0;
      const sc = row?.skip_reasons?.sequence_completed ?? 0;
      const sd = row?.skip_reasons?.sequence_delay ?? 0;

      // Sequence config bug: recipient is at current_step=0 but the sequence
      // has no step_number=1 row. The campaign was saved without any steps,
      // or step numbering is off.
      if (nss > 0) {
        toast({
          title: "Sequence has no step 1",
          description: `${nss} recipient${nss === 1 ? "" : "s"} couldn't be sent because the sequence is empty. Edit the campaign and add at least one email step, then try Send Now again.`,
          variant: "destructive",
        });
        return;
      }

      if (testModeOnly && tm > 0) {
        toast({
          title: "Nothing sent — test mode is on",
          description: `${tm} recipient${tm === 1 ? "" : "s"} skipped because they aren't flagged "Test Contact". Toggle ${tm === 1 ? "that contact" : "those contacts"} to is_test_contact=true, or turn off test mode in Settings.`,
          variant: "destructive",
        });
        return;
      }

      if (sc > 0 && sent === 0) {
        toast({
          title: "All recipients have completed the sequence",
          description: `${sc} recipient${sc === 1 ? " has" : "s have"} already received every step. Add new recipients to send anything.`,
          variant: "destructive",
        });
        return;
      }

      if (sd > 0 && sent === 0) {
        toast({
          title: "Waiting on sequence delay",
          description: `${sd} recipient${sd === 1 ? "" : "s"} are inside the wait window before their next step. They'll send automatically once the delay elapses.`,
        });
        return;
      }
      if (sup + uns > 0 && sent === 0 && failed === 0) {
        toast({
          title: "All recipients skipped",
          description: `${sup} suppressed (bounced/complained), ${uns} unsubscribed. Add new recipients to send anything.`,
          variant: "destructive",
        });
        return;
      }
      if (failed > 0) {
        toast({
          title: `Send failed for ${failed} recipient${failed === 1 ? "" : "s"}`,
          description: row?.first_error ?? "Check the recipient list for per-row errors.",
          variant: "destructive",
        });
        return;
      }
      if (!row || (row.recipients_considered ?? 0) === 0) {
        toast({
          title: "No pending recipients",
          description: "This campaign has no recipients with status=pending. Add recipients first.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Nothing sent",
        description: "The queue ran but produced no sends. Check the recipient list for skip reasons.",
        variant: "destructive",
      });
    },
    onError: (e) => toast({ title: "Send failed", description: e.message, variant: "destructive" }),
  });

  const saveEmailMut = useMutation({
    mutationFn: async () => {
      if (!editingEmail) return;
      // Auto-generated supabase types predate the `attachments` JSONB column
      // (added in migration 20260502000001). Cast through unknown so we can
      // include the field in the update payload without typegen regeneration.
      // Defensive write: try with attachments, fall back to legacy columns
      // if the column doesn't exist yet (migration not applied). Otherwise
      // the user's edit silently fails with "column does not exist".
      const tryUpdate = async (table: "email_templates" | "campaign_sequences", withAttachments: boolean) => {
        const base: Record<string, unknown> = editingEmail.type === "template"
          ? {
              subject: editingEmail.subject,
              preview_text: editingEmail.previewText,
              body_html: editingEmail.bodyHtml,
            }
          : {
              subject_override: editingEmail.subject,
              body_html_override: editingEmail.bodyHtml,
            };
        if (withAttachments) base.attachments = editingEmail.attachments;
        return (supabase.from(table) as unknown as {
          update: (vals: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: { message: string; code?: string } | null }> };
        })
          .update(base)
          .eq("id", editingEmail.id);
      };

      const table = editingEmail.type === "template" ? "email_templates" : "campaign_sequences";
      const first = await tryUpdate(table, true);
      if (first.error) {
        // Most common cause: attachments column missing because migration
        // hasn't been applied. Retry without it so the user's edit lands.
        console.warn("[CampaignDetail] save with attachments failed; retrying without", {
          table, error: first.error.message,
        });
        if ((editingEmail.attachments?.length ?? 0) > 0) {
          throw new Error(`Cannot save attachments — DB migration not applied yet. Apply migration 20260502000001_email_attachments.sql, or remove attachments and try again. (${first.error.message})`);
        }
        const second = await tryUpdate(table, false);
        if (second.error) throw new Error(second.error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-template", campaign.template_id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-sequences", campaign.id] });
      setEditingEmail(null);
      toast({ title: "Email saved" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Reset recipients that were silently marked "completed" by the queue
  // because the sequence had no step 1. After the user fixes the sequence,
  // they need a way to put those recipients back into the pending pool.
  const resetStuckMut = useMutation({
    mutationFn: async () => {
      const stuck = recipients.filter(
        (r) => r.status === "completed" && (r.last_error?.includes("Sequence has no step") ?? false),
      );
      if (stuck.length === 0) throw new Error("No stuck recipients to reset");
      const ids = stuck.map((r) => r.id);
      const { error } = await supabase
        .from("campaign_recipients")
        .update({ status: "pending", last_error: null, current_step: 0 })
        .in("id", ids);
      if (error) throw error;
      return stuck.length;
    },
    onSuccess: (count) => {
      refetchRecipients();
      toast({ title: `Reset ${count} recipient${count === 1 ? "" : "s"} back to pending. Click Send Now to retry.` });
    },
    onError: (e) => toast({ title: "Reset failed", description: e.message, variant: "destructive" }),
  });

  const retryFailedMut = useMutation({
    mutationFn: async () => {
      const failedRecipients = recipients.filter(r => r.status === "failed");
      if (failedRecipients.length === 0) throw new Error("No failed recipients to retry");
      const failedIds = failedRecipients.map(r => r.id);
      const { error } = await supabase.from("campaign_recipients")
        .update({ status: "pending", last_error: null })
        .in("id", failedIds);
      if (error) throw error;

      // If campaign is sent/paused, set back to scheduled so the queue picks it up
      if (["sent", "paused", "draft"].includes(campaign.status)) {
        await supabase.from("campaigns").update({
          status: "scheduled",
          scheduled_at: new Date().toISOString(),
        }).eq("id", campaign.id);
      }
      return failedRecipients.length;
    },
    onSuccess: (count) => {
      refetchRecipients();
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast({ title: `Retrying ${count} failed recipient(s)`, description: "They'll be picked up within 1 minute." });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Calculate next 8am Texas time for scheduling. Uses the DST-aware helper
  // — the previous version hardcoded 14:00 UTC, which is 8am CST in winter
  // but 9am CDT in summer, and skipped weekends using server-local getDay()
  // which is wrong on UTC servers when Chicago/UTC days disagree.
  const getNext8amTexas = () => nextBusinessDay8amChicago().toISOString();

  const handleConfirmSchedule = () => {
    const next8amTexas = getNext8amTexas();
    updateStatusMut.mutate({
      status: "scheduled",
      scheduled_at: next8amTexas,
      auto_schedule: autoSchedule,
      max_sends_per_day: maxSendsPerDay,
      business_hours_start: 8, // Hardcoded 8am Texas
      business_hours_end: 9,   // Hardcoded (8am-9am window)
      business_days: ["Mon", "Tue", "Wed", "Thu", "Fri"], // Hardcoded weekdays
    });
    setShowSchedulePanel(false);
    toast({ title: "Campaign scheduled", description: "Emails will start sending at 8:00 AM Texas time on the next business day." });
  };

  const sentRecipients = recipients.filter(r => r.status !== "pending");
  const failedRecipients = recipients.filter(r => r.status === "failed");
  const pendingRecipients = recipients.filter(r => r.status === "pending");
  const totalDays = sequences.reduce((sum: number, s: any) => sum + (s.delay_days || 0), 0);
  const estimatedSendDays = maxSendsPerDay > 0 ? Math.ceil(recipients.length / maxSendsPerDay) : 0;
  // Sequence campaigns NEED at least one row in campaign_sequences. Without
  // that the queue silently completes every recipient — gate Send Now / Schedule
  // on the row count to short-circuit that path.
  const isUnsendable = campaign.campaign_type === "sequence" && sequences.length === 0;
  // Recipients the queue silently completed because step 1 didn't exist.
  // Used to surface a "reset and retry" CTA on the banner.
  const stuckRecipients = recipients.filter(
    (r) => r.status === "completed" && (r.last_error?.includes("Sequence has no step") ?? false),
  );
  const sendNowDisabledReason = isUnsendable
    ? "Sequence has no email steps — edit the campaign and add at least one step."
    : recipients.length === 0
      ? "Add at least one recipient first."
      : "";

  const toggleDay = (day: string) => {
    setBusinessDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <h1 className="font-heading text-xl font-bold text-foreground">{campaign.name}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge className={`${cfg.bgColor} ${cfg.color} border-0 text-xs`}>{cfg.label}</Badge>
            {campaign.campaign_type === "sequence" && (
              <Badge variant="outline" className="text-[10px]">
                <Layers className="h-2.5 w-2.5 mr-0.5" />Sequence • {sequences.length} emails • {totalDays} days
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{recipients.length} recipients</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAddRecipients(true)}>
            <UserPlus className="h-3.5 w-3.5 mr-1" />Add People
          </Button>
          {campaign.status === "draft" && (
            <>
              <Button variant="outline" size="sm" onClick={() => onEdit(campaign)}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
              <Button variant="outline" size="sm"
                onClick={() => sendNowMut.mutate()}
                disabled={!!sendNowDisabledReason || sendNowMut.isPending}
                title={sendNowDisabledReason || undefined}>
                <Zap className="h-3.5 w-3.5 mr-1" />{sendNowMut.isPending ? "Sending..." : "Send Now"}
              </Button>
              <Button size="sm" className="gradient-brand text-primary-foreground"
                onClick={() => setShowSchedulePanel(true)}
                disabled={!!sendNowDisabledReason}
                title={sendNowDisabledReason || undefined}>
                <CalendarClock className="h-3.5 w-3.5 mr-1" />Schedule
              </Button>
            </>
          )}
          {campaign.status === "scheduled" && (
            <Button variant="outline" size="sm" onClick={() => {
              updateStatusMut.mutate({ status: "paused" });
              toast({ title: "Campaign paused" });
            }}>
              <Pause className="h-3.5 w-3.5 mr-1" />Pause
            </Button>
          )}
          {campaign.status === "paused" && (
            <>
              <Button size="sm" className="gradient-brand text-primary-foreground"
                onClick={() => setShowSchedulePanel(true)}>
                <Play className="h-3.5 w-3.5 mr-1" />Resume
              </Button>
              <Button variant="outline" size="sm"
                onClick={() => sendNowMut.mutate()}
                disabled={isUnsendable || sendNowMut.isPending}
                title={isUnsendable ? "Sequence has no email steps — edit and add at least one step." : undefined}>
                <Zap className="h-3.5 w-3.5 mr-1" />Send Now
              </Button>
            </>
          )}
          {(campaign.status === "sent" || campaign.status === "sending") && failedRecipients.length > 0 && (
            <Button variant="outline" size="sm"
              onClick={() => retryFailedMut.mutate()}
              disabled={retryFailedMut.isPending}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />{retryFailedMut.isPending ? "Retrying..." : `Retry ${failedRecipients.length} Failed`}
            </Button>
          )}
          {failedRecipients.length > 0 && !["sent", "sending"].includes(campaign.status) && (
            <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => retryFailedMut.mutate()}
              disabled={retryFailedMut.isPending}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />Retry {failedRecipients.length} Failed
            </Button>
          )}
        </div>
      </div>

      {/* Empty-sequence banner — a sequence campaign with zero rows in
          campaign_sequences will silently mark every recipient as completed
          without sending. Surface that hard so the user can fix it. */}
      {campaign.campaign_type === "sequence" && sequences.length === 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3">
          <div className="h-9 w-9 rounded-md bg-destructive/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-destructive">This sequence has no email steps</p>
            <p className="text-xs text-destructive/90 mt-1">
              Send Now and the daily 8am Texas cron will silently mark every recipient as <code className="px-1 rounded bg-destructive/10 font-mono text-[11px]">completed</code> without sending anything.
              Click <strong>Edit</strong> above and add at least one step (with subject + body), then save.
            </p>
          </div>
        </div>
      )}

      {/* Recovery banner — recipients the queue silently completed because
          step 1 was missing. After the user fixes the sequence, this lets
          them flip those recipients back to pending in one click. */}
      {!isUnsendable && stuckRecipients.length > 0 && (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
          <div className="h-9 w-9 rounded-md bg-amber-500/15 flex items-center justify-center shrink-0">
            <RotateCcw className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              {stuckRecipients.length} recipient{stuckRecipients.length === 1 ? "" : "s"} stuck from a previous run
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200/80 mt-1">
              {stuckRecipients.length === 1 ? "This recipient was" : "These recipients were"} silently marked completed when the sequence was empty. Now that step 1 exists, reset {stuckRecipients.length === 1 ? "it" : "them"} to pending so Send Now can retry.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-400/50 text-amber-900 dark:text-amber-200 hover:bg-amber-500/10"
            onClick={() => resetStuckMut.mutate()}
            disabled={resetStuckMut.isPending}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            {resetStuckMut.isPending ? "Resetting…" : "Reset to pending"}
          </Button>
        </div>
      )}

      {/* Test-mode banner — when practice_settings.test_mode_only is on, only
          contacts flagged is_test_contact=true receive sends. Without this
          banner, "Send Now" silently produces 0 emails because every other
          recipient gets skipped server-side. */}
      {testModeOnly && (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
          <div className="h-9 w-9 rounded-md bg-amber-500/15 flex items-center justify-center shrink-0">
            <FlaskConical className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Test mode is on
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200/80 mt-1">
              Only contacts flagged <code className="px-1 rounded bg-amber-500/15 font-mono text-[11px]">is_test_contact</code> receive sends. Anyone else in this campaign will be silently skipped on Send Now and the daily 8am Texas cron.
              <button
                type="button"
                onClick={() => router.push("/settings?tab=campaigns")}
                className="ml-1 font-semibold underline-offset-2 hover:underline"
              >
                Open Settings
              </button>
              {" to disable test mode, or flag your test contacts in the Contacts page."}
            </p>
          </div>
        </div>
      )}

      {/* Inline Schedule Panel */}
      {showSchedulePanel && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                Schedule Campaign
              </h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSchedulePanel(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* 8am Texas Time Info */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
              <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground">Emails send daily at 8:00 AM Texas time</p>
                <p className="text-[10px] text-muted-foreground">Monday through Friday only. Campaign will start on the next business day.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Max sends per day */}
              <div>
                <Label className="text-xs">Max Emails Per Day</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number" min={1} max={50}
                    value={maxSendsPerDay}
                    onChange={e => setMaxSendsPerDay(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="h-9 text-sm w-24"
                  />
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Shield className="h-3 w-3" />Max 50/day for deliverability
                  </span>
                </div>
              </div>

              {/* Auto-schedule toggle */}
              <div className="flex items-center justify-between rounded-lg border p-3 bg-background">
                <div>
                  <p className="text-xs font-medium text-foreground">Auto-Schedule</p>
                  <p className="text-[10px] text-muted-foreground">Space sends across days</p>
                </div>
                <Switch checked={autoSchedule} onCheckedChange={setAutoSchedule} />
              </div>
            </div>

            <Separator />

            {/* Summary + confirm */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  {recipients.length} recipients → ~{estimatedSendDays} business day{estimatedSendDays !== 1 ? "s" : ""} to complete
                </p>
                {campaign.campaign_type === "sequence" && (
                  <p className="flex items-center gap-1.5">
                    <Layers className="h-3 w-3" />
                    {sequences.length} emails over {totalDays} days per recipient
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowSchedulePanel(false)}>Cancel</Button>
                <Button size="sm" className="gradient-brand text-primary-foreground" onClick={handleConfirmSchedule}
                  disabled={recipients.length === 0 || updateStatusMut.isPending}>
                  <Send className="h-3.5 w-3.5 mr-1" />
                  {updateStatusMut.isPending ? "Scheduling..." : "Confirm & Schedule"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-primary/10 p-2.5"><Users className="h-4 w-4 text-primary" /></div><div><p className="text-xs text-muted-foreground">Recipients</p><p className="text-lg font-bold font-heading">{recipients.length}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-status-resolved/10 p-2.5"><Send className="h-4 w-4 text-status-resolved" /></div><div><p className="text-xs text-muted-foreground">Sent</p><p className="text-lg font-bold font-heading">{sentRecipients.length}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-muted p-2.5"><Clock className="h-4 w-4 text-muted-foreground" /></div><div><p className="text-xs text-muted-foreground">Pending</p><p className="text-lg font-bold font-heading">{pendingRecipients.length}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-category-scheduling/10 p-2.5"><Eye className="h-4 w-4 text-category-scheduling" /></div><div><p className="text-xs text-muted-foreground">Opened</p><p className="text-lg font-bold font-heading">{recipients.filter(r => r.opened_at).length}</p>{recipients.length > 0 && sentRecipients.length > 0 && <p className="text-[10px] text-muted-foreground">{Math.round((recipients.filter(r => r.opened_at).length / sentRecipients.length) * 100)}%</p>}</div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-category-health/10 p-2.5"><MousePointerClick className="h-4 w-4 text-category-health" /></div><div><p className="text-xs text-muted-foreground">Clicked</p><p className="text-lg font-bold font-heading">{recipients.filter(r => r.clicked_at).length}</p>{recipients.length > 0 && sentRecipients.length > 0 && <p className="text-[10px] text-muted-foreground">{Math.round((recipients.filter(r => r.clicked_at).length / sentRecipients.length) * 100)}%</p>}</div></CardContent></Card>
      </div>

      {/* Progress bar */}
      {recipients.length > 0 && (
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Send Progress</span>
            <span className="font-semibold">{Math.round((sentRecipients.length / recipients.length) * 100)}%</span>
          </div>
          <Progress value={(sentRecipients.length / recipients.length) * 100} className="h-2" />
        </div>
      )}

      {/* Sequence Timeline (visual overview for sequences) */}
      {campaign.campaign_type === "sequence" && sequences.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-3 rounded-lg border bg-muted/20 overflow-x-auto">
          {sequences.map((s: any, i: number) => (
            <div key={s.id} className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setExpandedSequence(expandedSequence === s.id ? null : s.id)}
                className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold transition-colors ${
                  expandedSequence === s.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/15 text-primary hover:bg-primary/25"
                }`}
              >
                {i + 1}
              </button>
              {i < sequences.length - 1 && (
                <div className="flex items-center gap-0.5 px-1">
                  <div className="w-6 h-px bg-border" />
                  <span className="text-[9px] text-muted-foreground font-medium">{sequences[i + 1].delay_days}d</span>
                  <div className="w-6 h-px bg-border" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeDetailTab} onValueChange={setActiveDetailTab}>
        <TabsList>
          <TabsTrigger value="overview" className="text-xs"><Mail className="h-3 w-3 mr-1" />Email Content</TabsTrigger>
          <TabsTrigger value="recipients" className="text-xs"><Users className="h-3 w-3 mr-1" />Recipients ({recipients.length})</TabsTrigger>
          <TabsTrigger value="activity" className="text-xs"><Activity className="h-3 w-3 mr-1" />Activity Log</TabsTrigger>
          <TabsTrigger value="sendlog" className="text-xs" onClick={() => setShowSendLog(true)}>
            <Send className="h-3 w-3 mr-1" />Send Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {campaign.campaign_type === "single" && template && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditingEmail({
                  type: "template", id: template.id,
                  subject: template.subject, previewText: template.preview_text || "",
                  bodyHtml: template.body_html || "",
                  attachments: Array.isArray((template as unknown as { attachments?: EmailAttachment[] }).attachments)
                    ? (template as unknown as { attachments: EmailAttachment[] }).attachments
                    : [],
                })}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />Edit Email
                </Button>
              </div>
              <EmailPreview html={template.body_html || ""} subject={template.subject} previewText={template.preview_text || undefined} />
            </div>
          )}
          {campaign.campaign_type === "single" && !template && (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No template linked. Edit this campaign to add one.</CardContent></Card>
          )}
          {campaign.campaign_type === "sequence" && sequences.length > 0 && (
            <div className="space-y-3">
              {sequences.map((s: any, i: number) => {
                const isOpen = expandedSequence === s.id;
                return (
                  <Card key={s.id} className={`transition-colors ${isOpen ? "border-primary/40" : ""}`}>
                    <button
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedSequence(isOpen ? null : s.id)}
                    >
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0">Step {s.step_number}</Badge>
                      {i > 0 && <span className="text-[10px] text-muted-foreground">+{s.delay_days}d</span>}
                      <span className="text-sm font-medium truncate flex-1">{s.subject_override || "No subject"}</span>
                      <Pencil
                        className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground shrink-0"
                        onClick={(e) => { e.stopPropagation(); setEditingEmail({
                          type: "sequence", id: s.id,
                          subject: s.subject_override || "", previewText: "",
                          bodyHtml: s.body_html_override || "",
                          attachments: Array.isArray((s as unknown as { attachments?: EmailAttachment[] }).attachments)
                            ? (s as unknown as { attachments: EmailAttachment[] }).attachments
                            : [],
                          stepNumber: s.step_number,
                        }); }}
                      />
                      {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 border-t">
                        <EmailPreview html={s.body_html_override || ""} subject={s.subject_override || ""} className="mt-3" />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
          {campaign.campaign_type === "sequence" && sequences.length === 0 && (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No sequence steps yet. Edit this campaign to add emails.</CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="recipients" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {recipients.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No recipients added yet.</p>
              ) : (
                <ScrollArea className="max-h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Email</TableHead>
                        <TableHead className="text-xs">Source</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Sent</TableHead>
                        <TableHead className="text-xs">Opened</TableHead>
                        <TableHead className="text-xs">Clicked</TableHead>
                        {campaign.campaign_type === "sequence" && <TableHead className="text-xs">Step</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recipients.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs font-medium">{r.name || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.email}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[9px]">{r.source === "customer" ? "CRM" : r.source === "csv_import" ? "CSV" : "Manual"}</Badge></TableCell>
                          <TableCell><Badge className={`${RECIPIENT_STATUS_COLORS[r.status] || "bg-muted"} border-0 text-[10px]`}>{r.status}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.sent_at ? new Date(r.sent_at).toLocaleDateString() : "—"}</TableCell>
                          <TableCell className="text-xs">{r.opened_at ? <Badge className="bg-category-scheduling/10 text-category-scheduling border-0 text-[9px]">Yes</Badge> : "—"}</TableCell>
                          <TableCell className="text-xs">{r.clicked_at ? <Badge className="bg-category-health/10 text-category-health border-0 text-[9px]">Yes</Badge> : "—"}</TableCell>
                          {campaign.campaign_type === "sequence" && <TableCell className="text-xs">{r.current_step || 0}/{sequences.length}</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <CampaignActivityLog campaignId={campaign.id} />
        </TabsContent>

        <TabsContent value="sendlog" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {sendLog.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  {showSendLog ? "No send log entries yet." : "Loading…"}
                </p>
              ) : (
                <ScrollArea className="max-h-[450px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Step</TableHead>
                        <TableHead className="text-xs">Sent At</TableHead>
                        <TableHead className="text-xs">Opened</TableHead>
                        <TableHead className="text-xs">Clicked</TableHead>
                        <TableHead className="text-xs">Error</TableHead>
                        <TableHead className="text-xs">Tracking ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sendLog.map((log: any) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            <Badge className={`border-0 text-[10px] ${
                              log.status === "sent" ? "bg-primary/10 text-primary" :
                              log.status === "failed" ? "bg-destructive/10 text-destructive" :
                              log.status === "bounced" ? "bg-amber-500/10 text-amber-600" :
                              "bg-muted text-muted-foreground"
                            }`}>{log.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{log.step_number ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{log.sent_at ? new Date(log.sent_at).toLocaleString() : "—"}</TableCell>
                          <TableCell className="text-xs">{log.opened_at ? <Badge className="bg-emerald-500/10 text-emerald-600 border-0 text-[9px]">Yes</Badge> : "—"}</TableCell>
                          <TableCell className="text-xs">{log.clicked_at ? <Badge className="bg-blue-500/10 text-blue-600 border-0 text-[9px]">Yes</Badge> : "—"}</TableCell>
                          <TableCell className="text-xs text-destructive max-w-[180px] truncate" title={log.error_message ?? ""}>{log.error_message || "—"}</TableCell>
                          <TableCell className="text-[10px] text-muted-foreground font-mono max-w-[80px] truncate" title={log.tracking_id ?? ""}>{log.tracking_id?.slice(0, 8) ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Schedule info (when already scheduled) */}
      {campaign.status !== "draft" && (campaign.auto_schedule || campaign.scheduled_at) && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-primary" />
              <span className="font-medium text-foreground">
                {campaign.status === "scheduled" ? "Scheduled" : campaign.status === "paused" ? "Paused" : "Schedule Settings"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {campaign.scheduled_at && (
                <p>Start: {new Date(campaign.scheduled_at).toLocaleString()}</p>
              )}
              {campaign.auto_schedule && (
                <p>
                  Up to {campaign.max_sends_per_day} emails/day, {campaign.business_hours_start}:00–{campaign.business_hours_end}:00,
                  {" "}{campaign.business_days?.join(", ") || "Mon–Fri"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email Editor Dialog */}
      <Dialog open={!!editingEmail} onOpenChange={v => { if (!v) setEditingEmail(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editingEmail?.type === "sequence" ? `Edit Step ${editingEmail.stepNumber}` : "Edit Email"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
            <div>
              <Label className="text-xs">Subject Line</Label>
              <Input
                className="mt-1 h-9 text-sm"
                value={editingEmail?.subject ?? ""}
                onChange={e => setEditingEmail(p => p ? { ...p, subject: e.target.value } : p)}
                placeholder="Email subject…"
              />
            </div>
            {editingEmail?.type === "template" && (
              <div>
                <Label className="text-xs">Preview Text</Label>
                <Input
                  className="mt-1 h-9 text-sm"
                  value={editingEmail?.previewText ?? ""}
                  onChange={e => setEditingEmail(p => p ? { ...p, previewText: e.target.value } : p)}
                  placeholder="Short preview shown in inbox…"
                />
              </div>
            )}
            <div className="flex-1">
              <Label className="text-xs">Email Body</Label>
              <div className="mt-1">
                <RichEmailEditor
                  value={editingEmail?.bodyHtml ?? ""}
                  onChange={(html) => setEditingEmail(p => p ? { ...p, bodyHtml: html } : p)}
                  subject={editingEmail?.subject}
                  previewText={editingEmail?.previewText}
                  placeholder="Write your email here. Use double Enter for paragraphs. Click 'Insert Variable' to personalize with contact data."
                  minHeight={280}
                  attachments={editingEmail?.attachments ?? []}
                  onAttachmentsChange={(next) => setEditingEmail(p => p ? { ...p, attachments: next } : p)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEmail(null)}>Cancel</Button>
            <Button
              className="gradient-brand text-primary-foreground"
              onClick={() => saveEmailMut.mutate()}
              disabled={saveEmailMut.isPending || !editingEmail?.subject.trim()}
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              {saveEmailMut.isPending ? "Saving…" : "Save Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Recipients Dialog */}
      <Dialog open={showAddRecipients} onOpenChange={v => { if (!v) { setShowAddRecipients(false); setNewRecipients([]); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Recipients to "{campaign.name}"</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto py-2">
            <CampaignRecipients
              recipients={newRecipients}
              onChange={setNewRecipients}
              campaignId={campaign.id}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddRecipients(false); setNewRecipients([]); }}>Cancel</Button>
            <Button
              className="gradient-brand text-primary-foreground"
              onClick={() => addRecipientsMut.mutate(newRecipients)}
              disabled={newRecipients.length === 0 || addRecipientsMut.isPending}
            >
              {addRecipientsMut.isPending ? "Adding..." : `Add ${newRecipients.length} Recipient(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
