import { useState } from "react";
import {
  Settings as SettingsIcon, Users, Mail, Calendar, Globe, Bell,
  Plus, Trash2, Pencil, Check, X, Shield, ShieldCheck, ShieldAlert,
  Link, Unlink, Loader2, ChevronDown, Building2, Clock, Save,
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

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "admin" | "manager" | "staff";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "invited";
  avatar?: string;
}

const ROLE_CONFIG: Record<Role, { label: string; description: string; color: string; icon: React.ReactNode }> = {
  admin: {
    label: "Admin",
    description: "Full access — manage team, billing, integrations, and all data",
    color: "bg-destructive/10 text-destructive border-destructive/20",
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
  },
  manager: {
    label: "Manager",
    description: "Create and manage campaigns, contacts, and view reports",
    color: "bg-primary/10 text-primary border-primary/20",
    icon: <ShieldCheck className="h-3.5 w-3.5" />,
  },
  staff: {
    label: "Staff",
    description: "View contacts, respond to inbox messages, read-only campaigns",
    color: "bg-muted text-muted-foreground border-border",
    icon: <Shield className="h-3.5 w-3.5" />,
  },
};

function RoleBadge({ role }: { role: Role }) {
  const cfg = ROLE_CONFIG[role];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ─── Seed data (local state — replace with Supabase query when DB table exists) ──

const SEED_MEMBERS: TeamMember[] = [
  { id: "1", name: "You (Owner)", email: "admin@fitlogic.com", role: "admin", status: "active" },
];

// ─── Settings Page ─────────────────────────────────────────────────────────────

const Settings = () => {
  const [activeTab, setActiveTab] = useState("general");

  // ── General settings state ──
  const [practiceName, setPracticeName] = useState("FitLogic Practice");
  const [timezone, setTimezone] = useState("America/New_York");
  const [emailSignature, setEmailSignature] = useState("");
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);

  // ── Notification settings ──
  const [notifyNewInquiry, setNotifyNewInquiry] = useState(true);
  const [notifyEmailOpened, setNotifyEmailOpened] = useState(false);
  const [notifyDailySummary, setNotifyDailySummary] = useState(true);

  // ── Team state ──
  const [members, setMembers] = useState<TeamMember[]>(SEED_MEMBERS);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("staff");
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [removingMember, setRemovingMember] = useState<TeamMember | null>(null);

  // ── Integration state ──
  const [emailProvider, setEmailProvider] = useState<"none" | "gmail" | "outlook">("none");
  const [calendarProvider, setCalendarProvider] = useState<"none" | "google" | "outlook">("none");
  const [isConnecting, setIsConnecting] = useState<string | null>(null);

  const handleSaveGeneral = async () => {
    setIsSavingGeneral(true);
    await new Promise(r => setTimeout(r, 600));
    setIsSavingGeneral(false);
    toast.success("Settings saved");
  };

  const handleInvite = () => {
    if (!inviteEmail.includes("@") || !inviteName.trim()) return;
    const existing = members.find(m => m.email.toLowerCase() === inviteEmail.toLowerCase());
    if (existing) {
      toast.error("This email is already a team member");
      return;
    }
    const newMember: TeamMember = {
      id: Date.now().toString(),
      name: inviteName.trim(),
      email: inviteEmail.trim(),
      role: inviteRole,
      status: "invited",
    };
    setMembers(prev => [...prev, newMember]);
    toast.success(`Invite sent to ${inviteEmail}`);
    setShowInviteDialog(false);
    setInviteName("");
    setInviteEmail("");
    setInviteRole("staff");
  };

  const handleUpdateRole = (id: string, role: Role) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, role } : m));
    setEditingMember(null);
    toast.success("Role updated");
  };

  const handleRemoveMember = (id: string) => {
    setMembers(prev => prev.filter(m => m.id !== id));
    setRemovingMember(null);
    toast.success("Team member removed");
  };

  const handleConnect = async (service: string) => {
    setIsConnecting(service);
    await new Promise(r => setTimeout(r, 1200));
    setIsConnecting(null);
    if (service === "gmail") setEmailProvider("gmail");
    else if (service === "outlook-email") setEmailProvider("outlook");
    else if (service === "google-cal") setCalendarProvider("google");
    else if (service === "outlook-cal") setCalendarProvider("outlook");
    toast.success(`Connected to ${service.replace("-", " ")}`);
  };

  const handleDisconnect = (type: "email" | "calendar") => {
    if (type === "email") setEmailProvider("none");
    else setCalendarProvider("none");
    toast.success("Disconnected");
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your practice, team, and integrations</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="general" className="gap-1.5"><SettingsIcon className="h-3.5 w-3.5" />General</TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5"><Users className="h-3.5 w-3.5" />Team</TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5"><Link className="h-3.5 w-3.5" />Integrations</TabsTrigger>
        </TabsList>

        {/* ─── GENERAL ─────────────────────────────────────────────────────── */}
        <TabsContent value="general" className="space-y-4 mt-6">
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
                  <Input value={practiceName} onChange={e => setPracticeName(e.target.value)} className="mt-1" />
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
              <div>
                <Label className="text-xs text-muted-foreground">Email Signature</Label>
                <textarea
                  value={emailSignature}
                  onChange={e => setEmailSignature(e.target.value)}
                  placeholder="e.g., Best regards, The FitLogic Team"
                  className="mt-1 w-full min-h-[80px] text-sm rounded-md border bg-background px-3 py-2 resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { id: "inquiry", label: "New inquiry received", description: "Alert when a new message arrives in the inbox", value: notifyNewInquiry, onChange: setNotifyNewInquiry },
                { id: "opened", label: "Email opened", description: "Notify when a recipient opens a campaign email", value: notifyEmailOpened, onChange: setNotifyEmailOpened },
                { id: "summary", label: "Daily summary", description: "Receive a daily digest of pipeline activity", value: notifyDailySummary, onChange: setNotifyDailySummary },
              ].map(item => (
                <div key={item.id} className="flex items-start justify-between gap-4">
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
              {isSavingGeneral ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : <><Save className="h-4 w-4 mr-1.5" />Save Settings</>}
            </Button>
          </div>
        </TabsContent>

        {/* ─── TEAM ─────────────────────────────────────────────────────────── */}
        <TabsContent value="team" className="space-y-4 mt-6">
          {/* Permission tiers overview */}
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />Permission Tiers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(["admin", "manager", "staff"] as Role[]).map(role => {
                const cfg = ROLE_CONFIG[role];
                return (
                  <div key={role} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
                    <RoleBadge role={role} />
                    <p className="text-xs text-muted-foreground">{cfg.description}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Team members list */}
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />Team Members
                  <Badge variant="outline" className="text-[10px] ml-1">{members.length}</Badge>
                </CardTitle>
                <Button size="sm" className="gradient-brand text-primary-foreground h-8 text-xs" onClick={() => setShowInviteDialog(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Invite Member
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {members.map(member => (
                <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg border bg-background hover:bg-muted/20 transition-colors">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="gradient-brand text-primary-foreground text-xs font-heading">
                      {member.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
                      {member.status === "invited" && (
                        <Badge variant="outline" className="text-[9px] text-muted-foreground shrink-0">Pending</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <RoleBadge role={member.role} />
                    {member.id !== "1" && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingMember(member)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setRemovingMember(member)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── INTEGRATIONS ─────────────────────────────────────────────────── */}
        <TabsContent value="integrations" className="space-y-4 mt-6">

          {/* Email */}
          <Card className="shadow-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />Email Integration
              </CardTitle>
              <CardDescription className="text-xs">
                Connect your email account to send campaigns and track replies directly from FitLogic.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {emailProvider !== "none" ? (
                <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-200 bg-emerald-50">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Check className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Connected: {emailProvider === "gmail" ? "Gmail" : "Outlook"}
                      </p>
                      <p className="text-xs text-muted-foreground">Emails will be sent via your account</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => handleDisconnect("email")}>
                    <Unlink className="h-3.5 w-3.5 mr-1" />Disconnect
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "gmail", label: "Connect Gmail", logo: "G", color: "bg-red-50 border-red-200", logoColor: "text-red-500" },
                    { id: "outlook-email", label: "Connect Outlook", logo: "O", color: "bg-blue-50 border-blue-200", logoColor: "text-blue-500" },
                  ].map(provider => (
                    <button
                      key={provider.id}
                      onClick={() => handleConnect(provider.id)}
                      disabled={isConnecting === provider.id}
                      className={`flex items-center gap-3 p-4 rounded-lg border ${provider.color} hover:opacity-80 transition-opacity text-left`}
                    >
                      <div className={`h-9 w-9 rounded-full bg-white shadow-sm flex items-center justify-center font-bold text-lg ${provider.logoColor}`}>
                        {isConnecting === provider.id ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : provider.logo}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{provider.label}</p>
                        <p className="text-[10px] text-muted-foreground">OAuth 2.0 secure</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Calendar */}
          <Card className="shadow-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />Calendar Integration
              </CardTitle>
              <CardDescription className="text-xs">
                Sync your calendar to schedule campaigns around your availability and automatically avoid conflicts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {calendarProvider !== "none" ? (
                <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-200 bg-emerald-50">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Check className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Connected: {calendarProvider === "google" ? "Google Calendar" : "Outlook Calendar"}
                      </p>
                      <p className="text-xs text-muted-foreground">Campaign scheduling respects your calendar</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => handleDisconnect("calendar")}>
                    <Unlink className="h-3.5 w-3.5 mr-1" />Disconnect
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "google-cal", label: "Google Calendar", logo: "G", color: "bg-blue-50 border-blue-200", logoColor: "text-blue-500" },
                    { id: "outlook-cal", label: "Outlook Calendar", logo: "O", color: "bg-blue-50 border-blue-200", logoColor: "text-sky-500" },
                  ].map(provider => (
                    <button
                      key={provider.id}
                      onClick={() => handleConnect(provider.id)}
                      disabled={isConnecting === provider.id}
                      className={`flex items-center gap-3 p-4 rounded-lg border ${provider.color} hover:opacity-80 transition-opacity text-left`}
                    >
                      <div className={`h-9 w-9 rounded-full bg-white shadow-sm flex items-center justify-center font-bold text-lg ${provider.logoColor}`}>
                        {isConnecting === provider.id ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : provider.logo}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{provider.label}</p>
                        <p className="text-[10px] text-muted-foreground">OAuth 2.0 secure</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Coming soon */}
          <Card className="shadow-card border-dashed opacity-60">
            <CardContent className="py-4 flex items-center gap-3">
              <Globe className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">More integrations coming soon</p>
                <p className="text-xs text-muted-foreground">Zapier, Stripe, Twilio (SMS), and webhook support</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Invite dialog ───────────────────────────────────────────────────── */}
      <Dialog open={showInviteDialog} onOpenChange={v => { if (!v) { setShowInviteDialog(false); setInviteName(""); setInviteEmail(""); setInviteRole("staff"); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>Send an invite link to add someone to your workspace.</DialogDescription>
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
                        <span className="capitalize font-medium">{role}</span>
                        <span className="text-xs text-muted-foreground">— {ROLE_CONFIG[role].description.split("—")[0].trim()}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1.5">{ROLE_CONFIG[inviteRole].description}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>Cancel</Button>
            <Button className="gradient-brand text-primary-foreground" onClick={handleInvite} disabled={!inviteEmail.includes("@") || !inviteName.trim()}>
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit role dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!editingMember} onOpenChange={v => !v && setEditingMember(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>Update the role for {editingMember?.name}</DialogDescription>
          </DialogHeader>
          {editingMember && (
            <div className="space-y-3 py-2">
              {(["admin", "manager", "staff"] as Role[]).map(role => (
                <button
                  key={role}
                  onClick={() => handleUpdateRole(editingMember.id, role)}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors hover:bg-accent ${editingMember.role === role ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <RoleBadge role={role} />
                  <p className="text-xs text-muted-foreground mt-0.5">{ROLE_CONFIG[role].description}</p>
                  {editingMember.role === role && <Check className="h-4 w-4 text-primary ml-auto shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Remove member confirm ─────────────────────────────────────────────── */}
      <AlertDialog open={!!removingMember} onOpenChange={v => !v && setRemovingMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {removingMember?.name} from your workspace? They will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => removingMember && handleRemoveMember(removingMember.id)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Settings;
