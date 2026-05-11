"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Calendar, Plus, ExternalLink, X, Clock, User, Loader2, AlertTriangle, CheckCircle2, Mail, Video, List as ListIcon, LayoutGrid, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface AppointmentRow {
  id: string;
  patient_id: string | null;
  subject: string;
  description: string | null;
  start_at: string;
  end_at: string;
  status: "scheduled" | "cancelled" | "completed";
  attendee_emails: string[];
  provider: "google" | "microsoft" | null;
  external_event_id: string | null;
  external_event_link: string | null;
  meeting_link: string | null;
  patients: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
}

type Filter = "upcoming" | "past" | "cancelled" | "all";
type ViewMode = "list" | "calendar";

interface PatientOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export default function Appointments({ initialPatientId }: { initialPatientId?: string } = {}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [view, setView] = useState<ViewMode>(initialPatientId ? "list" : "calendar");
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<AppointmentRow | null>(null);
  // Month being viewed in calendar mode. Initialised to the first day of
  // the current month in the user's local timezone.
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  // In calendar mode we always want a wider window than the "upcoming" tab
  // gives us, so the grid can show past + future months. Use status=all when
  // the view is calendar so navigation backwards shows past appointments.
  const effectiveFilter: Filter = view === "calendar" ? "all" : filter;

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: QK.appointments({ status: effectiveFilter, patient_id: initialPatientId }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("status", effectiveFilter);
      if (initialPatientId) params.set("patient_id", initialPatientId);
      const res = await fetch(`/api/appointments?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load");
      return (data.appointments ?? []) as AppointmentRow[];
    },
  });

  // Pull events directly from the connected calendar so the grid shows
  // appointments scheduled outside the CRM too. Best-effort — if no provider
  // is connected or the request fails, we just render the CRM rows.
  const monthStart = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor]);
  const monthEnd = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1), [cursor]);
  const { data: providerEventsData } = useQuery<{
    events: { id: string; subject: string; start: string; end: string; body?: string; attendees?: string[] }[];
    error?: string;
    code?: string;
    status: number;
  }>({
    queryKey: ["provider-calendar-events", cursor.toISOString()],
    enabled: view === "calendar",
    staleTime: 60_000,
    // Don't retry — a 500 from the provider just means the calendar fetch
    // failed; the CRM rows still render. Retrying spams the API for no win.
    retry: false,
    queryFn: async () => {
      const start = new Date(monthStart.getTime() - 7 * 86_400_000).toISOString();
      const end = new Date(monthEnd.getTime() + 7 * 86_400_000).toISOString();
      const res = await fetch(`/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
      const data = await res.json().catch(() => ({}));
      return { events: data.events ?? [], error: data.error, code: data.code, status: res.status };
    },
  });
  const providerEvents = providerEventsData?.events ?? [];
  const providerError = providerEventsData?.status && providerEventsData.status >= 400
    ? { message: providerEventsData.error ?? "Calendar fetch failed", code: providerEventsData.code }
    : null;

  // Merge CRM rows + provider rows. CRM rows take precedence when the same
  // external_event_id appears — they carry the contact link and meeting URL.
  const calendarEvents = useMemo(() => {
    type Unified = {
      id: string;
      subject: string;
      start: string;
      end: string;
      source: "crm" | "provider";
      meeting_link: string | null;
      external_event_link: string | null;
      appt?: AppointmentRow;
    };
    const out: Unified[] = appointments.map((a) => ({
      id: a.id,
      subject: a.subject,
      start: a.start_at,
      end: a.end_at,
      source: "crm",
      meeting_link: a.meeting_link,
      external_event_link: a.external_event_link,
      appt: a,
    }));
    const crmExternalIds = new Set(
      appointments.map((a) => a.external_event_id).filter(Boolean) as string[],
    );
    for (const e of providerEvents) {
      if (crmExternalIds.has(e.id)) continue;
      out.push({
        id: `prov_${e.id}`,
        subject: e.subject,
        start: e.start,
        end: e.end,
        source: "provider",
        meeting_link: null,
        external_event_link: null,
      });
    }
    return out;
  }, [appointments, providerEvents]);

  const syncMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/calendar/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        // Preserve the structured error so onError can show a useful hint.
        const err = new Error(data?.error ?? "Sync failed") as Error & {
          code?: string;
          hint?: string;
        };
        err.code = data?.code;
        err.hint = data?.hint;
        throw err;
      }
      return data as {
        synced: number;
        total_provider_events: number;
        matched_to_contacts?: number;
        provider?: string;
        message?: string;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["provider-calendar-events"] });
      if (data.synced === 0) {
        toast({
          title: "Up to date",
          description: data.message ?? `No new events on your ${data.provider ?? "calendar"}.`,
        });
      } else {
        toast({
          title: `Synced ${data.synced} event${data.synced === 1 ? "" : "s"}`,
          description: `From your ${data.provider ?? "calendar"}${
            data.matched_to_contacts ? ` · ${data.matched_to_contacts} linked to contacts` : ""
          }`,
        });
      }
    },
    onError: (e: Error & { code?: string; hint?: string }) => {
      // missing_scope / auth_failed get a friendlier title + the hint as
      // the body so the user knows to reconnect rather than just seeing
      // "Sync failed: 401 Unauthorized".
      const needsReconnect = e.code === "missing_scope" || e.code === "auth_failed" || e.code === "scope_denied";
      toast({
        title: needsReconnect ? "Calendar not connected" : "Sync failed",
        description: e.hint ?? e.message,
        variant: "destructive",
      });
    },
  });

  const cancelMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Cancel failed");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setCancelTarget(null);
      if (data?.calendar_warning) {
        toast({
          title: "Cancelled locally",
          description: `Couldn't remove from external calendar: ${data.calendar_warning}. Please remove it manually.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Appointment cancelled" });
      }
    },
    onError: (e: Error) => toast({ title: "Cancel failed", description: e.message, variant: "destructive" }),
  });

  const sectioned = useMemo(() => {
    const now = Date.now();
    const groups: { label: string; items: AppointmentRow[] }[] = [];
    const today: AppointmentRow[] = [];
    const thisWeek: AppointmentRow[] = [];
    const later: AppointmentRow[] = [];
    const past: AppointmentRow[] = [];
    const cancelled: AppointmentRow[] = [];
    for (const a of appointments) {
      const start = new Date(a.start_at).getTime();
      if (a.status === "cancelled") { cancelled.push(a); continue; }
      if (start < now) { past.push(a); continue; }
      const dayMs = 86_400_000;
      if (start < now + dayMs) today.push(a);
      else if (start < now + 7 * dayMs) thisWeek.push(a);
      else later.push(a);
    }
    if (today.length) groups.push({ label: "Next 24 hours", items: today });
    if (thisWeek.length) groups.push({ label: "This week", items: thisWeek });
    if (later.length) groups.push({ label: "Later", items: later });
    if (past.length) groups.push({ label: "Past", items: past });
    if (cancelled.length) groups.push({ label: "Cancelled", items: cancelled });
    return groups;
  }, [appointments]);

  return (
    <div className="space-y-5">
      {!initialPatientId && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Appointments</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {appointments.length} {filter === "all" ? "total" : filter} · synced with your connected calendar
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending}
              className="gap-1.5"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", syncMut.isPending && "animate-spin")} />
              {syncMut.isPending ? "Syncing…" : "Sync calendar"}
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5 gradient-brand text-primary-foreground">
              <Plus className="h-4 w-4" />
              New Appointment
            </Button>
          </div>
        </div>
      )}

      {!initialPatientId && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {view === "list" ? (
            <div className="flex items-center gap-1 bg-card border rounded-lg p-0.5 w-fit shadow-card">
              {(["upcoming", "past", "cancelled", "all"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors",
                    filter === f
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <p className="text-sm font-semibold min-w-[140px] text-center">
                {cursor.toLocaleString("default", { month: "long", year: "numeric" })}
              </p>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  const d = new Date();
                  setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
                }}
              >
                Today
              </Button>
            </div>
          )}

          <div className="flex items-center gap-1 bg-card border rounded-lg p-0.5 shadow-card">
            <button
              onClick={() => setView("calendar")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors",
                view === "calendar"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Calendar
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors",
                view === "list"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ListIcon className="h-3.5 w-3.5" />
              List
            </button>
          </div>
        </div>
      )}

      {initialPatientId && (
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Appointments</p>
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Schedule
          </Button>
        </div>
      )}

      {view === "calendar" && !initialPatientId && providerError && (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 px-4 py-2.5 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              Couldn't load events from your connected calendar
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-300/80 mt-0.5">
              {providerError.code === "missing_scope" || providerError.code === "scope_denied"
                ? "The connected account doesn't have calendar permission. Disconnect in Settings and reconnect to grant it."
                : providerError.code === "auth_failed"
                ? "The connection has expired. Disconnect and reconnect in Settings."
                : providerError.message}
            </p>
          </div>
        </div>
      )}

      {view === "calendar" && !initialPatientId && (
        <CalendarGrid
          cursor={cursor}
          events={calendarEvents}
          onCancelAppt={(a) => setCancelTarget(a)}
        />
      )}

      {(view === "list" || initialPatientId) && (isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading appointments…
        </div>
      ) : sectioned.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Calendar className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm font-medium">No appointments {filter !== "all" ? filter : ""} yet</p>
            <p className="text-xs mt-1">Create one to push it to your connected calendar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {sectioned.map((group) => (
            <div key={group.label} className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                {group.label}
              </p>
              <div className="space-y-2">
                {group.items.map((a) => (
                  <AppointmentCard
                    key={a.id}
                    appt={a}
                    onCancel={() => setCancelTarget(a)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      <CreateAppointmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialPatientId={initialPatientId}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["appointments"] })}
      />

      <AlertDialog open={!!cancelTarget} onOpenChange={(v) => !v && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget && (
                <>
                  This will cancel <span className="font-medium">{cancelTarget.subject}</span> on{" "}
                  {format(new Date(cancelTarget.start_at), "MMM d, h:mm a")} and remove it from your
                  {cancelTarget.provider ? ` ${cancelTarget.provider} ` : " "}calendar. Attendees will be notified.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMut.isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelTarget && cancelMut.mutate(cancelTarget.id)}
              disabled={cancelMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel appointment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AppointmentCard({ appt, onCancel }: { appt: AppointmentRow; onCancel: () => void }) {
  const start = new Date(appt.start_at);
  const end = new Date(appt.end_at);
  const isPast = end.getTime() < Date.now();
  const contactName = appt.patients
    ? `${appt.patients.first_name ?? ""} ${appt.patients.last_name ?? ""}`.trim()
    : null;

  return (
    <Card className={cn("shadow-card", appt.status === "cancelled" && "opacity-60")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-sm font-semibold truncate">{appt.subject}</h3>
              {appt.status === "cancelled" && (
                <Badge variant="destructive" className="text-[9px]">Cancelled</Badge>
              )}
              {appt.status === "completed" && (
                <Badge variant="outline" className="text-[9px] text-emerald-700 border-emerald-300/50 bg-emerald-50">
                  <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                  Completed
                </Badge>
              )}
              {appt.provider && (
                <Badge variant="outline" className="text-[9px] font-mono uppercase">
                  {appt.provider}
                </Badge>
              )}
              {!appt.provider && appt.status === "scheduled" && (
                <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-300/50 bg-amber-50 gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Local only
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap mb-2">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(start, "EEE, MMM d · h:mm a")} – {format(end, "h:mm a")}
                {!isPast && appt.status === "scheduled" && (
                  <span className="text-foreground/70 ml-1">
                    ({formatDistanceToNow(start, { addSuffix: true })})
                  </span>
                )}
              </span>
              {contactName && (
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {contactName}
                </span>
              )}
              {appt.attendee_emails.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {appt.attendee_emails.length} attendee{appt.attendee_emails.length === 1 ? "" : "s"}
                </span>
              )}
            </div>

            {appt.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{appt.description}</p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {appt.meeting_link && appt.status === "scheduled" && !isPast && (
              <Button
                asChild
                size="sm"
                className="h-7 px-2.5 gap-1 text-xs gradient-brand text-primary-foreground"
              >
                <a href={appt.meeting_link} target="_blank" rel="noopener noreferrer">
                  <Video className="h-3 w-3" />
                  Join meeting
                </a>
              </Button>
            )}
            {appt.external_event_link && (
              <Button asChild variant="outline" size="sm" className="h-7 px-2 gap-1 text-xs">
                <a href={appt.external_event_link} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" />
                  Open
                </a>
              </Button>
            )}
            {appt.status === "scheduled" && !isPast && (
              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs text-destructive hover:text-destructive" onClick={onCancel}>
                <X className="h-3 w-3" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateAppointmentDialog({
  open,
  onOpenChange,
  initialPatientId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialPatientId?: string;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [patientId, setPatientId] = useState<string>(initialPatientId ?? "");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  // Default start: round up to the next 30-min slot, today.
  const defaultStart = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
    return formatLocal(d);
  }, [open]);
  const defaultEnd = useMemo(() => {
    const d = new Date(defaultStart);
    d.setMinutes(d.getMinutes() + 30);
    return formatLocal(d);
  }, [defaultStart]);
  const [startAt, setStartAt] = useState(defaultStart);
  const [endAt, setEndAt] = useState(defaultEnd);
  const [extraAttendees, setExtraAttendees] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: patients = [] } = useQuery({
    queryKey: ["patients-for-appointment-picker"],
    enabled: open && !initialPatientId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, first_name, last_name, email")
        .order("first_name");
      return (data ?? []) as PatientOption[];
    },
  });

  const reset = () => {
    setPatientId(initialPatientId ?? "");
    setSubject("");
    setDescription("");
    setStartAt(defaultStart);
    setEndAt(defaultEnd);
    setExtraAttendees("");
  };

  const submit = async () => {
    if (!subject.trim()) {
      toast({ title: "Subject is required", variant: "destructive" });
      return;
    }
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      toast({ title: "End time must be after start time", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const extras = extraAttendees
        .split(/[,\s]+/)
        .map((e) => e.trim())
        .filter((e) => e.includes("@"));
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId || null,
          subject: subject.trim(),
          description: description.trim() || undefined,
          start_at: new Date(startAt).toISOString(),
          end_at: new Date(endAt).toISOString(),
          attendee_emails: extras.length ? extras : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Create failed");
      onCreated();
      onOpenChange(false);
      reset();
      if (data.pushed_to_calendar) {
        toast({ title: "Appointment scheduled", description: "Pushed to your connected calendar." });
      } else if (data.push_error) {
        toast({
          title: "Saved locally",
          description: `Calendar push failed: ${data.push_error}. The appointment is in CRM but not on your calendar.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Appointment scheduled",
          description: "No calendar connected — saved locally only. Connect Google or Microsoft in Settings to sync.",
        });
      }
    } catch (e) {
      toast({
        title: "Failed to create",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Appointment</DialogTitle>
          <DialogDescription>
            Pushes to your connected Google or Microsoft calendar and saves to the CRM.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Discovery call"
              className="mt-1"
            />
          </div>

          {!initialPatientId && (
            <div>
              <Label className="text-xs">Contact (optional)</Label>
              <Select value={patientId || "_none"} onValueChange={(v) => setPatientId(v === "_none" ? "" : v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a contact" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— No contact —</SelectItem>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {[p.first_name, p.last_name].filter(Boolean).join(" ")}
                      {p.email ? ` · ${p.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start</Label>
              <Input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">End</Label>
              <Input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Additional attendees (comma-separated emails)</Label>
            <Input
              value={extraAttendees}
              onChange={(e) => setExtraAttendees(e.target.value)}
              placeholder="alice@example.com, bob@example.com"
              className="mt-1"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              The selected contact's email is added automatically.
            </p>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Agenda, meeting link, etc."
              className="mt-1 min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting} className="gradient-brand text-primary-foreground gap-1.5">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
            {submitting ? "Scheduling…" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// <input type="datetime-local"> requires `YYYY-MM-DDTHH:mm` in the *user's*
// local timezone (no offset, no seconds). new Date().toISOString() gives us
// UTC, so format the local wallclock manually.
function formatLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Month-grid calendar. Cells are clickable: clicking a day opens a popover
// listing every event for that day, with Join meeting / Open / Cancel
// actions. Pure-CSS grid — no external date-picker library.
type UnifiedEvent = {
  id: string;
  subject: string;
  start: string;
  end: string;
  source: "crm" | "provider";
  meeting_link: string | null;
  external_event_link: string | null;
  appt?: AppointmentRow;
};

function CalendarGrid({
  cursor,
  events,
  onCancelAppt,
}: {
  cursor: Date;
  events: UnifiedEvent[];
  onCancelAppt: (a: AppointmentRow) => void;
}) {
  const [openDay, setOpenDay] = useState<string | null>(null);

  // Build a 6×7 grid starting on Sunday before the 1st of the month.
  const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startWeekday = firstDay.getDay();
  const gridStart = new Date(firstDay);
  gridStart.setDate(gridStart.getDate() - startWeekday);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  // Bucket events per local-date key (yyyy-mm-dd).
  const buckets = useMemo(() => {
    const map = new Map<string, UnifiedEvent[]>();
    for (const e of events) {
      const d = new Date(e.start);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    // Sort within each day by start time.
    map.forEach((arr) => {
      arr.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    });
    return map;
  }, [events]);

  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  return (
    <Card className="overflow-hidden shadow-card">
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((d) => {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const inMonth = d.getMonth() === cursor.getMonth();
          const dayEvents = buckets.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className={cn(
                "border-b border-r min-h-[96px] p-1 text-left relative",
                !inMonth && "bg-muted/20 text-muted-foreground/60",
                isToday && "bg-primary/5",
              )}
            >
              <div className="flex items-center justify-between mb-1 px-1">
                <span className={cn(
                  "text-[11px] font-medium",
                  isToday && "inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px]",
                )}>
                  {d.getDate()}
                </span>
                {dayEvents.length > 3 && (
                  <button
                    className="text-[10px] text-primary hover:underline"
                    onClick={() => setOpenDay(key)}
                  >
                    +{dayEvents.length - 3} more
                  </button>
                )}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((e) => {
                  const start = new Date(e.start);
                  const isCancelled = e.appt?.status === "cancelled";
                  return (
                    <button
                      key={e.id}
                      onClick={() => setOpenDay(key)}
                      className={cn(
                        "w-full truncate text-left px-1.5 py-0.5 rounded text-[10.5px] leading-tight transition-colors",
                        isCancelled && "line-through opacity-50",
                        e.source === "crm"
                          ? "bg-primary/10 text-primary hover:bg-primary/20"
                          : "bg-muted text-foreground hover:bg-muted/70 border border-border/70",
                      )}
                      title={`${e.subject} · ${format(start, "h:mm a")}`}
                    >
                      <span className="font-mono mr-1 opacity-70">{format(start, "HH:mm")}</span>
                      {e.subject}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Day-detail popover (rendered as a Dialog so it works on mobile). */}
      <Dialog open={!!openDay} onOpenChange={(v) => !v && setOpenDay(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {openDay
                ? format(new Date(openDay + "T00:00:00"), "EEEE, MMMM d, yyyy")
                : ""}
            </DialogTitle>
            <DialogDescription>
              {openDay && buckets.get(openDay)?.length} event{(buckets.get(openDay ?? "")?.length ?? 0) === 1 ? "" : "s"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {(openDay ? buckets.get(openDay) ?? [] : []).map((e) => {
              const start = new Date(e.start);
              const end = new Date(e.end);
              const appt = e.appt;
              const isPast = end.getTime() < Date.now();
              return (
                <div key={e.id} className={cn("rounded-lg border p-3", appt?.status === "cancelled" && "opacity-60")}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold leading-tight flex-1">
                      {e.subject}
                      {e.source === "provider" && (
                        <Badge variant="outline" className="text-[9px] ml-2">External</Badge>
                      )}
                      {appt?.status === "cancelled" && (
                        <Badge variant="destructive" className="text-[9px] ml-2">Cancelled</Badge>
                      )}
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    {format(start, "h:mm a")} – {format(end, "h:mm a")}
                    {appt?.patients && (
                      <> · with {[appt.patients.first_name, appt.patients.last_name].filter(Boolean).join(" ")}</>
                    )}
                  </p>
                  {appt?.description && (
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-3">{appt.description}</p>
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {e.meeting_link && appt?.status === "scheduled" && !isPast && (
                      <Button asChild size="sm" className="h-7 px-2 gap-1 text-xs gradient-brand text-primary-foreground">
                        <a href={e.meeting_link} target="_blank" rel="noopener noreferrer">
                          <Video className="h-3 w-3" />
                          Join meeting
                        </a>
                      </Button>
                    )}
                    {e.external_event_link && (
                      <Button asChild variant="outline" size="sm" className="h-7 px-2 gap-1 text-xs">
                        <a href={e.external_event_link} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3" />
                          Open
                        </a>
                      </Button>
                    )}
                    {appt && appt.status === "scheduled" && !isPast && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 gap-1 text-xs text-destructive hover:text-destructive"
                        onClick={() => { setOpenDay(null); onCancelAppt(appt); }}
                      >
                        <X className="h-3 w-3" />
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
