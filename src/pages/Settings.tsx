import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Settings as SettingsIcon, Users, Mail, Calendar, Globe, Bell,
  Plus, Trash2, Pencil, Check, Shield, ShieldCheck, ShieldAlert,
  Link, Unlink, Loader2, Save, Building2, Eye, EyeOff,
  Info, CheckCircle2, AlertCircle, Copy, ExternalLink, Server,
  Activity, MousePointerClick,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

// ─── Constants ─────────────────────────────────────────────────────────────

const LS_KEY = "fitlogic_settings";

type Role = "admin" | "manager" | "staff";

const ROLE_CONFIG: Record<Role, { label: string; description: string; color: string; icon: React.ReactNode }> = {
  admin: {
    label: "Admin",
    description: "Full access — manage team, billing, integrations, and all data",
    color: "bg-destructive/10 text-destructive border-destructive/20",
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
  },
  manager: {
    label: "Manager",
    description: "Create and manage campaigns, contacts, sequences, and view all reports",
    color: "bg-primary/10 text-primary border-primary/20",
    icon: <ShieldCheck className="h-3.5 w-3.5" />,
  },
  staff: {
    label: "Staff",
    description: "View contacts, respond to inbox messages — read-only campaigns",
    color: "bg-muted text-muted-foreground border-border",
    icon: <Shield className="h-3.5 w-3.5" />,
  },
};

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_CONFIG[role as Role] || ROLE_CONFIG.staff;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ─── Settings Page ─────────────────────────────────────────────────────────

