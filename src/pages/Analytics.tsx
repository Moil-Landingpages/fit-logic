import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import {
  BarChart, Bar, LineChart, Line, FunnelChart, Funnel, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, Mail, Users, DollarSign, MousePointerClick, AlertTriangle, CheckCircle2, Send,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 0) {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}
function pct(num: number, den: number) {
  if (!den) return "0%";
  return `${((num / den) * 100).toFixed(1)}%`;
}

const STAGE_ORDER = [
  "new_lead", "contacted", "qualified", "proposal", "negotiation", "won", "lost",
];
const STAGE_LABELS: Record<string, string> = {
  new_lead:    "New Lead",
  contacted:   "Contacted",
  qualified:   "Qualified",
  proposal:    "Proposal",
  negotiation: "Negotiation",
  won:         "Won",
  lost:        "Lost",
};
const STAGE_COLORS: Record<string, string> = {
  new_lead:    "#6366f1",
  contacted:   "#8b5cf6",
  qualified:   "#a78bfa",
  proposal:    "#f59e0b",
  negotiation: "#f97316",
  won:         "#22c55e",
  lost:        "#ef4444",
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  title, value, sub, icon: Icon, trend,
}: {
  title: string; value: string; sub?: string;
  icon: React.ElementType; trend?: { value: string; up: boolean };
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{title}</p>
            <p className="text-2xl font-bold font-heading mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
        {trend && (
          <div className={`mt-3 flex items-center gap-1 text-xs font-medium ${trend.up ? "text-green-600" : "text-red-500"}`}>
            <TrendingUp className={`h-3 w-3 ${trend.up ? "" : "rotate-180"}`} />
            {trend.value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Analytics() {
  // ── Patients / Pipeline ───────────────────────────────────────────────────
  const { data: patients = [] } = useQuery({
    queryKey: QK.patients,
    queryFn: async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, pipeline_stage, status, deal_value, lead_source, created_at");
      return data ?? [];
    },
  });

  // ── Campaigns ────────────────────────────────────────────────────────────
  const { data: campaigns = [] } = useQuery({
    queryKey: QK.campaigns,
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("id, name, status, stats, created_at, scheduled_at")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // ── Send log (last 90 days) ───────────────────────────────────────────────
  const { data: sendLog = [] } = useQuery({
    queryKey: ["send_log_analytics"],
    queryFn: async () => {
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("campaign_send_log")
        .select("status, opened_at, clicked_at, bounce_type, complaint_at, created_at, campaign_id")
        .gte("created_at", since);
      return data ?? [];
    },
  });

  // ── Inquiries ─────────────────────────────────────────────────────────────
  const { data: inquiries = [] } = useQuery({
    queryKey: QK.inquiries,
    queryFn: async () => {
      const { data } = await supabase
        .from("inquiries")
        .select("id, status, category, created_at, resolved_at");
      return data ?? [];
    },
  });

  // ─── Pipeline Funnel ────────────────────────────────────────────────────
  const pipelineFunnel = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of patients) {
      const s = p.pipeline_stage ?? "new_lead";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return STAGE_ORDER.filter((s) => s !== "lost").map((s) => ({
      stage: STAGE_LABELS[s],
      count: counts[s] ?? 0,
      fill:  STAGE_COLORS[s],
    }));
  }, [patients]);

  // ─── Pipeline KPIs ──────────────────────────────────────────────────────
  const pipelineKpis = useMemo(() => {
    const active  = patients.filter((p) => p.pipeline_stage !== "lost");
    const won     = patients.filter((p) => p.pipeline_stage === "won");
    const total   = patients.length;
    const wonVal  = won.reduce((s, p) => s + (p.deal_value ?? 0), 0);
    const pipeVal = active.reduce((s, p) => s + (p.deal_value ?? 0), 0);
    return { total, won: won.length, wonVal, pipeVal, convRate: pct(won.length, total) };
  }, [patients]);

  // ─── Lead Sources ───────────────────────────────────────────────────────
  const leadSources = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of patients) {
      const s = p.lead_source ?? "unknown";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([source, count]) => ({ source, count }));
  }, [patients]);

  // ─── Campaign Email Stats ────────────────────────────────────────────────
  const emailKpis = useMemo(() => {
    const total      = sendLog.length;
    const sent       = sendLog.filter((r) => r.status !== "failed" && r.status !== "skipped").length;
    const opened     = sendLog.filter((r) => r.opened_at).length;
    const clicked    = sendLog.filter((r) => r.clicked_at).length;
    const bounced    = sendLog.filter((r) => r.status === "bounced").length;
    const complained = sendLog.filter((r) => r.complaint_at).length;
    return {
      total,
      sent,
      opened,
      clicked,
      bounced,
      complained,
      openRate:  pct(opened, sent),
      clickRate: pct(clicked, sent),
      bounceRate: pct(bounced, sent),
    };
  }, [sendLog]);

  // ─── Campaign performance table ──────────────────────────────────────────
  const campaignPerf = useMemo(() => {
    return campaigns
      .filter((c) => c.stats)
      .map((c) => {
        const s = c.stats as Record<string, number> ?? {};
        return {
          name:      c.name,
          status:    c.status,
          sent:      s.sent ?? 0,
          openRate:  s.sent ? pct(s.opened ?? 0, s.sent) : "—",
          clickRate: s.sent ? pct(s.clicked ?? 0, s.sent) : "—",
          bounced:   s.bounced ?? 0,
        };
      })
      .slice(0, 10);
  }, [campaigns]);

  // ─── Sends per day (last 30 days) ────────────────────────────────────────
  const sendsPerDay = useMemo(() => {
    const buckets: Record<string, number> = {};
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const row of sendLog) {
      if (new Date(row.created_at).getTime() < cutoff) continue;
      const day = row.created_at.slice(0, 10);
      buckets[day] = (buckets[day] ?? 0) + 1;
    }
    const sorted = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b));
    return sorted.map(([date, count]) => ({
      date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count,
    }));
  }, [sendLog]);

  // ─── Inquiry stats ───────────────────────────────────────────────────────
  const inqStats = useMemo(() => {
    const total     = inquiries.length;
    const resolved  = inquiries.filter((i) => i.resolved_at).length;
    const escalated = inquiries.filter((i) => i.status === "escalated").length;
    const autoResp  = inquiries.filter((i) => i.status === "auto_responded").length;
    const byCategory: Record<string, number> = {};
    for (const i of inquiries) {
      const c = i.category ?? "uncategorized";
      byCategory[c] = (byCategory[c] ?? 0) + 1;
    }
    const categories = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count }));
    return { total, resolved, escalated, autoResp, categories };
  }, [inquiries]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="font-heading text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Pipeline performance, email engagement, and inquiry trends</p>
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="inquiries">Inquiries</TabsTrigger>
        </TabsList>

        {/* ── Pipeline Tab ───────────────────────────────────────────────── */}
        <TabsContent value="pipeline" className="space-y-5 mt-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard title="Total Contacts" value={fmt(pipelineKpis.total)} icon={Users} />
            <KpiCard title="Pipeline Value" value={`$${fmt(pipelineKpis.pipeVal)}`} icon={DollarSign} />
            <KpiCard title="Won Revenue" value={`$${fmt(pipelineKpis.wonVal)}`} sub={`${pipelineKpis.won} closed`} icon={CheckCircle2} />
            <KpiCard title="Conversion Rate" value={pipelineKpis.convRate} sub="leads → won" icon={TrendingUp} />
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* Funnel */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Pipeline Funnel</CardTitle>
                <CardDescription>Contacts at each stage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pipelineFunnel.map((s) => (
                    <div key={s.stage} className="flex items-center gap-3">
                      <span className="text-xs w-24 text-right text-muted-foreground shrink-0">{s.stage}</span>
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: pipelineFunnel[0]?.count ? `${(s.count / pipelineFunnel[0].count) * 100}%` : "0%",
                            backgroundColor: s.fill,
                          }}
                        />
                      </div>
                      <span className="text-xs w-8 font-medium">{s.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Lead Sources */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Lead Sources</CardTitle>
                <CardDescription>Where contacts come from</CardDescription>
              </CardHeader>
              <CardContent>
                {leadSources.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={leadSources} layout="vertical" margin={{ left: 8, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="source" tick={{ fontSize: 11 }} width={80} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Email Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="email" className="space-y-5 mt-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard title="Emails Sent" value={fmt(emailKpis.sent)} sub="last 90 days" icon={Send} />
            <KpiCard title="Open Rate" value={emailKpis.openRate} sub={`${fmt(emailKpis.opened)} opened`} icon={Mail} />
            <KpiCard title="Click Rate" value={emailKpis.clickRate} sub={`${fmt(emailKpis.clicked)} clicked`} icon={MousePointerClick} />
            <KpiCard title="Bounce Rate" value={emailKpis.bounceRate} sub={`${fmt(emailKpis.bounced)} bounced`} icon={AlertTriangle} />
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* Sends per day */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Sends per Day</CardTitle>
                <CardDescription>Last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                {sendsPerDay.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={sendsPerDay} margin={{ left: 0, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No sends yet in the last 30 days</p>
                )}
              </CardContent>
            </Card>

            {/* Engagement breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Engagement Breakdown</CardTitle>
                <CardDescription>Last 90 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 pt-2">
                  {[
                    { label: "Delivered",  value: emailKpis.sent,       color: "#6366f1" },
                    { label: "Opened",     value: emailKpis.opened,     color: "#22c55e" },
                    { label: "Clicked",    value: emailKpis.clicked,    color: "#f59e0b" },
                    { label: "Bounced",    value: emailKpis.bounced,    color: "#ef4444" },
                    { label: "Complained", value: emailKpis.complained, color: "#f97316" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="text-xs w-20 text-muted-foreground shrink-0">{row.label}</span>
                      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{
                            width: emailKpis.sent ? `${(row.value / emailKpis.sent) * 100}%` : "0%",
                            backgroundColor: row.color,
                          }}
                        />
                      </div>
                      <span className="text-xs w-12 text-right">{fmt(row.value)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Campaign performance table */}
          {campaignPerf.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Campaign Performance</CardTitle>
                <CardDescription>Top campaigns by send volume</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left pb-2 pr-4 font-medium">Campaign</th>
                        <th className="text-right pb-2 pr-4 font-medium">Sent</th>
                        <th className="text-right pb-2 pr-4 font-medium">Open %</th>
                        <th className="text-right pb-2 pr-4 font-medium">Click %</th>
                        <th className="text-right pb-2 font-medium">Bounced</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignPerf.map((c, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 pr-4 max-w-[200px] truncate">
                            <span title={c.name}>{c.name}</span>
                            <Badge variant="outline" className="ml-2 text-[10px] py-0">{c.status}</Badge>
                          </td>
                          <td className="py-2 pr-4 text-right">{fmt(c.sent)}</td>
                          <td className="py-2 pr-4 text-right">{c.openRate}</td>
                          <td className="py-2 pr-4 text-right">{c.clickRate}</td>
                          <td className="py-2 text-right">{fmt(c.bounced)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Inquiries Tab ──────────────────────────────────────────────── */}
        <TabsContent value="inquiries" className="space-y-5 mt-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard title="Total Inquiries" value={fmt(inqStats.total)} icon={Mail} />
            <KpiCard title="Resolved" value={fmt(inqStats.resolved)} sub={pct(inqStats.resolved, inqStats.total)} icon={CheckCircle2} />
            <KpiCard title="Auto-Responded" value={fmt(inqStats.autoResp)} sub="via FAQ" icon={Send} />
            <KpiCard title="Escalated" value={fmt(inqStats.escalated)} icon={AlertTriangle} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Inquiries by Category</CardTitle>
            </CardHeader>
            <CardContent>
              {inqStats.categories.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={inqStats.categories} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No inquiries yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
