"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { toast } from "sonner";
import {
  Settings as SettingsIcon, Building2, Users, Plug, Mail,
  Save, Trash2, Plus, CheckCircle2, ExternalLink,
  Clock, Loader2, Tag, FlaskConical,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

function GoogleCalendarIcon({ className }: { className?: string }) {
  return (
   <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="24" height="24" ><path fill="#FFF" d="M195.368 60.632H60.632v134.736h134.736z"/><path fill="#EA4335" d="M195.368 256L256 195.368l-30.316-5.172l-30.316 5.172l-5.533 27.73z"/><path fill="#188038" d="M0 195.368v40.421C0 246.956 9.044 256 20.21 256h40.422l6.225-30.316l-6.225-30.316l-33.033-5.172z"/><path fill="#1967D2" d="M256 60.632V20.21C256 9.044 246.956 0 235.79 0h-40.422q-5.532 22.554-5.533 33.196q0 10.641 5.533 27.436q20.115 5.76 30.316 5.76T256 60.631"/><path fill="#FBBC04" d="M256 60.632h-60.632v134.736H256z"/><path fill="#34A853" d="M195.368 195.368H60.632V256h134.736z"/><path fill="#4285F4" d="M195.368 0H20.211C9.044 0 0 9.044 0 20.21v175.158h60.632V60.632h134.736z"/><path fill="#4285F4" d="M88.27 165.154c-5.036-3.402-8.523-8.37-10.426-14.94l11.689-4.816q1.59 6.063 5.558 9.398c2.627 2.223 5.827 3.318 9.566 3.318q5.734 0 9.852-3.487c2.746-2.324 4.127-5.288 4.127-8.875q0-5.508-4.345-8.994c-2.897-2.324-6.535-3.486-10.88-3.486h-6.754v-11.57h6.063q5.608 0 9.448-3.033c2.56-2.02 3.84-4.783 3.84-8.303c0-3.132-1.145-5.625-3.435-7.494c-2.29-1.87-5.188-2.813-8.708-2.813c-3.436 0-6.164.91-8.185 2.745a16.1 16.1 0 0 0-4.413 6.754l-11.57-4.817c1.532-4.345 4.345-8.185 8.471-11.503s9.398-4.985 15.798-4.985c4.733 0 8.994.91 12.767 2.745c3.772 1.836 6.736 4.379 8.875 7.613c2.14 3.25 3.2 6.888 3.2 10.93c0 4.126-.993 7.613-2.98 10.476s-4.43 5.052-7.327 6.585v.69a22.25 22.25 0 0 1 9.398 7.327c2.442 3.284 3.672 7.208 3.672 11.79c0 4.58-1.163 8.673-3.487 12.26c-2.324 3.588-5.54 6.417-9.617 8.472c-4.092 2.055-8.69 3.1-13.793 3.1c-5.912.016-11.369-1.685-16.405-5.087m71.797-58.005l-12.833 9.28l-6.417-9.734l23.023-16.607h8.825v78.333h-12.598z"/></svg>
  );
}

function GmailIcon({ className }: { className?: string }) {
  return (
   <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 193" width="24" height="24" ><path fill="#4285F4" d="M58.182 192.05V93.14L27.507 65.077L0 49.504v125.091c0 9.658 7.825 17.455 17.455 17.455z"/><path fill="#34A853" d="M197.818 192.05h40.727c9.659 0 17.455-7.826 17.455-17.455V49.505l-31.156 17.837l-27.026 25.798z"/><path fill="#EA4335" d="m58.182 93.14l-4.174-38.647l4.174-36.989L128 69.868l69.818-52.364l4.669 34.992l-4.669 40.644L128 145.504z"/><path fill="#FBBC04" d="M197.818 17.504V93.14L256 49.504V26.231c0-21.585-24.64-33.89-41.89-20.945z"/><path fill="#C5221F" d="m0 49.504l26.759 20.07L58.182 93.14V17.504L41.89 5.286C24.61-7.66 0 4.646 0 26.23z"/></svg>
  );
}
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "Europe/London",
  "Europe/Paris", "Asia/Tokyo", "Australia/Sydney",
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i, label: i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`,
}));

type PracticeSettings = {
  id: string;
  practice_name: string;
  timezone: string;
  business_hours_start: number;
  business_hours_end: number;
  business_days: string[];
  max_sends_per_day: number;
  escalation_staff_id: string | null;
  google_calendar_token: Record<string, string> | null;
  google_gmail_token: Record<string, string> | null;
  mail_provider: "google" | "microsoft" | null;
  provider_email: string | null;
  provider_connected: boolean | null;
  email_provider: string;
  email_provider_api_key: string | null;
  email_from_address: string | null;
  email_from_name: string | null;
  /** When true, only patients flagged is_test_contact=true receive sends. */
  test_mode_only?: boolean | null;
};

type StaffRow = {
  id: string;
  name: string;
  role: string;
  email: string;
  active: boolean;
  categories_handled: string[] | null;
};

// ─── Practice Tab ──────────────────────────────────────────────────────────────
function PracticeTab({ settings, onSave }: { settings: PracticeSettings; onSave: (updates: Partial<PracticeSettings>) => void }) {
  const [form, setForm] = useState({
    practice_name: settings.practice_name,
    timezone: settings.timezone,
    business_hours_start: settings.business_hours_start,
    business_hours_end: settings.business_hours_end,
    business_days: settings.business_days,
  });

  const toggleDay = (day: string) => {
    setForm((f) => ({
      ...f,
      business_days: f.business_days.includes(day)
        ? f.business_days.filter((d) => d !== day)
        : [...f.business_days, day],
    }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" /> Practice Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Practice Name</Label>
            <Input
              value={form.practice_name}
              onChange={(e) => setForm((f) => ({ ...f, practice_name: e.target.value }))}
              className="h-9 max-w-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Timezone</Label>
            <Select value={form.timezone} onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}>
              <SelectTrigger className="h-9 max-w-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Business Hours
          </CardTitle>
          <CardDescription className="text-xs">Used for campaign scheduling and inquiry routing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div className="space-y-1.5">
              <Label className="text-xs">Open</Label>
              <Select
                value={String(form.business_hours_start)}
                onValueChange={(v) => setForm((f) => ({ ...f, business_hours_start: Number(v) }))}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => <SelectItem key={h.value} value={String(h.value)}>{h.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Close</Label>
              <Select
                value={String(form.business_hours_end)}
                onValueChange={(v) => setForm((f) => ({ ...f, business_hours_end: Number(v) }))}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => <SelectItem key={h.value} value={String(h.value)}>{h.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Business Days</Label>
            <div className="flex gap-2">
              {DAYS.map((day) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`h-8 w-10 rounded text-xs font-medium transition-colors ${
                    form.business_days.includes(day)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => onSave(form)} className="gap-1.5">
          <Save className="h-3.5 w-3.5" /> Save Changes
        </Button>
      </div>
    </div>
  );
}