const Settings = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("general");

  // ─── General (localStorage) ───────────────────────────────────────────
  const [practiceName, setPracticeName] = useState("FitLogic Practice");
  const [timezone, setTimezone] = useState("America/New_York");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [notifyNewInquiry, setNotifyNewInquiry] = useState(true);
  const [notifyEmailOpened, setNotifyEmailOpened] = useState(false);
  const [notifyDailySummary, setNotifyDailySummary] = useState(true);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.practiceName) setPracticeName(saved.practiceName);
        if (saved.timezone) setTimezone(saved.timezone);
        if (saved.fromName !== undefined) setFromName(saved.fromName);
        if (saved.fromEmail !== undefined) setFromEmail(saved.fromEmail);
        if (saved.notifyNewInquiry !== undefined) setNotifyNewInquiry(saved.notifyNewInquiry);
        if (saved.notifyEmailOpened !== undefined) setNotifyEmailOpened(saved.notifyEmailOpened);
        if (saved.notifyDailySummary !== undefined) setNotifyDailySummary(saved.notifyDailySummary);
      }
    } catch { /* ignore malformed storage */ }
  }, []);

  const handleSaveGeneral = () => {
    setIsSavingGeneral(true);
    const payload = { practiceName, timezone, fromName, fromEmail, notifyNewInquiry, notifyEmailOpened, notifyDailySummary };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
    setTimeout(() => {
      setIsSavingGeneral(false);
      toast.success("Settings saved");
    }, 300);
  };

  // ─── Team (Supabase staff table) ───────────────────────────────────────
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("staff");
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [removingMember, setRemovingMember] = useState<any | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: staffMembers = [], isLoading: staffLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("*")
        .eq("active", true)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const addStaffMut = useMutation({
    mutationFn: async ({ name, email, role }: { name: string; email: string; role: string }) => {
      // Check for duplicate email
      const { data: existing } = await supabase
        .from("staff").select("id").eq("email", email.toLowerCase()).eq("active", true).maybeSingle();
      if (existing) throw new Error("A staff member with this email already exists.");
      const { error } = await supabase.from("staff").insert({ name, email: email.toLowerCase(), role, active: true });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Team member added");
      setShowInviteDialog(false);
      setInviteName("");
      setInviteEmail("");
      setInviteRole("staff");
    },
    onError: (e: any) => toast.error(e.message || "Failed to add member"),
  });

  const updateRoleMut = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const { error } = await supabase.from("staff").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Role updated");
      setEditingMember(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeStaffMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff").update({ active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Team member removed");
      setRemovingMember(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const copyInviteLink = async (member: any) => {
    const link = `${window.location.origin}/invite?email=${encodeURIComponent(member.email)}`;
    await navigator.clipboard.writeText(link);
    setCopiedId(member.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("Invite link copied to clipboard");
  };

  // ─── Integrations (SMTP config, localStorage) ─────────────────────────
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [smtpSaved, setSmtpSaved] = useState(false);
  const [isSavingSmtp, setIsSavingSmtp] = useState(false);
  const [smtpProvider, setSmtpProvider] = useState<"gmail" | "outlook" | "custom">("gmail");

  const LS_SMTP_KEY = "fitlogic_smtp";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_SMTP_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        setSmtpHost(s.host || "");
        setSmtpPort(s.port || "587");
        setSmtpUser(s.user || "");
        setSmtpPass(s.pass || "");
        setSmtpSecure(s.secure || false);
        setSmtpProvider(s.provider || "gmail");
        setSmtpSaved(true);
      }
    } catch { /* ignore */ }
  }, []);

  const SMTP_PRESETS = {
    gmail: { host: "smtp.gmail.com", port: "587", secure: false, hint: "Use a Gmail App Password (not your regular password). Enable 2FA on your Google account first, then create an App Password under Google Account → Security → App passwords." },
    outlook: { host: "smtp.office365.com", port: "587", secure: false, hint: "Use your Microsoft 365 email and password. If you have MFA enabled, create an App Password in your Microsoft account security settings." },
    custom: { host: "", port: "587", secure: false, hint: "Enter your SMTP server details. Contact your email provider if unsure." },
  };

  const applySmtpPreset = (provider: "gmail" | "outlook" | "custom") => {
    const p = SMTP_PRESETS[provider];
    setSmtpProvider(provider);
    setSmtpHost(p.host);
    setSmtpPort(p.port);
    setSmtpSecure(p.secure);
  };

  const handleSaveSmtp = () => {
    if (!smtpHost.trim() || !smtpUser.trim() || !smtpPass.trim()) {
      toast.error("Please fill in all SMTP fields");
      return;
    }
    setIsSavingSmtp(true);
    localStorage.setItem(LS_SMTP_KEY, JSON.stringify({
      host: smtpHost, port: smtpPort, user: smtpUser, pass: smtpPass, secure: smtpSecure, provider: smtpProvider,
    }));
    setTimeout(() => {
      setIsSavingSmtp(false);
      setSmtpSaved(true);
      toast.success("Email configuration saved");
    }, 300);
  };

  const handleDisconnectSmtp = () => {
    localStorage.removeItem(LS_SMTP_KEY);
    setSmtpHost(""); setSmtpPort("587"); setSmtpUser(""); setSmtpPass(""); setSmtpSaved(false);
    toast.success("Email configuration removed");
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your practice, team, and integrations</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="general" className="gap-1.5 text-xs">
            <SettingsIcon className="h-3.5 w-3.5" />General
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5" />Team
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5 text-xs">
            <Link className="h-3.5 w-3.5" />Integrations
          </TabsTrigger>
        </TabsList>

        {/* ─── GENERAL ───────────────────────────────────────────────────── */}
        <TabsContent value="general" className="space-y-4 mt-6">

          {/* Storage note */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/40 border text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Settings are saved to this browser. To share settings across team members, a backend settings table is required.
          </div>

          <Card className="shadow-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />Practice Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Practice Name</Label>
                  <Input value={practiceName} onChange={e => setPracticeName(e.target.value)} className="mt-1" placeholder="My Practice" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">Eastern (ET)</SelectItem>
                      <SelectItem value="America/Chicago">Central (CT)</SelectItem>
                      <SelectItem value="America/Denver">Mountain (MT)</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific (PT)</SelectItem>
                      <SelectItem value="America/Anchorage">Alaska (AKT)</SelectItem>
                      <SelectItem value="Pacific/Honolulu">Hawaii (HT)</SelectItem>
                      <SelectItem value="Europe/London">London (GMT)</SelectItem>
                      <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                      <SelectItem value="Australia/Sydney">Sydney (AEST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Default From Name</Label>
                  <Input value={fromName} onChange={e => setFromName(e.target.value)} className="mt-1" placeholder="Dr. Smith's Practice" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Default From Email</Label>
                  <Input value={fromEmail} onChange={e => setFromEmail(e.target.value)} className="mt-1" placeholder="hello@mypractice.com" type="email" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />Notifications
              </CardTitle>
              <CardDescription className="text-xs">Browser-level notification preferences for this account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "New inquiry received", description: "Alert when a new message arrives in the inbox", value: notifyNewInquiry, onChange: setNotifyNewInquiry },
                { label: "Email opened or clicked", description: "Notify when a recipient opens or clicks a campaign email", value: notifyEmailOpened, onChange: setNotifyEmailOpened },
                { label: "Daily activity summary", description: "Receive a daily digest of pipeline and campaign activity", value: notifyDailySummary, onChange: setNotifyDailySummary },
              ].map((item, i) => (
                <div key={i} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <Switch checked={item.value} onCheckedChange={item.onChange} />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button className="gradient-brand text-primary-foreground" onClick={handleSaveGeneral} disabled={isSavingGeneral}>
              {isSavingGeneral
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</>
                : <><Save className="h-4 w-4 mr-1.5" />Save Settings</>}
            </Button>
          </div>
        </TabsContent>

        {/* ─── TEAM ──────────────────────────────────────────────────────── */}
        <TabsContent value="team" className="space-y-4 mt-6">

          {/* Permission tiers */}
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />Permission Tiers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(["admin", "manager", "staff"] as Role[]).map(role => (
                <div key={role} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
                  <RoleBadge role={role} />
                  <p className="text-xs text-muted-foreground mt-0.5">{ROLE_CONFIG[role].description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Team members */}
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />Team Members
                    <Badge variant="outline" className="text-[10px] ml-1">{staffMembers.length}</Badge>
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Staff records are stored in your database. To grant login access, share the invite link so they can set up their account.
                  </CardDescription>
                </div>
                <Button size="sm" className="gradient-brand text-primary-foreground h-8 text-xs shrink-0" onClick={() => setShowInviteDialog(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Add Member
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {staffLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading team…
                </div>
              ) : staffMembers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Users className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">No team members yet</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowInviteDialog(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Add First Member
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {staffMembers.map((member: any) => (
                    <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg border bg-background hover:bg-muted/20 transition-colors">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="gradient-brand text-primary-foreground text-xs font-heading">
                          {member.name.split(" ").map((n: string) => n[0] || "").join("").toUpperCase().slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <RoleBadge role={member.role} />
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          title="Copy invite link"
                          onClick={() => copyInviteLink(member)}
                        >
                          {copiedId === member.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingMember(member)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setRemovingMember(member)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── INTEGRATIONS ────────────────────────────────────────────────── */}
        <TabsContent value="integrations" className="space-y-4 mt-6">

          {/* Email tracking — already works */}
          <Card className="shadow-card border-emerald-200 bg-emerald-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-600" />Email Tracking
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] ml-1">Active</Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Open and click tracking are live and recording data for all sent campaigns.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-emerald-200 bg-white">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-foreground">Open Tracking</p>
                    <p className="text-[10px] text-muted-foreground">1×1 pixel embedded in emails</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-emerald-200 bg-white">
                  <MousePointerClick className="h-4 w-4 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-foreground">Click Tracking</p>
                    <p className="text-[10px] text-muted-foreground">All campaign links are tracked</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Email sending — SMTP */}
          <Card className="shadow-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />Email Sending Account
                {smtpSaved && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] ml-1">Configured</Badge>}
              </CardTitle>
              <CardDescription className="text-xs">
                Configure an outgoing email account so FitLogic can send campaigns on your behalf. Uses standard SMTP — works with Gmail, Outlook, or any email provider.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {smtpSaved ? (
                /* Connected state */
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-200 bg-emerald-50">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Connected via SMTP</p>
                        <p className="text-xs text-muted-foreground">{smtpUser} · {smtpHost}:{smtpPort}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="text-xs text-destructive border-destructive/30 hover:bg-destructive/5" onClick={handleDisconnectSmtp}>
                      <Unlink className="h-3.5 w-3.5 mr-1" />Remove
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setSmtpSaved(false)}>
                    <Pencil className="h-3 w-3 mr-1" />Edit configuration
                  </Button>
                </div>
              ) : (
                /* Config form */
                <div className="space-y-4">
                  {/* Provider selector */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Email Provider</Label>
                    <div className="flex gap-2 mt-1.5">
                      {(["gmail", "outlook", "custom"] as const).map(p => (
                        <button
                          key={p}
                          onClick={() => applySmtpPreset(p)}
                          className={`flex-1 py-2 px-3 text-xs rounded-lg border transition-colors font-medium ${
                            smtpProvider === p ? "border-primary bg-primary/5 text-primary" : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
                          }`}
                        >
                          {p === "gmail" ? "Gmail" : p === "outlook" ? "Outlook" : "Custom SMTP"}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2 p-2.5 rounded-lg bg-muted/40 border leading-relaxed">
                      💡 {SMTP_PRESETS[smtpProvider].hint}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground">SMTP Host</Label>
                      <Input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} className="mt-1 text-sm" placeholder="smtp.gmail.com" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Port</Label>
                      <Select value={smtpPort} onValueChange={setSmtpPort}>
                        <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="587">587 (TLS)</SelectItem>
                          <SelectItem value="465">465 (SSL)</SelectItem>
                          <SelectItem value="25">25 (plain)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Username / Email</Label>
                      <Input value={smtpUser} onChange={e => setSmtpUser(e.target.value)} className="mt-1 text-sm" placeholder="you@gmail.com" type="email" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Password / App Password</Label>
                      <div className="relative mt-1">
                        <Input
                          value={smtpPass}
                          onChange={e => setSmtpPass(e.target.value)}
                          type={showSmtpPass ? "text" : "password"}
                          className="text-sm pr-9"
                          placeholder="••••••••••••"
                        />
                        <button
                          type="button"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowSmtpPass(v => !v)}
                        >
                          {showSmtpPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] text-muted-foreground">
                        Configuration is saved to this browser session. In production, store credentials in Supabase Vault.
                      </p>
                    </div>
                    <Button
                      className="gradient-brand text-primary-foreground shrink-0"
                      onClick={handleSaveSmtp}
                      disabled={isSavingSmtp || !smtpHost.trim() || !smtpUser.trim() || !smtpPass.trim()}
                    >
                      {isSavingSmtp ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : <><Save className="h-4 w-4 mr-1.5" />Save Config</>}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Calendar integration — honest setup guide */}
          <Card className="shadow-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />Calendar Integration
                <Badge variant="outline" className="text-[10px] text-muted-foreground ml-1">Setup Required</Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Sync with Google Calendar or Outlook to automatically schedule campaigns around your availability.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 rounded-lg border bg-muted/20 space-y-3">
                <p className="text-xs font-medium text-foreground">To enable calendar sync, complete these steps:</p>
                <ol className="space-y-2">
                  {[
                    { step: "1", title: "Create a Google Cloud project", detail: "Go to console.cloud.google.com → New Project → Enable the Google Calendar API" },
                    { step: "2", title: "Create OAuth 2.0 credentials", detail: "APIs & Services → Credentials → Create OAuth 2.0 Client ID → Add your app domain as an authorized redirect URI" },
                    { step: "3", title: "Add credentials to Supabase", detail: "In your Supabase project → Edge Function Secrets → add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET" },
                    { step: "4", title: "Deploy the calendar Edge Function", detail: "A calendar-oauth edge function is needed to handle the token exchange and store access tokens securely" },
                  ].map(item => (
                    <li key={item.step} className="flex gap-2.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0 mt-0.5">{item.step}</span>
                      <div>
                        <p className="text-xs font-medium text-foreground">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground">{item.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="text-xs gap-1.5" asChild>
                    <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />Google Cloud Console
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs gap-1.5" asChild>
                    <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />Azure Portal (Outlook)
                    </a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Unsubscribe compliance — already works */}
          <Card className="shadow-card border-emerald-200 bg-emerald-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-600" />Unsubscribe Compliance
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] ml-1">Active</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                One-click unsubscribe links are automatically appended to every campaign email. Unsubscribed addresses are tracked and excluded from future sends — CAN-SPAM compliant.
              </p>
            </CardContent>
          </Card>

        </TabsContent>
      </Tabs>

      {/* ─── Add Member Dialog ────────────────────────────────────────────── */}
      <Dialog open={showInviteDialog} onOpenChange={v => {
        if (!v) { setShowInviteDialog(false); setInviteName(""); setInviteEmail(""); setInviteRole("staff"); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Creates a staff record in the database. Share the invite link so they can set up their login account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">Full Name</Label>
              <Input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Jane Smith" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Email Address</Label>
              <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="jane@example.com" type="email" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Role</Label>
              <Select value={inviteRole} onValueChange={v => setInviteRole(v as Role)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["admin", "manager", "staff"] as Role[]).map(role => (
                    <SelectItem key={role} value={role}>
                      <div className="flex items-center gap-2">
                        <span className="capitalize font-medium">{ROLE_CONFIG[role].label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1.5 italic">{ROLE_CONFIG[inviteRole].description}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>Cancel</Button>
            <Button
              className="gradient-brand text-primary-foreground"
              onClick={() => addStaffMut.mutate({ name: inviteName.trim(), email: inviteEmail.trim(), role: inviteRole })}
              disabled={addStaffMut.isPending || !inviteEmail.includes("@") || !inviteName.trim()}
            >
              {addStaffMut.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Adding…</> : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Role Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!editingMember} onOpenChange={v => !v && setEditingMember(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>Updating role for {editingMember?.name}</DialogDescription>
          </DialogHeader>
          {editingMember && (
            <div className="space-y-2 py-2">
              {(["admin", "manager", "staff"] as Role[]).map(role => (
                <button
                  key={role}
                  onClick={() => updateRoleMut.mutate({ id: editingMember.id, role })}
                  disabled={updateRoleMut.isPending}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors hover:bg-accent ${
                    editingMember.role === role ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <RoleBadge role={role} />
                  <p className="text-xs text-muted-foreground mt-0.5 flex-1">{ROLE_CONFIG[role].description}</p>
                  {editingMember.role === role && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Remove Confirm ───────────────────────────────────────────────── */}
      <AlertDialog open={!!removingMember} onOpenChange={v => !v && setRemovingMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {removingMember?.name} ({removingMember?.email}) from the workspace? This deactivates their staff record but does not delete their login account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removingMember && removeStaffMut.mutate(removingMember.id)}
            >
              {removeStaffMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Settings;
