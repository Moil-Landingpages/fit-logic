"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { toast } from "@/hooks/use-toast";
import {
  Users, Plus, Search, MoreHorizontal, Mail, Building2,
  Eye, Pencil, Trash2, ChevronLeft, ArrowUpDown, Tag, StickyNote,
  TrendingUp, Send, X, Filter, Upload, Download, Clock, FlaskConical, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  is_test_contact: boolean | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
};

function exportToCSV(rows: Patient[], filename = "contacts.csv") {
  const headers = [
    "First Name", "Last Name", "Email", "Phone", "Status", "Pipeline Stage",
    "Lead Source", "Company", "Deal Value", "City", "State", "Tags", "Notes", "Created At",
  ];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((p) =>
      [
        p.first_name, p.last_name, p.email, p.phone,
        p.status, p.pipeline_stage, p.lead_source, p.company,
        p.deal_value, p.city, p.state,
        (p.tags ?? []).join(";"), p.notes,
        new Date(p.created_at).toLocaleDateString(),
      ].map(escape).join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  // Legacy lifecycle values
  lead:        { label: "Lead",        color: "bg-blue-50 text-blue-700 border-blue-200",       dot: "bg-blue-500" },
  client:      { label: "Client",      color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  active:      { label: "Active",      color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  inactive:    { label: "Cold",        color: "bg-amber-50 text-amber-700 border-amber-200",    dot: "bg-amber-500" },
  archived:    { label: "Closed",      color: "bg-muted text-muted-foreground border-border",   dot: "bg-muted-foreground" },
  // Pipeline stage values (stored in status column)
  new_lead:    { label: "New Lead",    color: "bg-slate-100 text-slate-700 border-slate-200",   dot: "bg-slate-400" },
  contacted:   { label: "Contacted",   color: "bg-blue-100 text-blue-700 border-blue-200",      dot: "bg-blue-400" },
  qualified:   { label: "Qualified",   color: "bg-violet-100 text-violet-700 border-violet-200",dot: "bg-violet-400" },
  proposal:    { label: "Proposal",    color: "bg-indigo-100 text-indigo-700 border-indigo-200",dot: "bg-indigo-400" },
  negotiation: { label: "Negotiation", color: "bg-orange-100 text-orange-700 border-orange-200",dot: "bg-orange-400" },
  won:         { label: "Won",         color: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  lost:        { label: "Lost",        color: "bg-red-100 text-red-700 border-red-200",         dot: "bg-red-400" },
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

const PREVIEW_LINES = 5;

function CollapsibleBody({ text, bg }: { text: string; bg: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split("\n");
  const isLong = lines.length > PREVIEW_LINES || text.length > 400;
  const preview = isLong && !expanded ? lines.slice(0, PREVIEW_LINES).join("\n") : text;
  return (
    <div className={`rounded-lg border px-3 py-2.5 text-[11px] leading-relaxed text-foreground ${bg}`}>
      <p className="whitespace-pre-wrap break-words">{preview}{isLong && !expanded ? "…" : ""}</p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 text-[10px] font-medium text-primary hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function MailThread({ inq, contactName }: { inq: any; contactName: string }) {
  return (
    <Card className="shadow-card overflow-hidden">
      {/* Thread header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/30">
        <span className="h-2 w-2 rounded-full bg-blue-400 shrink-0" />
        <span className="text-xs font-semibold truncate flex-1">{inq.patient_name}</span>
        <span className="text-[10px] text-muted-foreground shrink-0">{(() => {
          const diff = Date.now() - new Date(inq.created_at).getTime();
          const d = Math.floor(diff / 86400000);
          return d === 0 ? "Today" : d === 1 ? "Yesterday" : d < 30 ? `${d}d ago` : new Date(inq.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        })()}</span>
        {inq.category && (
          <Badge variant="outline" className="text-[9px] shrink-0 capitalize">{inq.category.replace(/_/g, " ")}</Badge>
        )}
        <Badge className={`text-[9px] border-0 shrink-0 ${inq.status === "resolved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {inq.status}
        </Badge>
      </div>

      <div className="p-4 space-y-4">
        {/* Inbound bubble */}
        <div className="flex gap-3 items-start">
          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-[11px] font-bold text-muted-foreground mt-0.5">
            {(inq.patient_name?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="text-[12px] font-semibold">{inq.patient_name}</span>
              {inq.patient_email && <span className="text-[10px] text-muted-foreground truncate">&lt;{inq.patient_email}&gt;</span>}
            </div>
            <CollapsibleBody text={inq.raw_content || "—"} bg="bg-muted/50 border-border/50" />
          </div>
        </div>

        {/* Reply bubble */}
        {inq.response_text && (
          <div className="flex gap-3 items-start pl-2 border-l-2 border-primary/25">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Mail className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-[12px] font-semibold text-primary">You</span>
                {inq.resolved_at && (
                  <span className="text-[10px] text-muted-foreground">{(() => {
                    const diff = Date.now() - new Date(inq.resolved_at).getTime();
                    const d = Math.floor(diff / 86400000);
                    return d === 0 ? "Today" : d === 1 ? "Yesterday" : d < 30 ? `${d}d ago` : new Date(inq.resolved_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  })()}</span>
                )}
              </div>
              <CollapsibleBody text={inq.response_text} bg="bg-primary/5 border-primary/15" />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// Maps contact status tab keys to the DB status values they cover
const STATUS_TAB_MAP: Record<string, string[]> = {
  leads:       ["new_lead", "lead"],
  in_progress: ["contacted", "qualified", "proposal", "negotiation"],
  active:      ["won"],
  cold:        ["lost", "inactive"],
};

export default function Patients() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get("id");
  const deepLinked = useRef(false);
  const saved = loadFilters();
  const [search, setSearch] = useState<string>(saved?.search ?? "");
  const [statusFilter, setStatusFilter] = useState<string>(saved?.statusFilter ?? "all");
  const [stageFilter, setStageFilter] = useState<string>(saved?.stageFilter ?? "all");
  const [sourceFilter, setSourceFilter] = useState<string>(saved?.sourceFilter ?? "all");
  const [sortBy, setSortBy] = useState<"newest" | "name" | "company" | "deal_value" | "last_contacted_oldest" | "last_contacted_newest">(saved?.sortBy ?? "newest");
  const [contactFilter, setContactFilter] = useState<"all" | "never" | "30d">(saved?.contactFilter ?? "all");
  const [stateFilter, setStateFilter] = useState<string>(saved?.stateFilter ?? "all");
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
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ search, statusFilter, stageFilter, sourceFilter, sortBy, contactFilter, stateFilter }));
  }, [search, statusFilter, stageFilter, sourceFilter, sortBy, contactFilter, stateFilter]);

  const hasActiveFilters = search || statusFilter !== "all" || stageFilter !== "all" || sourceFilter !== "all" || contactFilter !== "all" || stateFilter !== "all";

  const clearFilters = () => {
    setSearch(""); setStatusFilter("all"); setStageFilter("all"); setSourceFilter("all"); setSortBy("newest"); setContactFilter("all"); setStateFilter("all");
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

  // Deep-link: open contact from ?id= param once patients load
  useEffect(() => {
    if (!deepLinkId || deepLinked.current || allPatients.length === 0) return;
    const match = allPatients.find((p) => p.id === deepLinkId);
    if (match) {
      deepLinked.current = true;
      setViewing(match);
    }
  }, [deepLinkId, allPatients]);

  // Inbox inquiries for this contact (inbound emails + replies)
  const { data: contactInquiries = [] } = useQuery({
    queryKey: ["contact-inquiries", viewing?.id],
    enabled: !!viewing,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inquiries")
        .select("id, raw_content, response_text, category, status, created_at, resolved_at, patient_name, patient_email")
        .eq("patient_id", viewing!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Mailing history query for detail view
  const { data: contactMailLog = [] } = useQuery({
    queryKey: ["contact-mail-log", viewing?.id],
    enabled: !!viewing && !!viewing.email,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_send_log")
        .select(`
          id, step_number, status, sent_at, opened_at, clicked_at, error_message,
          campaign_id, recipient_id,
          campaign_recipients!inner(email, name, patient_id),
          campaigns(name)
        `)
        .eq("campaign_recipients.patient_id", viewing!.id)
        .order("sent_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

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

  const patientPayload = (form: PatientFormData) => {
    // patients.status   = account status (active/inactive/archived)
    // patients.pipeline_stage = deal stage (new_lead/contacted/qualified/...)
    // The two are separate columns — see migration 20260406000001 for the
    // pipeline_stage CHECK constraint.
    return {
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email || null,
      phone: form.phone || null,
      date_of_birth: form.date_of_birth || null,
      company: form.company || null,
      deal_value: form.deal_value ? Number(form.deal_value) : null,
      lead_source: form.lead_source || null,
      gender: (form as unknown as Record<string, unknown>).gender as string || null,
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      zip_code: form.zip_code || null,
      status: form.status || "active",
      pipeline_stage: form.pipeline_stage || "new_lead",
      is_test_contact: !!form.is_test_contact,
      tags: parseTags(form.tags),
      notes: form.notes || null,
    };
  };

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
      return id;
    },
    onSuccess: (deletedId) => {
      queryClient.invalidateQueries({ queryKey: QK.patients });
      setDeleteTarget(null);
      if (viewing?.id === deletedId) { setViewing(null); setDetailTab("overview"); }
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

  // A2.3: bulk-tag selected contacts into a segment via segments.manual_contact_ids.
  const { data: segments = [] } = useQuery({
    queryKey: QK.segments,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("segments")
        .select("id, name, manual_contact_ids")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; manual_contact_ids: string[] | null }[];
    },
  });
  const [addToSegmentOpen, setAddToSegmentOpen] = useState(false);
  const [segmentChoice, setSegmentChoice] = useState<string>("");

  const addToSegmentMutation = useMutation({
    mutationFn: async ({ segmentId, ids }: { segmentId: string; ids: string[] }) => {
      const seg = segments.find((s) => s.id === segmentId);
      if (!seg) throw new Error("Segment not found");
      const merged = Array.from(new Set([...(seg.manual_contact_ids ?? []), ...ids]));
      const { error } = await supabase
        .from("segments")
        .update({ manual_contact_ids: merged })
        .eq("id", segmentId);
      if (error) throw error;
      return { name: seg.name, added: ids.length };
    },
    onSuccess: ({ name, added }) => {
      queryClient.invalidateQueries({ queryKey: QK.segments });
      setSelected(new Set());
      setAddToSegmentOpen(false);
      setSegmentChoice("");
      toast({ title: `Added ${added} to “${name}”` });
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
    const counts: Record<string, number> = { all: allPatients.length };
    Object.entries(STATUS_TAB_MAP).forEach(([tab, statuses]) => {
      counts[tab] = allPatients.filter(p => statuses.includes(p.status)).length;
    });
    return counts;
  }, [allPatients]);

  const filtered = useMemo(() => {
    let result = allPatients;
    if (statusFilter !== "all") {
      const allowedStatuses = STATUS_TAB_MAP[statusFilter];
      if (allowedStatuses) {
        result = result.filter(p => allowedStatuses.includes(p.status));
      } else {
        result = result.filter(p => p.status === statusFilter);
      }
    }
    if (stageFilter !== "all") result = result.filter(p => p.pipeline_stage === stageFilter);
    if (sourceFilter !== "all") result = result.filter(p => p.lead_source === sourceFilter);
    if (stateFilter !== "all") {
      const norm = stateFilter.trim().toLowerCase();
      result = result.filter(p => (p.state ?? "").trim().toLowerCase() === norm);
    }
    if (contactFilter === "never") {
      result = result.filter(p => !p.last_contacted_at);
    } else if (contactFilter === "30d") {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      result = result.filter(p => !p.last_contacted_at || new Date(p.last_contacted_at).getTime() < thirtyDaysAgo);
    }
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
    else if (sortBy === "last_contacted_oldest") {
      // NULL last_contacted_at = "never contacted" — surface to the top so
      // Megan picks them first in her daily 10-contact pull.
      result = [...result].sort((a, b) => {
        const aT = a.last_contacted_at ? new Date(a.last_contacted_at).getTime() : -Infinity;
        const bT = b.last_contacted_at ? new Date(b.last_contacted_at).getTime() : -Infinity;
        return aT - bT;
      });
    } else if (sortBy === "last_contacted_newest") {
      result = [...result].sort((a, b) => {
        const aT = a.last_contacted_at ? new Date(a.last_contacted_at).getTime() : -Infinity;
        const bT = b.last_contacted_at ? new Date(b.last_contacted_at).getTime() : -Infinity;
        return bT - aT;
      });
    }
    return result;
  }, [allPatients, statusFilter, stageFilter, sourceFilter, search, sortBy, contactFilter, stateFilter]);

  // Distinct state values present in the loaded contacts — fuels the
  // state-filter dropdown so Megan can scope a campaign to (e.g.) Texas.
  const stateOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const p of allPatients) {
      const s = (p.state ?? "").trim();
      if (s) seen.add(s);
    }
    return Array.from(seen).sort();
  }, [allPatients]);

  // ─── DETAIL VIEW ───
  if (viewing) {
    const p = viewing;
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setViewing(null); setDetailTab("overview"); router.replace("/contacts"); }} className="gap-1 text-muted-foreground hover:text-foreground">
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
              <div className="flex items-center gap-2 flex-wrap">
                <StatusPill status={p.status} />
                <Badge variant="outline">{PIPELINE_STAGE_LABELS[p.pipeline_stage] ?? p.pipeline_stage}</Badge>
                <LeadSourceBadge source={p.lead_source} />
                {p.is_test_contact && (
                  <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-100/40">
                    <FlaskConical className="h-3 w-3 mr-1" /> Test
                  </Badge>
                )}
                {p.last_contacted_at && (
                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last contact {new Date(p.last_contacted_at).toLocaleDateString()}
                  </span>
                )}
                {!p.last_contacted_at && (
                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Never contacted
                  </span>
                )}
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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns ({contactCampaigns.length})</TabsTrigger>
            <TabsTrigger value="mailing">Mailing ({contactInquiries.length + contactMailLog.length})</TabsTrigger>
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

          <TabsContent value="mailing" className="mt-4">
            {contactInquiries.length === 0 && contactMailLog.length === 0 ? (
              <Card className="shadow-card">
                <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Mail className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm font-medium">No emails for this contact yet</p>
                  <p className="text-xs mt-1">Inbound messages and campaign emails will appear here</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* ── Inbox threads ── */}
                {contactInquiries.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-0.5">Inbox Threads</p>
                    {contactInquiries.map((inq: any) => (
                      <MailThread key={inq.id} inq={inq} contactName={p.first_name + " " + p.last_name} />
                    ))}
                  </div>
                )}

                {/* ── Campaign outbound emails ── */}
                {contactMailLog.length > 0 && (() => {
                  const grouped: Record<string, any[]> = {};
                  contactMailLog.forEach((log: any) => {
                    if (!grouped[log.campaign_id]) grouped[log.campaign_id] = [];
                    grouped[log.campaign_id].push(log);
                  });
                  return (
                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-0.5">Campaign Emails</p>
                      {Object.entries(grouped).map(([campaignId, logs]) => {
                        const campaignName = (logs[0] as any)?.campaigns?.name || "Unknown Campaign";
                        return (
                          <Card key={campaignId} className="shadow-card">
                            <CardHeader className="pb-2 pt-4">
                              <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Mail className="h-4 w-4 text-primary shrink-0" />
                                <span className="truncate">{campaignName}</span>
                                <Badge variant="outline" className="text-[9px] ml-auto shrink-0">{logs.length} email{logs.length !== 1 ? 's' : ''}</Badge>
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0 divide-y divide-border/50">
                              {logs.map((log: any) => (
                                <div key={log.id} className="flex items-center justify-between py-2.5 gap-3">
                                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                    <Badge variant="outline" className="text-[9px] font-mono shrink-0">Step {log.step_number ?? 1}</Badge>
                                    <Badge className={`text-[9px] border-0 shrink-0 ${
                                      log.status === 'sent' ? 'bg-primary/10 text-primary' :
                                      log.status === 'failed' ? 'bg-destructive/10 text-destructive' :
                                      'bg-muted text-muted-foreground'
                                    }`}>{log.status}</Badge>
                                    {log.opened_at && <Badge variant="secondary" className="text-[9px] bg-emerald-50 text-emerald-700 shrink-0">Opened</Badge>}
                                    {log.clicked_at && <Badge variant="secondary" className="text-[9px] bg-blue-50 text-blue-700 shrink-0">Clicked</Badge>}
                                    {log.error_message && <span className="text-[10px] text-destructive truncate max-w-[120px]">{log.error_message}</span>}
                                  </div>
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    {log.sent_at ? relativeDate(log.sent_at) : '—'}
                                  </span>
                                </div>
                              ))}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
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
                is_test_contact: !!editing.is_test_contact,
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
          <Button
            variant="outline" size="sm"
            onClick={() => exportToCSV(filtered, `contacts-${new Date().toISOString().slice(0,10)}.csv`)}
            className="gap-1.5 shadow-card"
            title={`Export ${filtered.length} contact${filtered.length !== 1 ? "s" : ""} to CSV`}
          >
            <Download className="h-4 w-4" /><span className="hidden sm:inline">Export CSV</span>
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
              { key: "all",         label: "All" },
              { key: "in_progress", label: "In Progress" },
              { key: "active",      label: "Active" },
              { key: "cold",        label: "Cold" },
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
                {sortBy === "newest" ? "Newest"
                  : sortBy === "name" ? "Name"
                  : sortBy === "company" ? "Company"
                  : sortBy === "deal_value" ? "Deal Value"
                  : sortBy === "last_contacted_oldest" ? "Oldest contact"
                  : "Newest contact"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortBy("newest")}>Newest First</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("name")}>By Name</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("company")}>By Company</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("deal_value")}>By Deal Value</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("last_contacted_oldest")}>Last Contacted (oldest first)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("last_contacted_newest")}>Last Contacted (newest first)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Last-contacted quick-filter chip (A1.4) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={contactFilter !== "all" ? "secondary" : "outline"}
                size="sm"
                className="gap-1.5 h-9"
              >
                <Clock className="h-3.5 w-3.5" />
                {contactFilter === "never" ? "Never contacted"
                  : contactFilter === "30d" ? "Not in 30d"
                  : "Any contact recency"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setContactFilter("all")}>All contacts</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setContactFilter("never")}>Never contacted</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setContactFilter("30d")}>Not contacted in 30 days</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* State filter (A2.6) — runs over distinct values in the loaded
              contact set so it doesn't surface states with no contacts. */}
          {stateOptions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={stateFilter !== "all" ? "secondary" : "outline"}
                  size="sm"
                  className="gap-1.5 h-9"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  {stateFilter === "all" ? "Any state" : stateFilter}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                <DropdownMenuItem onClick={() => setStateFilter("all")}>Any state</DropdownMenuItem>
                {stateOptions.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => setStateFilter(s)}>{s}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

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
          <Button variant="outline" size="sm" onClick={() => setAddToSegmentOpen(true)}>
            <Tag className="h-3.5 w-3.5 mr-1" /> Add to segment
          </Button>
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
                    <TableCell className="p-0" onClick={(e) => { e.stopPropagation(); toggleSelect(p.id); }}>
                      <label className="flex items-center justify-center w-full h-full min-h-[44px] cursor-pointer px-3">
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                        />
                      </label>
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
              is_test_contact: !!editing.is_test_contact,
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

      {/* Add to segment (A2.3) */}
      <Dialog open={addToSegmentOpen} onOpenChange={(o) => { setAddToSegmentOpen(o); if (!o) setSegmentChoice(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add {selected.size} contact{selected.size === 1 ? "" : "s"} to a segment</DialogTitle>
            <DialogDescription>
              Pick the segment to tag. Existing members of that segment are kept; duplicates are ignored.
            </DialogDescription>
          </DialogHeader>
          <Select value={segmentChoice} onValueChange={setSegmentChoice}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select segment" /></SelectTrigger>
            <SelectContent>
              {segments.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddToSegmentOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addToSegmentMutation.mutate({ segmentId: segmentChoice, ids: Array.from(selected) })}
              disabled={!segmentChoice || addToSegmentMutation.isPending}
            >
              {addToSegmentMutation.isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