// ─── Staff Tab ─────────────────────────────────────────────────────────────────
function StaffTab({
  settings,
  onUpdateSettings,
}: {
  settings: PracticeSettings;
  onUpdateSettings: (updates: Partial<PracticeSettings>) => void;
}) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StaffRow | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "practitioner" });

  const { data: staff = [] } = useQuery({
    queryKey: QK.staff,
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("*").order("name");
      if (error) throw error;
      return data as StaffRow[];
    },
  });

  const addStaff = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("staff").insert({
        name: form.name.trim(), email: form.email.trim().toLowerCase(), role: form.role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.staff });
      setAddOpen(false);
      setForm({ name: "", email: "", role: "practitioner" });
      toast.success("Staff member added");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add staff"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("staff").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.staff }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update staff"),
  });

  const deleteStaff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.staff });
      setDeleteTarget(null);
      toast.success("Staff member removed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete staff"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Team Members</p>
          <p className="text-xs text-muted-foreground">{staff.filter((s) => s.active).length} active</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Staff
        </Button>
      </div>

      {/* Escalation target */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Default Escalation Target
          </CardTitle>
          <CardDescription className="text-xs">Inquiries escalated without a specific assignee go to this person</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={settings.escalation_staff_id ?? "none"}
            onValueChange={(v) => onUpdateSettings({ escalation_staff_id: v === "none" ? null : v })}
          >
            <SelectTrigger className="h-9 max-w-xs"><SelectValue placeholder="Select staff member" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No default</SelectItem>
              {staff.filter((s) => s.active).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name} — {s.role}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Staff list */}
      <Card>
        <CardContent className="p-0">
          {staff.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Users className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No staff members yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {staff.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {s.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.email} · {s.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.active ? "default" : "secondary"} className="text-[10px]">
                      {s.active ? "Active" : "Inactive"}
                    </Badge>
                    <Button
                      variant="ghost" size="sm" className="h-7 text-xs"
                      onClick={() => toggleActive.mutate({ id: s.id, active: !s.active })}
                    >
                      {s.active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(s)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add staff dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => !o && setAddOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
            <DialogDescription>Add a team member who can be assigned to inquiries.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="jane@practice.com" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="practitioner">Practitioner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="care_coordinator">Care Coordinator</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="support">Support</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addStaff.mutate()}
              disabled={!form.name.trim() || !form.email.trim() || addStaff.isPending}
            >
              {addStaff.isPending ? "Adding…" : "Add Staff"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Staff Member</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {deleteTarget?.name} from the system.
              Any inquiries assigned to them will become unassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteStaff.mutate(deleteTarget.id)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Integrations Tab ──────────────────────────────────────────────────────────
function OutlookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 239" width="24" height="24">
      <path fill="#0072C6" d="M120.8 132.4 0 53.4v138.2l120.8-23.7z"/>
      <path fill="#0072C6" d="M256 23.2v192.6L138.7 192V47.4z"/>
      <path fill="#FFF" d="M195 100.3a27 27 0 0 0-27 27c0 14.9 12.1 27 27 27s27-12.1 27-27a27 27 0 0 0-27-27"/>
      <path fill="#0072C6" d="M195 113.3a14 14 0 0 1 14 14c0 7.7-6.3 14-14 14s-14-6.3-14-14a14 14 0 0 1 14-14"/>
      <path fill="#0072C6" d="M120.8 132.4 0 53.4v-23l132.7 32.4z"/>
    </svg>
  );
}

function ProviderLockBanner({ provider }: { provider: "google" | "microsoft" }) {
  const other = provider === "google" ? "Microsoft Outlook" : "Google Workspace";
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
      <Plug className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>
        Only one mail provider can be connected at a time. {other} is locked because{" "}
        {provider === "google" ? "Google" : "Microsoft"} is currently connected. Disconnect it to switch providers.
      </span>
    </div>
  );
}

function IntegrationsTab({
  settings,
  onSave,
  oauthLoading = false,
}: {
  settings: PracticeSettings;
  onSave: (updates: Partial<PracticeSettings>) => void;
  oauthLoading?: boolean;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"google" | "microsoft" | "disconnect" | null>(null);

  const activeProvider = settings.provider_connected ? settings.mail_provider : null;
  const googleConnected = activeProvider === "google";
  const microsoftConnected = activeProvider === "microsoft";
  const googleLocked = !!activeProvider && !googleConnected;
  const microsoftLocked = !!activeProvider && !microsoftConnected;

  const buildState = () => {
    const s = crypto.getRandomValues(new Uint8Array(16));
    let bin = "";
    for (let i = 0; i < s.length; i++) bin += String.fromCharCode(s[i]);
    const state = btoa(bin).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    sessionStorage.setItem("oauth_state", state);
    return state;
  };

  const handleGoogleConnect = () => {
    if (googleLocked) return;
    setBusy("google");
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const redirectUri = `${window.location.origin}/settings`;
    const scope = encodeURIComponent(
      "openid email profile " +
      "https://www.googleapis.com/auth/calendar " +
      "https://www.googleapis.com/auth/gmail.send " +
      "https://www.googleapis.com/auth/gmail.readonly"
    );
    const state = buildState();
    sessionStorage.setItem("oauth_provider", "google");
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;
  };

  const handleMicrosoftConnect = () => {
    if (microsoftLocked) return;
    setBusy("microsoft");
    const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID;
    const tenant = process.env.NEXT_PUBLIC_MICROSOFT_TENANT_ID || "common";
    const redirectUri = process.env.NEXT_PUBLIC_MICROSOFT_REDIRECT_URI || `${window.location.origin}/settings`;
    const scope = encodeURIComponent(
      "openid profile email offline_access Mail.Read Mail.Send Calendars.ReadWrite",
    );
    const state = buildState();
    sessionStorage.setItem("oauth_provider", "microsoft");
    window.location.href =
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize` +
      `?client_id=${clientId}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_mode=query` +
      `&scope=${scope}` +
      `&state=${state}` +
      `&prompt=select_account`;
  };

  const handleDisconnect = async () => {
    setBusy("disconnect");
    try {
      const r = await fetch("/api/disconnect-provider", { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Failed to disconnect");
      toast.success("Provider disconnected — previous inbox cleared");
      queryClient.invalidateQueries({ queryKey: QK.settings });
      queryClient.invalidateQueries({ queryKey: QK.inquiries });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to disconnect");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {oauthLoading && (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-primary/5 border-primary/20 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          Completing authorization — please wait…
        </div>
      )}

      {/* Connected provider status card */}
      {activeProvider && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Mail Provider Connected
            </CardTitle>
            <CardDescription className="text-xs">
              {activeProvider === "google" ? "Google Workspace" : "Microsoft Outlook"} is your active mail and calendar provider.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center">
                {activeProvider === "google" ? <GmailIcon className="h-5 w-5" /> : <OutlookIcon className="h-5 w-5" />}
              </div>
              <div>
                <p className="text-sm font-medium">{settings.provider_email ?? "Connected account"}</p>
                <p className="text-xs text-muted-foreground capitalize">{activeProvider} · Mail + Calendar</p>
              </div>
            </div>
            <Button variant="outline" size="sm" disabled={busy === "disconnect"} onClick={handleDisconnect} className="gap-1.5">
              {busy === "disconnect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Disconnect
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Google Workspace */}
      <Card className={googleLocked ? "opacity-60" : undefined}>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <GmailIcon className="h-4 w-4" /> Google Workspace
          </CardTitle>
          <CardDescription className="text-xs">
            Gmail + Google Calendar for sending email and scheduling.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {googleLocked && <ProviderLockBanner provider="microsoft" />}
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
                <GmailIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">Gmail + Calendar</p>
                <p className="text-xs text-muted-foreground">
                  {googleConnected ? `Connected as ${settings.provider_email ?? "Google account"}` : "Send mail and read calendar availability"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {googleConnected ? (
                <Badge className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-[10px]">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
                </Badge>
              ) : (
                <Button
                  size="sm"
                  onClick={handleGoogleConnect}
                  disabled={googleLocked || busy === "google"}
                  className="gap-1.5"
                >
                  {busy === "google" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  Connect Google
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Microsoft Outlook */}
      <Card className={microsoftLocked ? "opacity-60" : undefined}>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <OutlookIcon className="h-4 w-4" /> Microsoft Outlook
          </CardTitle>
          <CardDescription className="text-xs">
            Outlook mail + Microsoft 365 Calendar via Microsoft Graph. Works with personal and work accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {microsoftLocked && <ProviderLockBanner provider="google" />}
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                <OutlookIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">Outlook + Calendar</p>
                <p className="text-xs text-muted-foreground">
                  {microsoftConnected ? `Connected as ${settings.provider_email ?? "Microsoft account"}` : "Send mail and manage events via Microsoft Graph"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {microsoftConnected ? (
                <Badge className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-[10px]">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
                </Badge>
              ) : (
                <Button
                  size="sm"
                  onClick={handleMicrosoftConnect}
                  disabled={microsoftLocked || busy === "microsoft"}
                  className="gap-1.5"
                >
                  {busy === "microsoft" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  Connect Outlook
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email Delivery Provider — temporarily disabled; using Resend directly */}
      {/* <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> Email Delivery Provider
          </CardTitle>
          <CardDescription className="text-xs">
            Configure how campaign emails are delivered. Resend and SendGrid are recommended.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Provider</Label>
            <Select
              value={emailForm.email_provider}
              onValueChange={(v) => setEmailForm((f) => ({ ...f, email_provider: v }))}
            >
              <SelectTrigger className="h-9 max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="resend">Resend</SelectItem>
                <SelectItem value="sendgrid">SendGrid</SelectItem>
                <SelectItem value="smtp">Custom SMTP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 max-w-sm">
            <Label className="text-xs">API Key</Label>
            <Input
              type="password"
              value={emailForm.email_provider_api_key}
              onChange={(e) => setEmailForm((f) => ({ ...f, email_provider_api_key: e.target.value }))}
              placeholder={emailForm.email_provider === "resend" ? "re_..." : "SG.xxx..."}
              className="h-9 font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <div className="space-y-1.5">
              <Label className="text-xs">From Name</Label>
              <Input
                value={emailForm.email_from_name}
                onChange={(e) => setEmailForm((f) => ({ ...f, email_from_name: e.target.value }))}
                placeholder="FitLogic Practice"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">From Email</Label>
              <Input
                type="email"
                value={emailForm.email_from_address}
                onChange={(e) => setEmailForm((f) => ({ ...f, email_from_address: e.target.value }))}
                placeholder="hello@yourpractice.com"
                className="h-9"
              />
            </div>
          </div>

          {!emailForm.email_provider_api_key && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Campaign emails will not be delivered until an API key is configured.
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => onSave({
                email_provider: emailForm.email_provider,
                email_provider_api_key: emailForm.email_provider_api_key || null,
                email_from_address: emailForm.email_from_address || null,
                email_from_name: emailForm.email_from_name || null,
              })}
              className="gap-1.5"
            >
              <Save className="h-3.5 w-3.5" /> Save Email Settings
            </Button>
          </div>
        </CardContent>
      </Card> */}
    </div>
  );
}

// ─── Lead Sources Tab (A1.3) ─────────────────────────────────────────────────
// Megan can add custom values; default rows seeded by migration
// 20260429000001_phase1_schema.sql cannot be deleted (kept around so analytics
// doesn't lose comparability) but can be hidden by setting sort_order to a
// large value. For now we expose add + delete-custom only.
interface LeadSourceRow {
  id: string;
  label: string;
  is_default: boolean;
  sort_order: number;
}

function LeadSourcesTab() {
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");

  // Cast supabase to bypass the stale auto-generated types — the lead_sources
  // table exists in DB but isn't in src/integrations/supabase/types.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lsTable = (supabase as any).from("lead_sources");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["lead_sources"],
    queryFn: async (): Promise<LeadSourceRow[]> => {
      const { data, error } = await lsTable
        .select("id, label, is_default, sort_order")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LeadSourceRow[];
    },
  });

  const addMut = useMutation({
    mutationFn: async (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) throw new Error("Label cannot be empty");
      const { error } = await lsTable.insert({ label: trimmed, is_default: false, sort_order: 500 });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewLabel("");
      queryClient.invalidateQueries({ queryKey: ["lead_sources"] });
      toast.success("Lead source added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await lsTable.delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead_sources"] });
      toast.success("Lead source deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> Lead Sources
          </CardTitle>
          <CardDescription>
            Where leads are coming from. Add custom values here; new options are
            available immediately on the Add/Edit Contact form.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Pop-up table at expo"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addMut.mutate(newLabel); }}
              className="h-9"
            />
            <Button
              onClick={() => addMut.mutate(newLabel)}
              disabled={addMut.isPending || !newLabel.trim()}
              size="sm"
              className="h-9"
            >
              Add
            </Button>
          </div>
          <Separator />
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="space-y-1.5">
              {rows.map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{row.label}</span>
                    {row.is_default && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5">Default</Badge>
                    )}
                  </div>
                  {!row.is_default && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => delMut.mutate(row.id)}
                      disabled={delMut.isPending}
                      className="h-7 text-xs text-destructive hover:text-destructive"
                    >
                      Delete
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Practice Links Tab (A2.5) ───────────────────────────────────────────────
// Saved CTA destinations (booking page, intake form, retreat page, etc.) that
// the AI Campaign Creator can drop into the call-to-action button without
// Megan editing every generated email.
interface PracticeLinkRow {
  id: string;
  label: string;
  url: string;
  is_default: boolean;
  sort_order: number;
}

function PracticeLinksTab() {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linksTable = (supabase as any).from("practice_links");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["practice_links"],
    queryFn: async (): Promise<PracticeLinkRow[]> => {
      const { data, error } = await linksTable
        .select("id, label, url, is_default, sort_order")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PracticeLinkRow[];
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const l = label.trim();
      const u = url.trim();
      if (!l) throw new Error("Label is required");
      if (!u.startsWith("http")) throw new Error("URL must start with http(s)");
      const { error } = await linksTable.insert({ label: l, url: u, sort_order: 200 });
      if (error) throw error;
    },
    onSuccess: () => {
      setLabel("");
      setUrl("");
      queryClient.invalidateQueries({ queryKey: ["practice_links"] });
      toast.success("Link saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await linksTable.delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["practice_links"] });
      toast.success("Link deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-primary" /> Saved links
          </CardTitle>
          <CardDescription>
            Reusable destination URLs for the AI Campaign Creator&apos;s call-to-action button.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input
              placeholder="Label (e.g. Free consultation)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="h-9 sm:col-span-1"
            />
            <Input
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-9 sm:col-span-2"
            />
          </div>
          <Button
            onClick={() => addMut.mutate()}
            disabled={addMut.isPending || !label.trim() || !url.trim()}
            size="sm"
            className="h-9"
          >
            Save link
          </Button>
          <Separator />
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved links yet — add one above.</p>
          ) : (
            <div className="space-y-1.5">
              {rows.map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-md border bg-background px-3 py-2 gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{row.label}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{row.url}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => delMut.mutate(row.id)}
                    disabled={delMut.isPending}
                    className="h-7 text-xs text-destructive hover:text-destructive shrink-0"
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Campaign Defaults Tab ─────────────────────────────────────────────────────
function CampaignDefaultsTab({ settings, onSave }: { settings: PracticeSettings; onSave: (updates: Partial<PracticeSettings>) => void }) {
  const [form, setForm] = useState({
    max_sends_per_day: settings.max_sends_per_day,
  });

  // Test mode is the most consequential safety toggle in the app — flipping
  // it accidentally either floods real prospects or silently drops every
  // send, so it gets its own optimistic mutation with explicit toast copy
  // instead of being lumped into the form save.
  const testModeOn = settings.test_mode_only ?? true;

  return (
    <div className="space-y-6">
      {/* Test Mode toggle — gates EVERY outbound send */}
      <Card className={testModeOn ? "border-amber-300/60" : undefined}>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FlaskConical className={`h-4 w-4 ${testModeOn ? "text-amber-600" : "text-muted-foreground"}`} />
            Test Mode
          </CardTitle>
          <CardDescription className="text-xs">
            When on, only contacts flagged <code className="px-1 rounded bg-muted font-mono text-[11px]">is_test_contact</code> actually receive sends. Every other recipient in a campaign or sequence is silently skipped server-side. Turn this off to send real emails to real contacts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-4 rounded-lg border bg-card px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {testModeOn ? "Test mode is ON" : "Test mode is OFF — real sends"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {testModeOn
                  ? "Send Now and the daily 8am Texas cron will only deliver to contacts flagged is_test_contact = true."
                  : "Every recipient in your campaigns will receive emails. Make sure your contact list is what you intend before sending."}
              </p>
            </div>
            <Switch
              checked={testModeOn}
              onCheckedChange={(checked) => onSave({ test_mode_only: checked })}
              aria-label="Toggle test mode"
            />
          </div>
          {testModeOn && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Tip: open the Contacts page and toggle <code className="font-mono">Test Contact</code> on at least one row so Send Now has someone to deliver to.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> Send Limits
          </CardTitle>
          <CardDescription className="text-xs">
            Default daily email send limit applied to all campaigns. Individual campaigns can override this.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5 max-w-xs">
            <Label className="text-xs">Max Emails Per Day</Label>
            <Input
              type="number"
              min="1"
              max="10000"
              value={form.max_sends_per_day}
              onChange={(e) => setForm((f) => ({ ...f, max_sends_per_day: Number(e.target.value) }))}
              className="h-9"
            />
            <p className="text-xs text-muted-foreground">
              Recommended: 200–500 for good deliverability. Check your provider's limits.
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => onSave({ max_sends_per_day: form.max_sends_per_day })} className="gap-1.5">
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Settings Page ────────────────────────────────────────────────────────
const Settings = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("practice");
  const [oauthLoading, setOauthLoading] = useState(false);

  // Handle OAuth callback for both Google and Microsoft — dispatch to the
  // matching backend route based on the provider that initiated the flow.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");
    const tab = params.get("tab");

    if (oauthError) {
      toast.error(`OAuth error: ${params.get("error_description") || oauthError}`);
      window.history.replaceState({}, "", window.location.pathname + "?tab=integrations");
      setActiveTab("integrations");
      return;
    }

    if (code) {
      const provider = (sessionStorage.getItem("oauth_provider") as "google" | "microsoft" | null) ?? "google";
      const expectedState = sessionStorage.getItem("oauth_state");
      sessionStorage.removeItem("oauth_provider");
      sessionStorage.removeItem("oauth_state");
      window.history.replaceState({}, "", window.location.pathname + "?tab=integrations");
      setActiveTab("integrations");
      setOauthLoading(true);

      const redirectUri =
        provider === "microsoft"
          ? (process.env.NEXT_PUBLIC_MICROSOFT_REDIRECT_URI || `${window.location.origin}/settings`)
          : `${window.location.origin}/settings`;
      const endpoint = provider === "microsoft" ? "/api/microsoft-oauth-callback" : "/api/google-oauth-callback";

      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, redirect_uri: redirectUri, state, expectedState }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (!data?.success) {
            const detailMsg = typeof data?.detail === "string" ? data.detail : data?.detail ? JSON.stringify(data.detail) : "";
            toast.error(`${provider === "microsoft" ? "Outlook" : "Google"} connection failed: ${data?.error || "unknown"}${detailMsg ? ` — ${detailMsg}` : ""}`);
          } else {
            toast.success(`${provider === "microsoft" ? "Outlook" : "Google"} connected${data.email ? ` as ${data.email}` : ""}`);
            queryClient.invalidateQueries({ queryKey: QK.settings });
            queryClient.invalidateQueries({ queryKey: QK.inquiries });
          }
        })
        .finally(() => setOauthLoading(false));
    } else if (tab) {
      setActiveTab(tab);
    }
  }, []);

  const { data: rawSettings, isLoading } = useQuery({
    queryKey: QK.settings,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practice_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as PracticeSettings | null;
    },
  });

  const settings: PracticeSettings = rawSettings ?? {
    id: "",
    practice_name: "FitLogic Functional Medicine",
    timezone: "America/New_York",
    business_hours_start: 8,
    business_hours_end: 18,
    business_days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    max_sends_per_day: 50,
    escalation_staff_id: null,
    google_calendar_token: null,
    google_gmail_token: null,
    mail_provider: null,
    provider_email: null,
    provider_connected: false,
    email_provider: "resend",
    email_provider_api_key: null,
    email_from_address: null,
    email_from_name: null,
  };

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<PracticeSettings>) => {
      // Cast through unknown — the auto-generated supabase types predate
      // the test_mode_only column, so the typed update/insert rejects it.
      const table = supabase.from("practice_settings") as unknown as {
        update: (vals: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
        insert: (vals: Record<string, unknown>) => Promise<{ error: unknown }>;
      };
      if (settings.id) {
        const { error } = await table.update(updates).eq("id", settings.id);
        if (error) throw error as Error;
      } else {
        const { error } = await table.insert({ ...updates });
        if (error) throw error as Error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.settings });
      toast.success("Settings saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save settings"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] text-muted-foreground">
        <div className="space-y-2 text-center">
          <SettingsIcon className="h-8 w-8 mx-auto opacity-30 animate-spin" />
          <p className="text-sm">Loading settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Practice configuration, staff management, and integrations
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="grid grid-cols-6 w-full min-w-[480px] max-w-3xl">
            <TabsTrigger value="practice">
              <Building2 className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" /> Practice
            </TabsTrigger>
            <TabsTrigger value="staff">
              <Users className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" /> Staff
            </TabsTrigger>
            <TabsTrigger value="integrations">
              <Plug className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" /> Integrations
            </TabsTrigger>
            <TabsTrigger value="campaigns">
              <Mail className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" /> Campaigns
            </TabsTrigger>
            <TabsTrigger value="lead_sources">
              <Tag className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" /> Sources
            </TabsTrigger>
            <TabsTrigger value="links">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" /> Links
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="practice" className="mt-6">
          <PracticeTab settings={settings} onSave={updateSettings.mutate} />
        </TabsContent>
        <TabsContent value="staff" className="mt-6">
          <StaffTab settings={settings} onUpdateSettings={updateSettings.mutate} />
        </TabsContent>
        <TabsContent value="integrations" className="mt-6">
          <IntegrationsTab settings={settings} onSave={updateSettings.mutate} oauthLoading={oauthLoading} />
        </TabsContent>
        <TabsContent value="campaigns" className="mt-6">
          <CampaignDefaultsTab settings={settings} onSave={updateSettings.mutate} />
        </TabsContent>
        <TabsContent value="lead_sources" className="mt-6">
          <LeadSourcesTab />
        </TabsContent>
        <TabsContent value="links" className="mt-6">
          <PracticeLinksTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
