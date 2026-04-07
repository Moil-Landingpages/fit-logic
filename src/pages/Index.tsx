import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Mail, TrendingUp, ArrowRight,
  Share2, DollarSign, Plus, GripVertical, Target, Trophy,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

// Pipeline stage config — order matters for kanban columns
const PIPELINE_STAGES = [
  { key: "new_lead",     label: "New Lead",     color: "bg-slate-100 text-slate-700 border-slate-200",     dot: "bg-slate-400" },
  { key: "contacted",    label: "Contacted",    color: "bg-blue-100 text-blue-700 border-blue-200",         dot: "bg-blue-400" },
  { key: "qualified",    label: "Qualified",    color: "bg-violet-100 text-violet-700 border-violet-200",   dot: "bg-violet-400" },
  { key: "proposal",     label: "Proposal",     color: "bg-amber-100 text-amber-700 border-amber-200",      dot: "bg-amber-400" },
  { key: "negotiation",  label: "Negotiation",  color: "bg-orange-100 text-orange-700 border-orange-200",   dot: "bg-orange-500" },
  { key: "won",          label: "Won",          color: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  { key: "lost",         label: "Lost",         color: "bg-red-100 text-red-700 border-red-200",            dot: "bg-red-400" },
] as const;

type PipelineStage = typeof PIPELINE_STAGES[number]["key"];

type ContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  status: string;
  created_at: string;
};

