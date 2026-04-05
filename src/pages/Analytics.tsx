import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Mail, TrendingUp, Share2, MousePointerClick, Eye } from "lucide-react";
import { format, subWeeks, startOfWeek, endOfWeek, isWithinInterval, startOfMonth } from "date-fns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function KpiCard({ label, value, sub, icon: Icon, trend }: {
  label: string; value: string | number; sub?: string; icon: any; trend?: { value: number; label: string };
}) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className="font-heading text-3xl font-bold text-foreground mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            {trend && (
              <p className={`text-xs font-medium mt-1 ${trend.value >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                {trend.value >= 0 ? "+" : ""}{trend.value} {trend.label}
              </p>
            )}
          </div>
          <div className="h-10 w-10 rounded-xl gradient-brand flex items-center justify-center shadow-glow shrink-0">
            <Icon className="h-5 w-5 text-primary-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Analytics Page ────────────────────────────────────────────────────────────

const INQUIRY_CATEGORY_COLORS: Record<string, string> = {
  appointment_scheduling: "#06b6d4",
  health_question: "#10b981",
  prescription_lab: "#8b5cf6",
  billing_insurance: "#f59e0b",
  urgent_flag: "#ef4444",
  general_info: "#6b7280",
};

const STATUS_COLORS = {
  pending: "#f59e0b",
  assigned: "#3b82f6",
  resolved: "#10b981",
  escalated: "#ef4444",
  auto_responded: "#8b5cf6",
};

export default function Analytics() {
  // ─── Queries ───────────────────────────────────────────────────────────────

  const { data: patients = [], isLoading: pLoading } = useQuery({
    queryKey: ["analytics-patients"],
    queryFn: async () => {
      const { data } = await supabase
        .from("patients").select("id, created_at, status").order("created_at");
      return data || [];
    },
  });

  const { data: campaigns = [], isLoading: cLoading } = useQuery({
    queryKey: ["analytics-campaigns"],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns").select("id, name, status, sent_count, recipient_count, stats, created_at")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: recipients = [], isLoading: rLoading } = useQuery({
    queryKey: ["analytics-recipients"],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaign_recipients")
        .select("campaign_id, status, opened_at, clicked_at");
      return data || [];
    },
  });

  const { data: inquiries = [], isLoading: iLoading } = useQuery({
    queryKey: ["analytics-inquiries"],
    queryFn: async () => {
      const { data } = await supabase.from("inquiries").select("id, status, category, created_at");
      return data || [];
    },
  });

  const { data: referrals = [], isLoading: refLoading } = useQuery({
    queryKey: ["analytics-referrals"],
    queryFn: async () => {
      const { data } = await supabase.from("referrals").select("id, status, created_at");
      return data || [];
    },
  });

  const isLoading = pLoading || cLoading || rLoading || iLoading || refLoading;

  // ─── Computed metrics ─────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const newThisMonth = patients.filter(p => new Date(p.created_at) >= monthStart).length;

    const sentCampaigns = campaigns.filter(c => (c.sent_count ?? 0) > 0);
    const totalSent = sentCampaigns.reduce((s, c) => s + (c.sent_count ?? 0), 0);

    // Open rate: from recipient records
    const sentRecs = recipients.filter(r => r.status !== "pending" && r.status !== "skipped");
    const openedRecs = recipients.filter(r => r.opened_at);
    const clickedRecs = recipients.filter(r => r.clicked_at);
    const openRate = pct(openedRecs.length, sentRecs.length);
    const clickRate = pct(clickedRecs.length, sentRecs.length);

    const converted = referrals.filter(r => r.status === "converted").length;
    const refConvRate = pct(converted, referrals.length);

    return { newThisMonth, totalSent, openRate, clickRate, refConvRate, converted };
  }, [patients, campaigns, recipients, referrals]);

  // Contacts growth — last 12 weeks
  const contactsGrowth = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const weekStart = startOfWeek(subWeeks(now, 11 - i));
      const weekEnd = endOfWeek(subWeeks(now, 11 - i));
      const count = patients.filter(p =>
        isWithinInterval(new Date(p.created_at), { start: weekStart, end: weekEnd })
      ).length;
      return { week: format(weekStart, "MMM d"), count };
    });
  }, [patients]);

  // Campaign performance — top 8 by sent count
  const campaignPerformance = useMemo(() => {
    const recMap: Record<string, { sent: number; opened: number; clicked: number }> = {};
    recipients.forEach(r => {
      if (!recMap[r.campaign_id]) recMap[r.campaign_id] = { sent: 0, opened: 0, clicked: 0 };
      if (r.status !== "pending" && r.status !== "skipped") recMap[r.campaign_id].sent++;
      if (r.opened_at) recMap[r.campaign_id].opened++;
      if (r.clicked_at) recMap[r.campaign_id].clicked++;
    });

    return campaigns
      .filter(c => (c.sent_count ?? 0) > 0 || (recMap[c.id]?.sent ?? 0) > 0)
      .slice(0, 8)
      .map(c => {
        const r = recMap[c.id] || { sent: 0, opened: 0, clicked: 0 };
        const sent = Math.max(r.sent, c.sent_count ?? 0);
        return {
          name: c.name.length > 28 ? c.name.slice(0, 28) + "…" : c.name,
          openRate: pct(r.opened, sent),
          clickRate: pct(r.clicked, sent),
          sent,
          status: c.status,
        };
      })
      .sort((a, b) => b.sent - a.sent);
  }, [campaigns, recipients]);

  // Inquiry breakdown by category
  const inquiryByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    inquiries.forEach(i => {
      const cat = i.category || "general_info";
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      value,
      key: name,
    })).sort((a, b) => b.value - a.value);
  }, [inquiries]);

  // Inquiry breakdown by status
  const inquiryByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    inquiries.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1; });
    return Object.entries(counts).map(([status, count]) => ({
      status: status.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase()),
      count,
      key: status,
    }));
  }, [inquiries]);

  // Contact status breakdown
  const contactsByStatus = useMemo(() => {
    const counts: Record<string, number> = { active: 0, inactive: 0, archived: 0 };
    patients.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return [
      { name: "Active Leads", value: counts.active, color: "#10b981" },
      { name: "Cold", value: counts.inactive, color: "#f59e0b" },
      { name: "Closed", value: counts.archived, color: "#6b7280" },
    ].filter(d => d.value > 0);
  }, [patients]);

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />Loading analytics…
      </div>
    );
  }

  // ─── Empty state ───────────────────────────────────────────────────────────

  const hasData = patients.length > 0 || campaigns.length > 0 || inquiries.length > 0;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] text-muted-foreground">
        <TrendingUp className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">No data yet</p>
        <p className="text-xs mt-1">Add contacts and send campaigns to see analytics here.</p>
      </div>
    );
  }

  // ─── Full page ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Performance metrics across your pipeline</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="Total Contacts" value={patients.length} sub="in pipeline" icon={Users}
          trend={{ value: kpis.newThisMonth, label: "this month" }} />
        <KpiCard label="Emails Sent" value={kpis.totalSent.toLocaleString()} sub="across campaigns" icon={Mail} />
        <KpiCard label="Open Rate" value={`${kpis.openRate}%`} sub="of delivered emails" icon={Eye} />
        <KpiCard label="Click Rate" value={`${kpis.clickRate}%`} sub="of delivered emails" icon={MousePointerClick} />
        <KpiCard label="Referrals" value={referrals.length} sub={`${kpis.converted} converted`} icon={Share2} />
        <KpiCard label="Inquiries" value={inquiries.length} sub={`${inquiries.filter(i => i.status === "resolved").length} resolved`} icon={TrendingUp} />
      </div>

      {/* Contacts Growth + Status split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="shadow-card lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Contacts Added — Last 12 Weeks</CardTitle>
          </CardHeader>
          <CardContent>
            {contactsGrowth.every(d => d.count === 0) ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-xs">No contacts added in this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={contactsGrowth} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }}
                    labelFormatter={l => `Week of ${l}`}
                    formatter={(v: any) => [v, "New Contacts"]}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Contacts by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {contactsByStatus.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-xs">No contacts yet</div>
            ) : (
              <div className="space-y-2">
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={contactsByStatus} cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                      dataKey="value" paddingAngle={3}>
                      {contactsByStatus.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }}
                      formatter={(v: any, n: any) => [v, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {contactsByStatus.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
                        {d.name}
                      </span>
                      <span className="font-medium text-foreground">{d.value} <span className="text-muted-foreground font-normal">({pct(d.value, patients.length)}%)</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Campaign Performance */}
      {campaignPerformance.length > 0 && (
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Campaign Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={campaignPerformance.length * 44 + 40}>
              <BarChart data={campaignPerformance} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={160} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  formatter={(v: any, name: string) => [`${v}%`, name === "openRate" ? "Open Rate" : "Click Rate"]}
                />
                <Legend formatter={n => n === "openRate" ? "Open Rate" : "Click Rate"} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="openRate" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={14} />
                <Bar dataKey="clickRate" fill="hsl(var(--primary)/0.4)" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Inquiries split row */}
      {inquiries.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Inquiries by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-4">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={inquiryByCategory} cx="50%" cy="50%" outerRadius={65} dataKey="value" paddingAngle={2}>
                      {inquiryByCategory.map((entry, i) => (
                        <Cell key={i} fill={INQUIRY_CATEGORY_COLORS[entry.key] || "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 11 }}
                      formatter={(v: any) => [v, "Inquiries"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5 pt-2">
                  {inquiryByCategory.map(d => (
                    <div key={d.key} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: INQUIRY_CATEGORY_COLORS[d.key] || "#94a3b8" }} />
                        <span className="truncate max-w-[130px]">{d.name}</span>
                      </span>
                      <span className="font-medium text-foreground shrink-0 ml-2">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Inquiries by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={inquiryByStatus} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="status" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }}
                    formatter={(v: any) => [v, "Inquiries"]} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {inquiryByStatus.map((entry, i) => (
                      <Cell key={i} fill={(STATUS_COLORS as any)[entry.key] || "hsl(var(--primary))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Referrals */}
      {referrals.length > 0 && (
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Referral Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Referrals", value: referrals.length, color: "text-foreground" },
                { label: "Converted", value: kpis.converted, color: "text-emerald-600" },
                { label: "Conversion Rate", value: `${kpis.refConvRate}%`, color: kpis.refConvRate > 20 ? "text-emerald-600" : "text-muted-foreground" },
              ].map(item => (
                <div key={item.label} className="text-center p-4 rounded-lg border bg-muted/20">
                  <p className={`font-heading text-2xl font-bold ${item.color}`}>{item.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
