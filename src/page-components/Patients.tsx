"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { toast } from "@/hooks/use-toast";
import {
  Users, Plus, Search, MoreHorizontal, Mail, Building2,
  Eye, Pencil, Trash2, ChevronLeft, ArrowUpDown, Tag, StickyNote,
  TrendingUp, Send, X, Filter, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { PatientForm, type PatientFormData } from "@/components/PatientForm";
import { PatientTimeline } from "@/components/PatientTimeline";
import { BulkImportDialog } from "@/components/BulkImportDialog";

type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  insurance_provider: string | null;
  insurance_id: string | null;
  company: string | null;
  deal_value: number | null;
  lead_source: string | null;
  pipeline_stage: string;
  status: string;
  tags: string[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  lead:     { label: "Lead",   color: "bg-blue-50 text-blue-700 border-blue-200",     dot: "bg-blue-500" },
  client:   { label: "Client", color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  active:   { label: "Active", color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  inactive: { label: "Cold",   color: "bg-amber-50 text-amber-700 border-amber-200",  dot: "bg-amber-500" },
  archived: { label: "Closed", color: "bg-muted text-muted-foreground border-border",  dot: "bg-muted-foreground" },
};

const LEAD_SOURCE_MAP: Record<string, { label: string; color: string }> = {
  referral: { label: "Referral", color: "bg-blue-50 text-blue-700" },
  "cold-outreach": { label: "Cold Outreach", color: "bg-purple-50 text-purple-700" },
  inbound: { label: "Inbound", color: "bg-green-50 text-green-700" },
  event: { label: "Event", color: "bg-orange-50 text-orange-700" },
  social: { label: "Social Media", color: "bg-pink-50 text-pink-700" },
  other: { label: "Other", color: "bg-muted text-muted-foreground" },
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function relativeDate(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatDate(d);
}

function initials(f: string, l: string) {
  return `${f[0] || ""}${l[0] || ""}`.toUpperCase();
}

function StatusPill({ status }: { status: string }) {
  const config = STATUS_MAP[status] || STATUS_MAP.active;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border ${config.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function LeadSourceBadge({ source }: { source: string | null }) {
  if (!source) return <span className="text-xs text-muted-foreground">—</span>;
  const config = LEAD_SOURCE_MAP[source] || LEAD_SOURCE_MAP.other;
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

const PIPELINE_STAGE_LABELS: Record<string, string> = {
  new_lead: "New Lead", contacted: "Contacted", qualified: "Qualified",
  proposal: "Proposal", negotiation: "Negotiation", won: "Won", lost: "Lost",
};

const SESSION_KEY = "contacts_filters";

function loadFilters() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function formatCurrency(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function Patients() {
  const queryClient = useQueryClient();
  const saved = loadFilters();
  const [search, setSearch] = useState<string>(saved?.search ?? "");
  const [statusFilter, setStatusFilter] = useState<string>(saved?.statusFilter ?? "all");
  const [stageFilter, setStageFilter] = useState<string>(saved?.stageFilter ?? "all");
  const [sourceFilter, setSourceFilter] = useState<string>(saved?.sourceFilter ?? "all");
  const [sortBy, setSortBy] = useState<"newest" | "name" | "company" | "deal_value">(saved?.sortBy ?? "newest");
  const [showFilters, setShowFilters] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [viewing, setViewing] = useState<Patient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [detailTab, setDetailTab] = useState("overview");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // Persist filters to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ search, statusFilter, stageFilter, sourceFilter, sortBy }));
  }, [search, statusFilter, stageFilter, sourceFilter, sortBy]);

  const hasActiveFilters = search || statusFilter !== "all" || stageFilter !== "all" || sourceFilter !== "all";

  const clearFilters = () => {
    setSearch(""); setStatusFilter("all"); setStageFilter("all"); setSourceFilter("all"); setSortBy("newest");
  };

  const PAGE_SIZE = 500;
  const [page, setPage] = useState(0);
  const [allLoaded, setAllLoaded] = useState(false);

  const { data: patients = [], isLoading } = useQuery({
    queryKey: [...QK.patients, page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      if ((data?.length ?? 0) < PAGE_SIZE) setAllLoaded(true);
      return data as Patient[];
    },
  });

  // Accumulate pages
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  useEffect(() => {
    if (patients.length > 0) {
      if (page === 0) {
        setAllPatients(patients);
      } else {
        setAllPatients((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          return [...prev, ...patients.filter((p) => !ids.has(p.id))];
        });
      }
    }
  }, [patients, page]);

  // Campaign participation query for detail view
  const { data: contactCampaigns = [] } = useQuery({
    queryKey: ["contact-campaigns", viewing?.id],
    enabled: !!viewing,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_recipients")
        .select("id, status, sent_at, opened_at, clicked_at, current_step, campaign_id, campaigns(name, status)")
        .eq("patient_id", viewing!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const parseTags = (t: string) => t ? t.split(",").map(s => s.trim()).filter(Boolean) : [];

  const patientPayload = (form: PatientFormData) => ({
    first_name: form.first_name,
    last_name: form.last_name,
    email: form.email || null,
    phone: form.phone || null,
    date_of_birth: form.date_of_birth || null,
    company: form.company || null,
    deal_value: form.deal_value ? Number(form.deal_value) : null,
    lead_source: form.lead_source || null,
    pipeline_stage: form.pipeline_stage || "new_lead",
    gender: (form as unknown as Record<string, unknown>).gender as string || null,
    address: form.address || null,
    city: form.city || null,
    state: form.state || null,
    zip_code: form.zip_code || null,
    status: form.status,
    tags: parseTags(form.tags),
    notes: form.notes || null,
  });

  const addMutation = useMutation({
    mutationFn: async (form: PatientFormData) => {
      const { error } = await supabase.from("patients").insert(patientPayload(form));
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.patients });
      setFormOpen(false);
      toast({ title: "Contact added successfully" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: PatientFormData }) => {
      const { data, error } = await supabase.from("patients")
        .update(patientPayload(form))
        .eq("id", id).select().single();
      if (error) throw error;
      return data as Patient;
    },
    onSuccess: (updatedPatient) => {
      queryClient.invalidateQueries({ queryKey: QK.patients });
      if (viewing && viewing.id === updatedPatient.id) setViewing(updatedPatient);
      setEditing(null);
      setFormOpen(false);
      toast({ title: "Contact updated" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("patients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.patients });
      setDeleteTarget(null);
      if (viewing?.id === deleteTarget?.id) setViewing(null);
      toast({ title: "Contact deleted" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("patients").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.patients });
      setSelected(new Set());
      setBulkDeleteOpen(false);
      toast({ title: `${selected.size} contacts deleted` });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allPatients.length, lead: 0, client: 0, active: 0, inactive: 0, archived: 0 };
    allPatients.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return counts;
  }, [allPatients]);

  const filtered = useMemo(() => {
    let result = allPatients;
    if (statusFilter !== "all") result = result.filter(p => p.status === statusFilter);
    if (stageFilter !== "all") result = result.filter(p => p.pipeline_stage === stageFilter);
    if (sourceFilter !== "all") result = result.filter(p => p.lead_source === sourceFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.first_name.toLowerCase().includes(q) || p.last_name.toLowerCase().includes(q) ||
        (p.email?.toLowerCase().includes(q) ?? false) ||
        (p.phone?.includes(q) ?? false) ||
        (p.company?.toLowerCase().includes(q) ?? false)
      );
    }
    if (sortBy === "name") result = [...result].sort((a, b) => a.first_name.localeCompare(b.first_name));
    else if (sortBy === "company") result = [...result].sort((a, b) => (a.company || "").localeCompare(b.company || ""));
    else if (sortBy === "deal_value") result = [...result].sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0));
    return result;
  }, [allPatients, statusFilter, stageFilter, sourceFilter, search, sortBy]);

  // ─── DETAIL VIEW ───
  if (viewing) {
    const p = viewing;
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setViewing(null); setDetailTab("overview"); }} className="gap-1 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Contacts
          </Button>
        </div>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 text-lg shadow-elevated">
              <AvatarFallback className="gradient-brand text-primary-foreground font-heading text-lg">
                {initials(p.first_name, p.last_name)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <h1 className="font-heading text-2xl font-bold text-foreground">
                {p.first_name} {p.last_name}
              </h1>
              <div className="flex items-center gap-2">
                <StatusPill status={p.status} />
                <Badge variant="outline">{PIPELINE_STAGE_LABELS[p.pipeline_stage] ?? p.pipeline_stage}</Badge>
                <LeadSourceBadge source={p.lead_source} />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {p.email && (
              <Button variant="outline" size="sm" asChild>
                <a href={`mailto:${p.email}`}><Mail className="h-3.5 w-3.5 mr-1" /> Email</a>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => { setEditing(p); setFormOpen(true); }}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(p)}>
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete Contact
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="shadow-card">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-heading font-bold text-foreground">{p.status}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Lifecycle</p>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-heading font-bold text-foreground">{PIPELINE_STAGE_LABELS[p.pipeline_stage] ?? p.pipeline_stage}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Stage</p>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-heading font-bold text-foreground">{contactCampaigns.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Campaigns</p>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-heading font-bold text-foreground">{relativeDate(p.created_at)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Added</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={detailTab} onValueChange={setDetailTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns ({contactCampaigns.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="shadow-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" /> Contact Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium">{p.email || "—"}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="font-medium">{p.phone || "—"}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <StatusPill status={p.status} />
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pipeline Stage</span>
                    <span className="font-medium">{PIPELINE_STAGE_LABELS[p.pipeline_stage] ?? p.pipeline_stage}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span className="font-medium text-right">
                      {[p.city, p.state].filter(Boolean).join(", ") || "—"}
                    </span>
                  </div>
                  {p.address && (
                    <>
                      <Separator />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Address</span>
                        <span className="font-medium text-right text-xs">{p.address}{p.zip_code ? `, ${p.zip_code}` : ""}</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" /> Additional Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Company</span>
                    <span className="font-medium">{p.company || "—"}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Deal Value</span>
                    <span className="font-medium">{formatCurrency(p.deal_value)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Lead Source</span>
                    <LeadSourceBadge source={p.lead_source} />
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stage</span>
                    <span className="font-medium">{PIPELINE_STAGE_LABELS[p.pipeline_stage] ?? p.pipeline_stage}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tags */}
            {p.tags && p.tags.length > 0 && (
              <Card className="shadow-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Tag className="h-4 w-4 text-primary" /> Tags
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {p.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <StickyNote className="h-4 w-4 text-primary" /> Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {p.notes ? (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{p.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No notes yet. Click Edit to add notes.</p>
                )}
              </CardContent>
            </Card>

            {/* Record info */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
              <span>Created {formatDate(p.created_at)}</span>
              <span>·</span>
              <span>Updated {formatDate(p.updated_at)}</span>
            </div>
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <PatientTimeline patientId={p.id} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="campaigns" className="mt-4 space-y-3">
            {contactCampaigns.length === 0 ? (
              <Card className="shadow-card">
                <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Send className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm font-medium">Not in any campaigns yet</p>
                  <p className="text-xs mt-1">Add this contact to a campaign from the Campaigns page</p>
                </CardContent>
              </Card>
            ) : (
              contactCampaigns.map((cr: any) => (
                <Card key={cr.id} className="shadow-card">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{cr.campaigns?.name || "Unknown Campaign"}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>Step {cr.current_step || 1}</span>
                          <span>·</span>
                          <span className="capitalize">{cr.status}</span>
                          {cr.sent_at && <><span>·</span><span>Sent {relativeDate(cr.sent_at)}</span></>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {cr.opened_at && (
                          <Badge variant="secondary" className="text-xs bg-emerald-50 text-emerald-700">Opened</Badge>
                        )}
                        {cr.clicked_at && (
                          <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700">Clicked</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Delete Dialog */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Contact</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove {deleteTarget?.first_name} {deleteTarget?.last_name} from your pipeline.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Add/Edit Dialog (must render inside detail view too) */}
        <Dialog open={formOpen} onOpenChange={(o) => { if (!o) { setFormOpen(false); setEditing(null); } }}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Contact" : "Add New Contact"}</DialogTitle>
              <DialogDescription>
                {editing ? "Update contact details below." : "Fill in the details to add a new contact to your pipeline."}
              </DialogDescription>
            </DialogHeader>
            <PatientForm
              key={editing?.id || "new"}
              defaultValues={editing ? {
                first_name: editing.first_name, last_name: editing.last_name,
                email: editing.email || "", phone: editing.phone || "",
                date_of_birth: editing.date_of_birth || "",
                company: editing.company || "",
                deal_value: editing.deal_value ? String(editing.deal_value) : "",
                lead_source: editing.lead_source || "",
                pipeline_stage: editing.pipeline_stage || "new_lead",
                address: editing.address || "", city: editing.city || "",
                state: editing.state || "", zip_code: editing.zip_code || "",
                status: editing.status, tags: (editing.tags || []).join(", "),
                notes: editing.notes || "",
              } : undefined}
              onSubmit={(data) => editing ? updateMutation.mutate({ id: editing.id, form: data }) : addMutation.mutate(data)}
              onCancel={() => { setFormOpen(false); setEditing(null); }}
              isSubmitting={addMutation.isPending || updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── LIST VIEW ───
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your sales pipeline · {allPatients.length} contact{allPatients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1.5 shadow-card">
            <Upload className="h-4 w-4" /><span className="hidden sm:inline">Import CSV</span>
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }} className="gap-1.5 shadow-card">
            <Plus className="h-4 w-4" /> Add Contact
          </Button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status tabs */}
          <div className="flex items-center bg-card border rounded-lg p-0.5 shadow-card overflow-x-auto max-w-full">
            {[
              { key: "all", label: "All" },
              { key: "lead", label: "Leads" },
              { key: "client", label: "Clients" },
              { key: "active", label: "Active" },
              { key: "inactive", label: "Cold" },
              { key: "archived", label: "Closed" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === f.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
                <span className="ml-1.5 opacity-70">{statusCounts[f.key] || 0}</span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 h-9">
                <ArrowUpDown className="h-3.5 w-3.5" />
                {sortBy === "newest" ? "Newest" : sortBy === "name" ? "Name" : sortBy === "company" ? "Company" : "Deal Value"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortBy("newest")}>Newest First</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("name")}>By Name</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("company")}>By Company</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("deal_value")}>By Deal Value</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* More filters toggle */}
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5 h-9"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {(stageFilter !== "all" || sourceFilter !== "all") && (
              <span className="ml-1 h-4 w-4 rounded-full bg-primary text-[9px] text-primary-foreground flex items-center justify-center font-bold">
                {[stageFilter !== "all", sourceFilter !== "all"].filter(Boolean).length}
              </span>
            )}
          </Button>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="gap-1.5 h-9 text-muted-foreground" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>

        {/* Expanded filter row */}
        {showFilters && (
          <div className="flex items-center gap-3 flex-wrap pl-1">
            {/* Pipeline stage filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                  <TrendingUp className="h-3 w-3" />
                  {stageFilter === "all" ? "All Stages" : PIPELINE_STAGE_LABELS[stageFilter] ?? stageFilter}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setStageFilter("all")}>All Stages</DropdownMenuItem>
                <DropdownMenuSeparator />
                {Object.entries(PIPELINE_STAGE_LABELS).map(([key, label]) => (
                  <DropdownMenuItem key={key} onClick={() => setStageFilter(key)}>
                    {label}
                    <span className="ml-auto text-muted-foreground text-xs">
                      {allPatients.filter(p => p.pipeline_stage === key).length}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Lead source filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                  <Tag className="h-3 w-3" />
                  {sourceFilter === "all" ? "All Sources" : LEAD_SOURCE_MAP[sourceFilter]?.label ?? sourceFilter}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setSourceFilter("all")}>All Sources</DropdownMenuItem>
                <DropdownMenuSeparator />
                {Object.entries(LEAD_SOURCE_MAP).map(([key, cfg]) => (
                  <DropdownMenuItem key={key} onClick={() => setSourceFilter(key)}>
                    {cfg.label}
                    <span className="ml-auto text-muted-foreground text-xs">
                      {allPatients.filter(p => p.lead_source === key).length}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-card">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        </div>
      )}

      {/* Table — horizontally scrollable on mobile */}
      <Card className="shadow-card overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading contacts…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Users className="h-6 w-6 opacity-40" />
              </div>
              <p className="text-sm font-medium">{search || statusFilter !== "all" ? "No contacts match your filters" : "No contacts yet"}</p>
              <p className="text-xs mt-1">{!search && statusFilter === "all" ? "Add your first contact to get started" : "Try adjusting your search or filters"}</p>
              {!search && statusFilter === "all" && (
                <Button size="sm" className="mt-4" onClick={() => { setEditing(null); setFormOpen(true); }}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Contact
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                    />
                  </TableHead>
                  <TableHead className="font-medium">Contact</TableHead>
                  <TableHead className="font-medium hidden sm:table-cell">Email</TableHead>
                  <TableHead className="font-medium hidden md:table-cell">Source</TableHead>
                  <TableHead className="font-medium hidden md:table-cell">Stage</TableHead>
                  <TableHead className="font-medium">Status</TableHead>
                  <TableHead className="font-medium hidden lg:table-cell">Tags</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id} className={`cursor-pointer group ${selected.has(p.id) ? "bg-primary/5" : ""}`} onClick={() => setViewing(p)}>
                    <TableCell onClick={(e) => { e.stopPropagation(); toggleSelect(p.id); }}>
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 text-xs shadow-sm">
                          <AvatarFallback className="gradient-brand text-primary-foreground font-heading">
                            {initials(p.first_name, p.last_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-foreground group-hover:text-primary transition-colors">
                            {p.first_name} {p.last_name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {[p.company, relativeDate(p.created_at)].filter(Boolean).join(" • ")}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm hidden sm:table-cell">
                      <div className="text-muted-foreground">{p.email || "—"}</div>
                      {p.phone && <div className="text-[11px] text-muted-foreground/70">{p.phone}</div>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell"><LeadSourceBadge source={p.lead_source} /></TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline">{PIPELINE_STAGE_LABELS[p.pipeline_stage] ?? p.pipeline_stage}</Badge>
                    </TableCell>
                    <TableCell><StatusPill status={p.status} /></TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {(p.tags || []).slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                        ))}
                        {(p.tags || []).length > 2 && (
                          <span className="text-[10px] text-muted-foreground">+{(p.tags || []).length - 2}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewing(p)}>
                            <Eye className="h-3.5 w-3.5 mr-2" /> View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setEditing(p); setFormOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(p)}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Summary + Load more */}
      <div className="flex flex-col items-center gap-2">
        {filtered.length > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Showing {filtered.length} of {allPatients.length}{!allLoaded ? "+" : ""} contacts
          </p>
        )}
        {!allLoaded && !isLoading && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
          >
            Load more contacts
          </Button>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => { if (!o) { setFormOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Contact" : "Add New Contact"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update contact details below." : "Fill in the details to add a new contact to your pipeline."}
            </DialogDescription>
          </DialogHeader>
          <PatientForm
            defaultValues={editing ? {
              first_name: editing.first_name, last_name: editing.last_name,
              email: editing.email || "", phone: editing.phone || "",
              date_of_birth: editing.date_of_birth || "",
              company: editing.company || "",
              deal_value: editing.deal_value ? String(editing.deal_value) : "",
              lead_source: editing.lead_source || "",
              pipeline_stage: editing.pipeline_stage || "new_lead",
              address: editing.address || "", city: editing.city || "",
              state: editing.state || "", zip_code: editing.zip_code || "",
              status: editing.status, tags: (editing.tags || []).join(", "),
              notes: editing.notes || "",
            } : undefined}
            onSubmit={(data) => editing ? updateMutation.mutate({ id: editing.id, form: data }) : addMutation.mutate(data)}
            onCancel={() => { setFormOpen(false); setEditing(null); }}
            isSubmitting={addMutation.isPending || updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {deleteTarget?.first_name} {deleteTarget?.last_name} from your pipeline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} Contacts</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {selected.size} contacts from your pipeline. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => bulkDeleteMutation.mutate(Array.from(selected))}
            >
              {bulkDeleteMutation.isPending ? "Deleting…" : `Delete ${selected.size} Contacts`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Import */}
      <BulkImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
