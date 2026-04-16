import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { InquiryList, type InquiryRow } from "@/components/InquiryList";
import { InquiryDetail } from "@/components/InquiryDetail";
import { EmailMessageList, type EmailMessageRow } from "@/components/EmailMessageList";
import { EmailMessageDetail } from "@/components/EmailMessageDetail";
import {
  Inbox as InboxIcon,
  Sparkles,
  Mail,
  RefreshCw,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

const Inbox = () => {
  const queryClient = useQueryClient();
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [classifying, setClassifying] = useState(false);

  // Fetch email messages
  const { data: emails = [], isLoading: emailsLoading } = useQuery({
    queryKey: QK.emailMessages,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_messages")
        .select("*")
        .order("received_at", { ascending: false });
      if (error) throw error;
      return data as EmailMessageRow[];
    },
  });

  // Fetch inquiries (existing system)
  const { data: inquiries = [], isLoading: inquiriesLoading } = useQuery({
    queryKey: QK.inquiries,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inquiries")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as InquiryRow[];
    },
  });

  // Check if Gmail is connected
  const { data: settings } = useQuery({
    queryKey: QK.settings,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practice_settings")
        .select("google_gmail_token")
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const gmailConnected = !!settings?.google_gmail_token;

  const selectedEmail = emails.find((e) => e.id === selectedEmailId) ?? null;
  const selectedInquiry = inquiries.find((i) => i.id === selectedInquiryId) ?? null;

  const handleEmailUpdate = (id: string, updates: Partial<EmailMessageRow>) => {
    queryClient.setQueryData(QK.emailMessages, (old: EmailMessageRow[] | undefined) =>
      (old ?? []).map((e) => (e.id === id ? { ...e, ...updates } : e)),
    );
    queryClient.invalidateQueries({ queryKey: QK.emailMessages });
  };

  const handleInquiryUpdate = (id: string, updates: Partial<InquiryRow>) => {
    queryClient.setQueryData(QK.inquiries, (old: InquiryRow[] | undefined) =>
      (old ?? []).map((i) => (i.id === id ? { ...i, ...updates } : i)),
    );
    queryClient.invalidateQueries({ queryKey: QK.inquiries });
  };

  // Sync emails from Gmail
  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-email-inbox", {
        body: { provider: "gmail", max_results: 50 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Synced ${data.imported} email${data.imported === 1 ? "" : "s"}`);
      queryClient.invalidateQueries({ queryKey: QK.emailMessages });
      queryClient.invalidateQueries({ queryKey: QK.notifications });

      // Auto-classify after sync
      if (data.imported > 0) {
        await handleClassify();
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  // Classify unscored emails as leads
  const handleClassify = async () => {
    setClassifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("classify-email-leads", {
        body: { batch_size: 20 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data.classified > 0) {
        toast.success(
          data.newLeads > 0
            ? `${data.newLeads} new lead${data.newLeads === 1 ? "" : "s"} identified`
            : `${data.classified} email${data.classified === 1 ? "" : "s"} classified`,
        );
      }
      queryClient.invalidateQueries({ queryKey: QK.emailMessages });
      queryClient.invalidateQueries({ queryKey: QK.notifications });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Classification failed");
    } finally {
      setClassifying(false);
    }
  };

  // Computed KPIs
  const totalLeads = emails.filter((e) => e.is_lead).length;
  const unreadEmails = emails.filter((e) => !e.is_read).length;
  const pendingInquiries = inquiries.filter((i) => i.status === "pending").length;
  const unclassified = emails.filter((e) => e.lead_score == null).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Inbox</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Synced emails with AI lead detection · Manage inquiries
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unclassified > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClassify}
              disabled={classifying}
              className="gap-1.5"
            >
              {classifying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Classify ({unclassified})
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            onClick={handleSync}
            disabled={syncing || !gmailConnected}
            className="gap-1.5"
            title={gmailConnected ? "Sync latest emails" : "Connect Gmail in Settings first"}
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {syncing ? "Syncing…" : "Sync Email"}
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Leads", value: totalLeads, icon: Sparkles, color: "text-category-health", bg: "bg-category-health/10" },
          { label: "Unread", value: unreadEmails, icon: Mail, color: "text-primary", bg: "bg-primary/10" },
          { label: "Pending Inquiries", value: pendingInquiries, icon: InboxIcon, color: "text-amber-600", bg: "bg-amber-500/10" },
          { label: "Total Emails", value: emails.length, icon: MessageSquare, color: "text-muted-foreground", bg: "bg-muted" },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`rounded-lg p-2 ${m.bg}`}>
                <m.icon className={`h-4 w-4 ${m.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-lg font-bold font-heading">{m.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="leads" className="space-y-0">
        <TabsList>
          <TabsTrigger value="leads" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Leads
            {totalLeads > 0 && (
              <span className="ml-1 rounded-full bg-category-health/20 px-1.5 py-0.5 text-[10px] font-medium text-category-health">
                {totalLeads}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            All Email
          </TabsTrigger>
          <TabsTrigger value="inquiries" className="gap-1.5">
            <InboxIcon className="h-3.5 w-3.5" />
            Inquiries
            {pendingInquiries > 0 && (
              <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                {pendingInquiries}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Leads tab */}
        <TabsContent value="leads" className="mt-0">
          <div className="grid lg:grid-cols-5 gap-0 border rounded-xl overflow-hidden bg-card shadow-card min-h-[500px]">
            <div className="lg:col-span-2 border-r overflow-y-auto max-h-[600px]">
              {emailsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : emails.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-muted-foreground text-center">
                  <Mail className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">No emails synced yet</p>
                  <p className="text-xs mt-1">
                    {gmailConnected
                      ? 'Click "Sync Email" to pull your latest messages'
                      : "Connect Gmail in Settings > Integrations first"}
                  </p>
                </div>
              ) : (
                <EmailMessageList
                  emails={emails}
                  selectedId={selectedEmailId}
                  onSelect={setSelectedEmailId}
                  filter="leads"
                />
              )}
            </div>
            <div className="lg:col-span-3 overflow-y-auto max-h-[600px]">
              {selectedEmail ? (
                <EmailMessageDetail email={selectedEmail} onUpdate={handleEmailUpdate} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20">
                  <Sparkles className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">Select a lead to view details</p>
                  <p className="text-xs mt-1">AI identifies potential clients from your email</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* All Email tab */}
        <TabsContent value="all" className="mt-0">
          <div className="grid lg:grid-cols-5 gap-0 border rounded-xl overflow-hidden bg-card shadow-card min-h-[500px]">
            <div className="lg:col-span-2 border-r overflow-y-auto max-h-[600px]">
              {emailsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <EmailMessageList
                  emails={emails}
                  selectedId={selectedEmailId}
                  onSelect={setSelectedEmailId}
                  filter="all"
                />
              )}
            </div>
            <div className="lg:col-span-3 overflow-y-auto max-h-[600px]">
              {selectedEmail ? (
                <EmailMessageDetail email={selectedEmail} onUpdate={handleEmailUpdate} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20">
                  <Mail className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">Select an email to view</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Inquiries tab (existing functionality) */}
        <TabsContent value="inquiries" className="mt-0">
          <div className="grid lg:grid-cols-5 gap-0 border rounded-xl overflow-hidden bg-card shadow-card min-h-[500px]">
            <div className="lg:col-span-2 border-r overflow-y-auto max-h-[600px]">
              {inquiriesLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <InquiryList
                  inquiries={inquiries}
                  selectedId={selectedInquiryId}
                  onSelect={setSelectedInquiryId}
                />
              )}
            </div>
            <div className="lg:col-span-3 overflow-y-auto max-h-[600px]">
              {selectedInquiry ? (
                <InquiryDetail inquiry={selectedInquiry} onUpdate={handleInquiryUpdate} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20">
                  <InboxIcon className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">Select an inquiry to view details</p>
                  <p className="text-xs mt-1">AI automatically answers FAQ-matched inquiries</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Inbox;
