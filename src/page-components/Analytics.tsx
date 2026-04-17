"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_CONFIG, type InquiryCategory } from "@/lib/types";
import {
  TrendingUp, Mail, Users, DollarSign, MousePointerClick, AlertTriangle, CheckCircle2, Send,
} from "lucide-react";

type PatientAnalyticsRow = {
  id: string;
  status: string;
  pipeline_stage: string | null;
  lead_source: string | null;
  deal_value: number | null;
  company: string | null;
  created_at: string;
};

type CampaignAnalyticsRow = {
  id: string;
  name: string;
  status: string;
  stats: Record<string, number> | null;
  created_at: string;
  scheduled_at: string | null;
};

type SendLogRow = {
  status: string;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
  campaign_id: string;
};

type InquiryAnalyticsRow = {
  id: string;
  status: string;
  category: string | null;
  created_at: string;
  resolved_at: string | null;
};

function fmt(value: number | null | undefined, decimals = 0) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function fmtCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(num: number, den: number) {
  if (!den) return "0%";
  return `${((num / den) * 100).toFixed(1)}%`;
}

const STAGE_ORDER = [
  "new_lead",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;

const STAGE_LABELS: Record<string, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

const STAGE_COLORS: Record<string, string> = {
  new_lead: "#0e9aa7",
  contacted: "#2563eb",
  qualified: "#7c3aed",
  proposal: "#f59e0b",
  negotiation: "#f97316",
  won: "#22c55e",
  lost: "#ef4444",
};

const LEAD_SOURCE_LABELS: Record<string, string> = {
  referral: "Referral",
  "cold-outreach": "Cold Outreach",
  inbound: "Inbound",
  event: "Event",
  social: "Social Media",
  other: "Other",
};

function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-bold font-heading">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Analytics() {
  const { data: patients = [] } = useQuery({
    queryKey: QK.patients,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*");
      if (error) throw error;
      return data as unknown as PatientAnalyticsRow[];
    },
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: QK.campaigns,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, status, stats, created_at, scheduled_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CampaignAnalyticsRow[];
    },
  });

  const { data: sendLog = [] } = useQuery({
    queryKey: ["send_log_analytics"],
    queryFn: async () => {
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("campaign_send_log")
        .select("status, opened_at, clicked_at, created_at, campaign_id")
        .gte("created_at", since);
      if (error) throw error;
      return data as SendLogRow[];
    },
  });

  const { data: inquiries = [] } = useQuery({
    queryKey: QK.inquiries,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inquiries")
        .select("id, status, category, created_at, resolved_at");
      if (error) throw error;
      return data as InquiryAnalyticsRow[];
    },
  });

  const pipelineFunnel = useMemo(() => {
    const counts = Object.fromEntries(STAGE_ORDER.map((stage) => [stage, 0])) as Record<string, number>;
    for (const patient of patients) {
      const stage = patient.pipeline_stage ?? "new_lead";
      counts[stage] = (counts[stage] ?? 0) + 1;
    }

    return STAGE_ORDER
      .map((stage) => ({
        stage,
        label: STAGE_LABELS[stage],
        count: counts[stage] ?? 0,
        fill: STAGE_COLORS[stage],
      }))
      .filter((row) => row.count > 0);
  }, [patients]);

  const pipelineKpis = useMemo(() => {
    const total = patients.length;
    const openOpportunities = patients.filter((patient) => {
      const stage = patient.pipeline_stage ?? "new_lead";
      return stage !== "won" && stage !== "lost";
    }).length;
    const wonDeals = patients.filter((patient) => patient.pipeline_stage === "won").length;
    const pipelineValue = patients.reduce((sum, patient) => {
      if (patient.pipeline_stage === "lost") return sum;
      return sum + (patient.deal_value ?? 0);
    }, 0);

    return {
      total,
      openOpportunities,
      wonDeals,
      winRate: pct(wonDeals, total),
      pipelineValue,
    };
  }, [patients]);

  const leadSources = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const patient of patients) {
      const source = patient.lead_source ?? "other";
      counts[source] = (counts[source] ?? 0) + 1;
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([source, count]) => ({
        source: LEAD_SOURCE_LABELS[source] ?? source,
        count,
      }));
  }, [patients]);

  const emailKpis = useMemo(() => {
    const total = sendLog.length;
    const sent = sendLog.filter((row) => row.status !== "failed" && row.status !== "skipped").length;
    const opened = sendLog.filter((row) => row.opened_at).length;
    const clicked = sendLog.filter((row) => row.clicked_at).length;
    const bounced = sendLog.filter((row) => row.status === "bounced").length;
    const complained = 0;

    return {
      total,
      sent,
      opened,
      clicked,
      bounced,
      complained,
      openRate: pct(opened, sent),
      clickRate: pct(clicked, sent),
      bounceRate: pct(bounced, sent),
    };
  }, [sendLog]);

  const campaignPerf = useMemo(() => {
    return campaigns
      .filter((campaign) => campaign.stats)
      .map((campaign) => {
        const stats = campaign.stats ?? {};
        return {
          name: campaign.name,
          status: campaign.status,
          sent: stats.sent ?? 0,
          openRate: stats.sent ? pct(stats.opened ?? 0, stats.sent) : "—",
          clickRate: stats.sent ? pct(stats.clicked ?? 0, stats.sent) : "—",
          bounced: stats.bounced ?? 0,
        };
      })
      .slice(0, 10);
  }, [campaigns]);

  const sendsPerDay = useMemo(() => {
    const buckets: Record<string, number> = {};
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

    for (const row of sendLog) {
      if (new Date(row.created_at).getTime() < cutoff) continue;
      const day = row.created_at.slice(0, 10);
      buckets[day] = (buckets[day] ?? 0) + 1;
    }

    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({
        date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        count,
      }));
  }, [sendLog]);

  const inqStats = useMemo(() => {
    const total = inquiries.length;
    const resolved = inquiries.filter((inquiry) => inquiry.resolved_at).length;
    const escalated = inquiries.filter((inquiry) => inquiry.status === "escalated").length;
    const autoResp = inquiries.filter((inquiry) => inquiry.status === "auto_responded").length;
    const byCategory: Record<string, number> = {};

    for (const inquiry of inquiries) {
      const category = inquiry.category ?? "General_Info";
      byCategory[category] = (byCategory[category] ?? 0) + 1;
    }

    return {
      total,
      resolved,
      escalated,
      autoResp,
      categories: Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => ({
          category: CATEGORY_CONFIG[category as InquiryCategory]?.label ?? category.replace(/_/g, " "),
          count,
        })),
    };
  }, [inquiries]);

  const maxFunnelCount = Math.max(...pipelineFunnel.map((row) => row.count), 0);

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Analytics</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Pipeline performance, email engagement, and inquiry trends
        </p>
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="inquiries">Inquiries</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-4 space-y-5">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard title="Total Contacts" value={fmt(pipelineKpis.total)} icon={Users} />
            <KpiCard title="Open Opportunities" value={fmt(pipelineKpis.openOpportunities)} icon={TrendingUp} />
            <KpiCard title="Won Deals" value={fmt(pipelineKpis.wonDeals)} sub={pipelineKpis.winRate} icon={CheckCircle2} />
            <KpiCard title="Pipeline Value" value={fmtCurrency(pipelineKpis.pipelineValue)} icon={DollarSign} />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Pipeline Funnel</CardTitle>
                <CardDescription>Contacts at each deal stage</CardDescription>
              </CardHeader>
              <CardContent>
                {pipelineFunnel.length > 0 ? (
                  <div className="space-y-2">
                    {pipelineFunnel.map((row) => (
                      <div key={row.stage} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">{row.label}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{
                              width: maxFunnelCount ? `${(row.count / maxFunnelCount) * 100}%` : "0%",
                              backgroundColor: row.fill,
                            }}
                          />
                        </div>
                        <span className="w-8 text-xs font-medium">{row.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">No pipeline data yet</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Lead Sources</CardTitle>
                <CardDescription>Where contacts are coming from</CardDescription>
              </CardHeader>
              <CardContent>
                {leadSources.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={leadSources} layout="vertical" margin={{ left: 8, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="source" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#2563eb" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">No source data yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="email" className="mt-4 space-y-5">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard title="Emails Sent" value={fmt(emailKpis.sent)} sub="last 90 days" icon={Send} />
            <KpiCard title="Open Rate" value={emailKpis.openRate} sub={`${fmt(emailKpis.opened)} opened`} icon={Mail} />
            <KpiCard title="Click Rate" value={emailKpis.clickRate} sub={`${fmt(emailKpis.clicked)} clicked`} icon={MousePointerClick} />
            <KpiCard title="Bounce Rate" value={emailKpis.bounceRate} sub={`${fmt(emailKpis.bounced)} bounced`} icon={AlertTriangle} />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
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
                      <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">No sends yet in the last 30 days</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Engagement Breakdown</CardTitle>
                <CardDescription>Last 90 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 pt-2">
                  {[
                    { label: "Delivered", value: emailKpis.sent, color: "#2563eb" },
                    { label: "Opened", value: emailKpis.opened, color: "#22c55e" },
                    { label: "Clicked", value: emailKpis.clicked, color: "#f59e0b" },
                    { label: "Bounced", value: emailKpis.bounced, color: "#ef4444" },
                    { label: "Complained", value: emailKpis.complained, color: "#f97316" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-xs text-muted-foreground">{row.label}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{
                            width: emailKpis.sent ? `${(row.value / emailKpis.sent) * 100}%` : "0%",
                            backgroundColor: row.color,
                          }}
                        />
                      </div>
                      <span className="w-12 text-right text-xs">{fmt(row.value)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

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
                        <th className="pb-2 pr-4 text-left font-medium">Campaign</th>
                        <th className="pb-2 pr-4 text-right font-medium">Sent</th>
                        <th className="pb-2 pr-4 text-right font-medium">Open %</th>
                        <th className="pb-2 pr-4 text-right font-medium">Click %</th>
                        <th className="pb-2 text-right font-medium">Bounced</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignPerf.map((campaign, index) => (
                        <tr key={index} className="border-b last:border-0">
                          <td className="max-w-[200px] py-2 pr-4 truncate">
                            <span title={campaign.name}>{campaign.name}</span>
                            <Badge variant="outline" className="ml-2 py-0 text-[10px]">
                              {campaign.status}
                            </Badge>
                          </td>
                          <td className="py-2 pr-4 text-right">{fmt(campaign.sent)}</td>
                          <td className="py-2 pr-4 text-right">{campaign.openRate}</td>
                          <td className="py-2 pr-4 text-right">{campaign.clickRate}</td>
                          <td className="py-2 text-right">{fmt(campaign.bounced)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="inquiries" className="mt-4 space-y-5">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
                    <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No inquiries yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
