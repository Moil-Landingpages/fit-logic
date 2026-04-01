import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Mail, TrendingUp, ArrowRight,
  Share2, DollarSign
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const Index = () => {
  const navigate = useNavigate();

  const { data: contacts = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => {
      const { data } = await supabase.from("patients").select("id, first_name, last_name, email, status, created_at").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data } = await supabase.from("campaigns").select("id, name, status, sent_count, recipient_count, stats, created_at").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ["referrals"],
    queryFn: async () => {
      const { data } = await supabase.from("referrals").select("id, status").order("created_at", { ascending: false });
      return data || [];
    },
  });

  // const { data: submissions = [] } = useQuery({
  //   queryKey: ["intake_submissions"],
  //   queryFn: async () => {
  //     const { data } = await supabase.from("intake_submissions").select("id, review_status, created_at").order("created_at", { ascending: false }).limit(50);
  //     return data || [];
  //   },
  // });

  // Metrics
  const activeContacts = contacts.filter(c => c.status === "active").length;
  const activeCampaigns = campaigns.filter(c => c.status === "active" || c.status === "scheduled").length;
  const totalSent = campaigns.reduce((s, c) => s + (c.sent_count || 0), 0);
  // const pendingLeads = submissions.filter(s => s.review_status === "pending").length;
  const convertedReferrals = referrals.filter(r => r.status === "converted").length;
  const recentContacts = contacts.slice(0, 5);
  const recentCampaigns = campaigns.slice(0, 4);

  const metrics = [
    { label: "Active Contacts", value: activeContacts, icon: Users, color: "text-emerald-600", bg: "bg-emerald-500/10", action: () => navigate("/contacts") },
    { label: "Live Campaigns", value: activeCampaigns, icon: Mail, color: "text-primary", bg: "bg-primary/10", action: () => navigate("/campaigns") },
    { label: "Emails Sent", value: totalSent, icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-500/10", action: () => navigate("/campaigns") },
    // { label: "Pending Leads", value: pendingLeads, icon: Target, color: "text-amber-600", bg: "bg-amber-500/10", action: () => navigate("/forms") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Sales Pipeline</h1>
        <p className="text-sm text-muted-foreground">Your sales engine at a glance</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <Card key={m.label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={m.action}>
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
            {recentContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No contacts yet</p>
            ) : (
              recentContacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-1.5 border-b last:border-0 border-border/50">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.first_name} {c.last_name}</p>
                    <p className="text-xs text-muted-foreground">{c.email || "No email"}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
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
                {recentCampaigns.map((c) => {
                  const stats = c.stats as Record<string, number> | null;
                  const openRate = stats?.opened && c.sent_count ? Math.round((stats.opened / c.sent_count) * 100) : 0;
                  return (
                    <div key={c.id} className="flex items-center gap-4 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate("/campaigns")}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{c.sent_count || 0} sent</span>
                          <span>{c.recipient_count || 0} recipients</span>
                          {openRate > 0 && <span className="text-emerald-600">{openRate}% opened</span>}
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${
                        c.status === "active" ? "border-emerald-200 text-emerald-700 bg-emerald-500/10" :
                        c.status === "scheduled" ? "border-blue-200 text-blue-700 bg-blue-500/10" :
                        c.status === "draft" ? "border-border text-muted-foreground" :
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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-heading">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "New Campaign", icon: Mail, path: "/campaigns", color: "text-primary" },
              { label: "Add Contact", icon: Users, path: "/contacts", color: "text-emerald-600" },
              // { label: "Lead Forms", icon: ClipboardList, path: "/forms", color: "text-amber-600" },
              { label: "Referrals", icon: Share2, path: "/referrals", color: "text-blue-600" },
            ].map((a) => (
              <Button key={a.label} variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate(a.path)}>
                <a.icon className={`h-5 w-5 ${a.color}`} />
                <span className="text-xs">{a.label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
