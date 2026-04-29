"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORY_CONFIG, type InquiryCategory } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { MessageSquare, FileText, Mail, Clock, Phone, Footprints, StickyNote, Plus } from "lucide-react";

type InteractionType = "call" | "walk_in" | "email" | "note";

type TimelineEvent = {
  id: string;
  type: "inquiry" | "intake" | "campaign" | "interaction";
  subtype?: InteractionType;
  title: string;
  description: string;
  date: string;
  status: string;
  meta?: Record<string, string>;
};

function eventIcon(type: TimelineEvent["type"], subtype?: InteractionType) {
  if (type === "interaction") {
    switch (subtype) {
      case "call":     return <Phone className="h-4 w-4" />;
      case "walk_in":  return <Footprints className="h-4 w-4" />;
      case "email":    return <Mail className="h-4 w-4" />;
      default:         return <StickyNote className="h-4 w-4" />;
    }
  }
  switch (type) {
    case "inquiry":  return <MessageSquare className="h-4 w-4" />;
    case "intake":   return <FileText className="h-4 w-4" />;
    case "campaign": return <Mail className="h-4 w-4" />;
  }
}

function eventColor(type: TimelineEvent["type"]) {
  switch (type) {
    case "interaction": return "bg-violet-500 text-white";
    case "inquiry":     return "bg-primary text-primary-foreground";
    case "intake":      return "bg-accent text-accent-foreground";
    case "campaign":    return "bg-secondary text-secondary-foreground";
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

const INTERACTION_TYPE_LABEL: Record<InteractionType, string> = {
  call: "Call",
  walk_in: "Walk-in",
  email: "Email",
  note: "Note",
};

type IntakeSubmissionRow = {
  id: string;
  patient_name: string;
  completion_status: string;
  review_status: string;
  created_at: string;
  submitted_at: string | null;
  form_id: string;
  intake_forms: { name: string } | null;
};

type CampaignRecipientRow = {
  id: string;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  created_at: string;
  campaigns: { name: string } | null;
};

type InteractionRow = {
  id: string;
  patient_id: string;
  type: InteractionType;
  occurred_at: string;
  body: string | null;
};

// LogInteractionDialog — A2.1: Megan logs a call/walk-in/email/note as a
// discrete event. The trigger button is rendered above the timeline.
function LogInteractionDialog({ patientId }: { patientId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<InteractionType>("call");
  const [occurredAt, setOccurredAt] = useState<string>(() => {
    const now = new Date();
    const tz = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - tz).toISOString().slice(0, 16);
  });
  const [body, setBody] = useState("");

  // Cast supabase to bypass stale auto-generated types — interactions table
  // was added in migration 20260429000002.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const interactionsTable = (supabase as any).from("interactions");

  const addMut = useMutation({
    mutationFn: async () => {
      const occurred = new Date(occurredAt).toISOString();
      const { error } = await interactionsTable.insert({
        patient_id: patientId,
        type,
        occurred_at: occurred,
        body: body.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-timeline", patientId] });
      // last_contacted_at is bumped server-side by the trigger; refresh the
      // patients list so the badge in Patients.tsx stays in sync.
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      setOpen(false);
      setBody("");
      toast({ title: `${INTERACTION_TYPE_LABEL[type]} logged` });
    },
    onError: (e: Error) => toast({ title: "Failed to log", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Log interaction
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log interaction</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as InteractionType)}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="walk_in">Walk-in</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">When</Label>
              <Input
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="h-9 mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="mt-1"
              placeholder="What did you discuss? Any next steps?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => addMut.mutate()} disabled={addMut.isPending}>
            {addMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PatientTimeline({ patientId }: { patientId: string }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["patient-timeline", patientId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const interactionsTable = (supabase as any).from("interactions");
      const [inquiriesRes, submissionsRes, recipientsRes, interactionsRes] = await Promise.all([
        supabase
          .from("inquiries")
          .select("id, raw_content, category, status, source, created_at")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("intake_submissions")
          .select("id, patient_name, completion_status, review_status, created_at, submitted_at, form_id, intake_forms(name)")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("campaign_recipients")
          .select("id, status, sent_at, opened_at, created_at, campaigns(name)")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false }),
        interactionsTable
          .select("id, patient_id, type, occurred_at, body")
          .eq("patient_id", patientId)
          .order("occurred_at", { ascending: false }),
      ]);

      if (inquiriesRes.error) throw inquiriesRes.error;
      if (submissionsRes.error) throw submissionsRes.error;
      if (recipientsRes.error) throw recipientsRes.error;
      // Don't fail the whole timeline if interactions fail (table may be
      // missing in dev environments that haven't applied the Phase 2
      // migration yet); just log and continue with an empty array.
      if (interactionsRes.error) {
        console.warn("[PatientTimeline] interactions read failed:", interactionsRes.error);
      }

      const timeline: TimelineEvent[] = [];

      for (const inq of inquiriesRes.data) {
        const catConfig = CATEGORY_CONFIG[inq.category as InquiryCategory];
        timeline.push({
          id: inq.id,
          type: "inquiry",
          title: `Inquiry — ${catConfig?.label ?? inq.category}`,
          description: inq.raw_content.length > 120
            ? inq.raw_content.slice(0, 120) + "…"
            : inq.raw_content,
          date: inq.created_at,
          status: inq.status,
          meta: { source: inq.source },
        });
      }

      for (const sub of submissionsRes.data as IntakeSubmissionRow[]) {
        const formName = sub.intake_forms?.name ?? "Form";
        timeline.push({
          id: sub.id,
          type: "intake",
          title: `Intake — ${formName}`,
          description: `Status: ${sub.completion_status} · Review: ${sub.review_status}`,
          date: sub.submitted_at ?? sub.created_at,
          status: sub.completion_status,
        });
      }

      for (const rec of recipientsRes.data as CampaignRecipientRow[]) {
        const campaignName = rec.campaigns?.name ?? "Campaign";
        const eventDate = rec.opened_at ?? rec.sent_at ?? rec.created_at;
        const description = rec.opened_at
          ? "Email opened"
          : rec.sent_at
            ? "Email delivered"
            : "Added to campaign";
        timeline.push({
          id: rec.id,
          type: "campaign",
          title: `Campaign — ${campaignName}`,
          description,
          date: eventDate,
          status: rec.status,
        });
      }

      for (const i of (interactionsRes.data ?? []) as InteractionRow[]) {
        timeline.push({
          id: i.id,
          type: "interaction",
          subtype: i.type,
          title: INTERACTION_TYPE_LABEL[i.type] ?? i.type,
          description: i.body ?? "",
          date: i.occurred_at,
          status: i.type,
        });
      }

      timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return timeline;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {events.length === 0 ? "No activity yet" : `${events.length} event${events.length === 1 ? "" : "s"}`}
        </p>
        <LogInteractionDialog patientId={patientId} />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Clock className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">No activity yet for this contact</p>
          <p className="text-[11px] mt-1">Use “Log interaction” above to record a call or walk-in.</p>
        </div>
      ) : (
        <div className="relative pl-6">
          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
          <div className="space-y-6">
            {events.map((event) => (
              <div key={event.id} className="relative flex gap-4">
                <div className={`absolute -left-6 mt-1 flex h-7 w-7 items-center justify-center rounded-full ${eventColor(event.type)} shrink-0 z-10`}>
                  {eventIcon(event.type, event.subtype)}
                </div>
                <Card className="flex-1 ml-4">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">{event.title}</p>
                        {event.description && (
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{event.description}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {event.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{formatDate(event.date)}</span>
                      {event.meta?.source && (
                        <span className="capitalize">via {event.meta.source}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