function fmt$(v: number | null) {
  if (v == null) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function relDate(d: string) {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "1d";
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

function initials(f: string, l: string) {
  return `${f[0] || ""}${l[0] || ""}`.toUpperCase();
}

// ─── Kanban Card ───────────────────────────────────────────────────────────────
function PipelineCard({
  contact,
  onDragStart,
  onNavigate,
}: {
  contact: ContactRow;
  onDragStart: (id: string) => void;
  onNavigate: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(contact.id)}
      className="bg-card border border-border rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow group"
      onClick={onNavigate}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
            {initials(contact.first_name, contact.last_name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate leading-tight">
              {contact.first_name} {contact.last_name}
            </p>
            {contact.email && (
              <p className="text-[11px] text-muted-foreground truncate">{contact.email}</p>
            )}
          </div>
        </div>
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="flex items-center justify-between mt-2.5">
        <Badge variant="outline" className="text-[10px]">{contact.status}</Badge>
        <span className="text-[10px] text-muted-foreground">{relDate(contact.created_at)}</span>
      </div>
    </div>
  );
}

// ─── Kanban Column ─────────────────────────────────────────────────────────────
function KanbanColumn({
  stage,
  contacts,
  onDragStart,
  onDrop,
  onNavigate,
}: {
  stage: typeof PIPELINE_STAGES[number];
  contacts: ContactRow[];
  onDragStart: (id: string) => void;
  onDrop: (stage: string) => void;
  onNavigate: (id: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const totalValue = contacts.length;

  return (
    <div
      className={`flex flex-col rounded-xl border transition-colors min-h-[200px] ${
        dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30"
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={() => { setDragOver(false); onDrop(stage.key); }}
    >
      {/* Column header */}
      <div className="px-3 py-2.5 border-b border-border/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${stage.dot}`} />
            <span className="text-xs font-semibold text-foreground">{stage.label}</span>
            <span className="text-[10px] text-muted-foreground bg-background rounded-full px-1.5 py-0.5 border">
              {contacts.length}
            </span>
          </div>
          {totalValue > 0 && (
            <span className="text-[10px] text-muted-foreground font-medium">{totalValue} contacts</span>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[480px]">
        {contacts.map((c) => (
          <PipelineCard
            key={c.id}
            contact={c}
            onDragStart={onDragStart}
            onNavigate={() => onNavigate(c.id)}
          />
        ))}
        {contacts.length === 0 && (
          <div className="flex items-center justify-center h-16 text-[11px] text-muted-foreground/50 rounded-lg border border-dashed border-border/50">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
const Index = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"pipeline" | "summary">("pipeline");

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: QK.patients,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, first_name, last_name, email, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContactRow[];
    },
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: QK.campaigns,
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("id, name, status, sent_count, recipient_count, stats, created_at")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: referrals = [] } = useQuery({
    queryKey: QK.referrals,
    queryFn: async () => {
      const { data } = await supabase
        .from("referrals").select("id, status").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: submissions = [] } = useQuery({
    queryKey: QK.intakeSubmissions,
    queryFn: async () => {
      const { data } = await supabase
        .from("intake_submissions")
        .select("id, review_status, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  // Move contact to a new pipeline stage
  const stageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase
        .from("patients").update({ status: stage }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.patients }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to move contact"),
  });

  const handleDrop = (targetStage: string) => {
    if (!draggingId || !targetStage) return;
    const contact = contacts.find((c) => c.id === draggingId);
    if (!contact || contact.status === targetStage) { setDraggingId(null); return; }
    stageMutation.mutate({ id: draggingId, stage: targetStage });
    setDraggingId(null);
  };

  // Group contacts by stage
  const byStage = Object.fromEntries(
    PIPELINE_STAGES.map((s) => [s.key, contacts.filter((c) => c.status === s.key)])
  ) as Record<PipelineStage, ContactRow[]>;

  // KPIs
  const activeContacts   = contacts.filter((c) => c.status === "active").length;
  const activeCampaigns  = campaigns.filter((c) => c.status === "active" || c.status === "scheduled").length;
  const totalSent        = campaigns.reduce((s, c) => s + ((c as any).sent_count || 0), 0);
  const pendingLeads     = (submissions as any[]).filter((s) => s.review_status === "pending").length;
  const convertedReferrals = referrals.filter((r: any) => r.status === "converted").length;
  const pipelineContacts = contacts.length;
  const wonCount         = byStage.won?.length ?? 0;
  const lostCount        = byStage.lost?.length ?? 0;
  const totalDeals       = wonCount + lostCount;
  const conversionRate   = totalDeals > 0 ? Math.round((wonCount / totalDeals) * 100) : 0;

  const recentCampaigns = campaigns.slice(0, 4);

  const metrics = [
    { label: "Total Contacts",    value: contacts.length,               icon: Users,            color: "text-primary",     bg: "bg-primary/10",     action: () => navigate("/contacts") },
    { label: "Active Contacts",   value: activeContacts,               icon: Users,            color: "text-primary",     bg: "bg-primary/10",     action: () => navigate("/contacts") },
    { label: "Live Campaigns",    value: activeCampaigns,              icon: Mail,             color: "text-blue-600",    bg: "bg-blue-500/10",    action: () => navigate("/campaigns") },
    { label: "Pending Leads",     value: pendingLeads,                 icon: Target,           color: "text-amber-600",   bg: "bg-amber-500/10",   action: () => navigate("/forms") },
    { label: "Conversion Rate",   value: `${conversionRate}%`,         icon: TrendingUp,       color: "text-violet-600",  bg: "bg-violet-500/10",  action: () => {} },
    { label: "Emails Sent",       value: totalSent,                    icon: Mail,             color: "text-blue-600",    bg: "bg-blue-500/10",    action: () => navigate("/campaigns") },
    { label: "Referrals Won",     value: convertedReferrals,           icon: Share2,           color: "text-orange-600",  bg: "bg-orange-500/10",  action: () => navigate("/referrals") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Sales Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            {contacts.length} contacts
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/contacts")}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Contact
          </Button>
          <Button size="sm" onClick={() => navigate("/campaigns")}>
            <Mail className="h-3.5 w-3.5 mr-1" /> New Campaign
          </Button>
        </div>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.slice(0, 4).map((m) => (
          <Card
            key={m.label}
            className={`cursor-pointer hover:shadow-md transition-shadow ${m.action ? "" : "cursor-default"}`}
            onClick={m.action}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`rounded-lg p-2 ${m.bg}`}>
                  <m.icon className={`h-4 w-4 ${m.color}`} />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold font-heading text-foreground">{m.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs: Pipeline Board vs Summary */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "pipeline" | "summary")}>
        <TabsList>
          <TabsTrigger value="pipeline">
            <LayoutDashboard className="h-3.5 w-3.5 mr-1.5" /> Pipeline Board
          </TabsTrigger>
          <TabsTrigger value="summary">
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" /> Summary
          </TabsTrigger>
        </TabsList>

        {/* ── Pipeline Kanban ── */}
        <TabsContent value="pipeline" className="mt-4">
          {contactsLoading ? (
            <div className="grid grid-cols-7 gap-3">
              {PIPELINE_STAGES.map((s) => (
                <div key={s.key} className="h-64 rounded-xl bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${PIPELINE_STAGES.length}, minmax(160px, 1fr))` }}
            >
              {PIPELINE_STAGES.map((stage) => (
                <KanbanColumn
                  key={stage.key}
                  stage={stage}
                  contacts={byStage[stage.key] ?? []}
                  onDragStart={(id) => setDraggingId(id)}
                  onDrop={handleDrop}
                  onNavigate={(id) => navigate(`/contacts?id=${id}`)}
                />
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Drag cards between columns to update pipeline stage
          </p>
        </TabsContent>

        {/* ── Summary ── */}
        <TabsContent value="summary" className="mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {metrics.slice(4).map((m) => (
              <Card key={m.label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={m.action}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className={`rounded-lg p-2 ${m.bg}`}>
                      <m.icon className={`h-4 w-4 ${m.color}`} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold font-heading text-foreground">{m.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Recent Contacts */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-heading">Recent Contacts</CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/contacts")}>
                    View all <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No contacts yet</p>
                ) : (
                  contacts.slice(0, 5).map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between py-1.5 border-b last:border-0 border-border/50 cursor-pointer hover:bg-muted/30 rounded px-1 transition-colors"
                      onClick={() => navigate("/contacts")}
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{c.first_name} {c.last_name}</p>
                        <p className="text-xs text-muted-foreground">{c.email || "No details"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Campaign Activity */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-heading">Campaign Activity</CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/campaigns")}>
                    View all <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {recentCampaigns.length === 0 ? (
                  <div className="text-center py-8">
                    <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground mb-3">No campaigns yet</p>
                    <Button size="sm" onClick={() => navigate("/campaigns")}>Create First Campaign</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentCampaigns.map((c: any) => {
                      const stats = (c.stats as Record<string, number> | null) ?? {};
                      const openRate = stats.opened && c.sent_count
                        ? Math.round((stats.opened / c.sent_count) * 100) : 0;
                      return (
                        <div
                          key={c.id}
                          className="flex items-center gap-4 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => navigate("/campaigns")}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                              <span>{c.sent_count || 0} sent</span>
                              <span>{c.recipient_count || 0} recipients</span>
                              {openRate > 0 && <span className="text-emerald-600">{openRate}% opened</span>}
                            </div>
                          </div>
                          <Badge variant="outline" className={`text-[10px] ${
                            c.status === "active"    ? "border-emerald-200 text-emerald-700 bg-emerald-500/10" :
                            c.status === "scheduled" ? "border-blue-200 text-blue-700 bg-blue-500/10" :
                            "border-border text-muted-foreground"
                          }`}>{c.status}</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-heading">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "New Campaign", icon: Mail,    path: "/campaigns", color: "text-primary" },
                  { label: "Add Contact",  icon: Users,   path: "/contacts",  color: "text-emerald-600" },
                  { label: "Referrals",    icon: Share2,  path: "/referrals", color: "text-blue-600" },
                  { label: "Analytics",    icon: TrendingUp, path: "/analytics", color: "text-violet-600" },
                ].map((a) => (
                  <Button key={a.label} variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate(a.path)}>
                    <a.icon className={`h-5 w-5 ${a.color}`} />
                    <span className="text-xs">{a.label}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Index;
