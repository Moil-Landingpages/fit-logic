"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import {
  Mail, Plus, Send, Clock, FileText, Eye, Pencil, Users, BarChart3,
  Search, Trash2, Copy, MousePointerClick, Sparkles, Layers
} from "lucide-react";
import { EmailPreview } from "@/components/EmailPreview";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { AICampaignCreator } from "@/components/AICampaignCreator";
import { AISequenceWizard } from "@/components/AISequenceWizard";
import { SequenceBuilder } from "@/components/SequenceBuilder";
import { CampaignRecipients, type Recipient } from "@/components/CampaignRecipients";
import { CampaignScheduleSettings, type ScheduleConfig } from "@/components/CampaignScheduleSettings";
import { CampaignDetail } from "@/components/CampaignDetail";
import {
  CAMPAIGN_STATUS_CONFIG, TEMPLATE_CATEGORY_CONFIG,
  type CampaignStatus,
} from "@/lib/types";

interface CampaignRow {
  id: string; name: string; status: string; campaign_type: string;
  template_id: string | null; segment_id: string | null;
  scheduled_at: string | null; sent_at: string | null; stats: any;
  created_at: string; updated_at: string;
  auto_schedule?: boolean; max_sends_per_day?: number;
  business_hours_start?: number; business_hours_end?: number;
  business_days?: string[]; recipient_count?: number; sent_count?: number;
}

interface SequenceStep {
  id: string; step_number: number; subject: string; body_html: string; delay_days: number;
}

interface TemplateRow {
  id: string; name: string; subject: string; preview_text: string | null;
  body_html: string | null; category: string; created_at: string; updated_at: string;
}

interface SegmentRow {
  id: string; name: string; description: string | null; rules: any;
  estimated_count: number; color: string | null;
}

const Campaigns_Page = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("campaigns");
  const [search, setSearch] = useState("");
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Partial<CampaignRow> | null>(null);
  const [sequenceSteps, setSequenceSteps] = useState<SequenceStep[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({
    auto_schedule: false, max_sends_per_day: 50,
    business_hours_start: 8, business_hours_end: 18,
    business_days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  });
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<TemplateRow> | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignRow | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateRow | null>(null);
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [showAICreator, setShowAICreator] = useState(false);
  const [showAIWizard, setShowAIWizard] = useState(false);

  const { data: campaigns = [] } = useQuery({
    queryKey: QK.campaigns,
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as CampaignRow[];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: QK.emailTemplates,
    queryFn: async () => {
      const { data, error } = await supabase.from("email_templates").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as TemplateRow[];
    },
  });

  const { data: segments = [] } = useQuery({
    queryKey: QK.segments,
    queryFn: async () => {
      const { data, error } = await supabase.from("segments").select("*").order("name");
      if (error) throw error;
      return data as SegmentRow[];
    },
  });

  const invalidateAll = (campaignId?: string) => {
    queryClient.invalidateQueries({ queryKey: QK.campaigns });
    queryClient.invalidateQueries({ queryKey: QK.emailTemplates });
    queryClient.invalidateQueries({ queryKey: QK.segments });
    if (campaignId) {
      queryClient.invalidateQueries({ queryKey: QK.campaignRecipients(campaignId) });
      queryClient.invalidateQueries({ queryKey: QK.campaignSequences(campaignId) });
    }
  };

  const saveCampaignMut = useMutation({
    mutationFn: async (c: Partial<CampaignRow>) => {
      const campaignType = c.campaign_type || "single";
      const campaignData: any = {
        name: c.name,
        template_id: campaignType === "single" ? c.template_id : null,
        segment_id: c.segment_id || null,
        scheduled_at: c.scheduled_at,
        campaign_type: campaignType,
        auto_schedule: scheduleConfig.auto_schedule,
        max_sends_per_day: scheduleConfig.max_sends_per_day,
        business_hours_start: scheduleConfig.business_hours_start,
        business_hours_end: scheduleConfig.business_hours_end,
        business_days: scheduleConfig.business_days,
        recipient_count: recipients.length,
      };

      let campaignId: string;

      if (c.id) {
        const { error } = await supabase.from("campaigns").update(campaignData).eq("id", c.id);
        if (error) throw error;
        campaignId = c.id;

        // For recipients: only delete pending ones (preserve sent/opened/clicked tracking)
        // Then re-insert the full list, skipping emails that already have non-pending status
        const { data: existingRecs } = await supabase
          .from("campaign_recipients").select("email, status").eq("campaign_id", c.id);
        const trackedEmails = new Set(
          (existingRecs || []).filter(r => r.status !== "pending").map(r => r.email.toLowerCase())
        );
        // Remove only pending recipients (safe to replace)
        await supabase.from("campaign_recipients")
          .delete().eq("campaign_id", c.id).eq("status", "pending");

        // Add recipients that aren't already tracked
        const newRecs = recipients.filter(r => !trackedEmails.has(r.email.toLowerCase()));
        if (newRecs.length > 0) {
          await supabase.from("campaign_recipients").insert(
            newRecs.map(r => ({
              campaign_id: campaignId, email: r.email, name: r.name,
              patient_id: r.patient_id || null, source: r.source,
            }))
          );
        }

        // Sequences: always replace (content edits)
        if (campaignType === "sequence") {
          await supabase.from("campaign_sequences").delete().eq("campaign_id", c.id);
        }
      } else {
        const { data: newCampaign, error } = await supabase.from("campaigns").insert({
          ...campaignData, status: "draft",
        }).select().single();
        if (error) throw error;
        campaignId = newCampaign.id;

        // Save recipients (new campaign — all are new)
        if (recipients.length > 0) {
          await supabase.from("campaign_recipients").insert(
            recipients.map(r => ({
              campaign_id: campaignId, email: r.email, name: r.name,
              patient_id: r.patient_id || null, source: r.source,
            }))
          );
        }
      }

      // Save sequence steps
      if (campaignType === "sequence" && sequenceSteps.length > 0) {
        const { error: seqErr } = await supabase.from("campaign_sequences").insert(
          sequenceSteps.map(s => ({
            campaign_id: campaignId, step_number: s.step_number,
            delay_days: s.delay_days, subject_override: s.subject,
            body_html_override: s.body_html,
          }))
        );
        if (seqErr) throw seqErr;
      }
    },
    onSuccess: () => {
      invalidateAll();
      closeBuilder();
      toast({ title: "Campaign saved" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteCampaignMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); setDeletingCampaignId(null); if (selectedCampaign) setSelectedCampaign(null); toast({ title: "Campaign deleted" }); },
  });

  const saveTemplateMut = useMutation({
    mutationFn: async (t: Partial<TemplateRow>) => {
      if (t.id) {
        const { error } = await supabase.from("email_templates").update({ name: t.name, subject: t.subject, preview_text: t.preview_text, body_html: t.body_html, category: t.category }).eq("id", t.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("email_templates").insert({ name: t.name!, subject: t.subject!, preview_text: t.preview_text, body_html: t.body_html, category: t.category || "welcome" });
        if (error) throw error;
      }
    },
    onSuccess: () => { invalidateAll(); setShowTemplateEditor(false); setEditingTemplate(null); toast({ title: "Template saved" }); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteTemplateMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("email_templates").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { invalidateAll(); setDeletingTemplateId(null); toast({ title: "Template deleted" }); },
  });

  const closeBuilder = () => {
    setShowBuilder(false);
    setEditingCampaign(null);
    setSequenceSteps([]);
    setRecipients([]);
    setScheduleConfig({ auto_schedule: false, max_sends_per_day: 50, business_hours_start: 8, business_hours_end: 18, business_days: ["Mon", "Tue", "Wed", "Thu", "Fri"] });
  };

  const openEditCampaign = async (c: CampaignRow) => {
    setEditingCampaign(c);
    setScheduleConfig({
      auto_schedule: c.auto_schedule || false,
      max_sends_per_day: c.max_sends_per_day || 50,
      business_hours_start: c.business_hours_start || 8,
      business_hours_end: c.business_hours_end || 18,
      business_days: c.business_days || ["Mon", "Tue", "Wed", "Thu", "Fri"],
    });
    // Load existing recipients
    const { data: recs } = await supabase.from("campaign_recipients").select("*").eq("campaign_id", c.id);
    if (recs) setRecipients(recs.map((r: any) => ({ email: r.email, name: r.name || "", patient_id: r.patient_id, source: r.source })));
    // Load existing sequences
    if (c.campaign_type === "sequence") {
      const { data: seqs } = await supabase.from("campaign_sequences").select("*").eq("campaign_id", c.id).order("step_number");
      if (seqs) setSequenceSteps(seqs.map((s: any) => ({ id: s.id, step_number: s.step_number, subject: s.subject_override || "", body_html: s.body_html_override || "", delay_days: s.delay_days })));
    }
    setShowBuilder(true);
    setSelectedCampaign(null);
  };

  const getTemplate = (id: string | null) => templates.find(t => t.id === id);
  const getSegment = (id: string | null) => segments.find(s => s.id === id);
  const filteredCampaigns = campaigns.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const filteredTemplates = templates.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase()));
  const totalSent = campaigns.reduce((sum, c) => sum + ((c.stats as any)?.sent || 0), 0);
  const totalOpened = campaigns.reduce((sum, c) => sum + ((c.stats as any)?.opened || 0), 0);
  const totalClicked = campaigns.reduce((sum, c) => sum + ((c.stats as any)?.clicked || 0), 0);
  const avgOpenRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
  const avgClickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0;

  const handleDuplicate = async (campaign: CampaignRow) => {
    const { data: newCampaign, error } = await supabase.from("campaigns").insert({
      name: `${campaign.name} (Copy)`,
      status: "draft",
      template_id: campaign.template_id,
      segment_id: campaign.segment_id,
      campaign_type: campaign.campaign_type,
      auto_schedule: campaign.auto_schedule,
      max_sends_per_day: campaign.max_sends_per_day,
      business_hours_start: campaign.business_hours_start,
      business_hours_end: campaign.business_hours_end,
      business_days: campaign.business_days,
    }).select().single();
    if (error || !newCampaign) { toast({ title: "Duplicate failed", variant: "destructive" }); return; }

    // Copy pending recipients (don't copy sent/opened — they're historical)
    const { data: existingRecs } = await supabase
      .from("campaign_recipients").select("email, name, patient_id, source")
      .eq("campaign_id", campaign.id).eq("status", "pending");
    if (existingRecs?.length) {
      await supabase.from("campaign_recipients").insert(
        existingRecs.map(r => ({ ...r, campaign_id: newCampaign.id }))
      );
    }

    // Copy sequence steps
    if (campaign.campaign_type === "sequence") {
      const { data: existingSeqs } = await supabase
        .from("campaign_sequences").select("step_number, delay_days, subject_override, body_html_override, template_id")
        .eq("campaign_id", campaign.id).order("step_number");
      if (existingSeqs?.length) {
        await supabase.from("campaign_sequences").insert(
          existingSeqs.map(s => ({ ...s, campaign_id: newCampaign.id }))
        );
      }
    }

    invalidateAll(newCampaign.id);
    toast({ title: "Campaign duplicated" });
  };

  const handleAIAccept = async (result: any) => {
    const { data: tpl } = await supabase.from("email_templates").insert({
      name: result.campaignName, subject: result.subject, preview_text: result.previewText, body_html: result.bodyHtml, category: result.category,
    }).select().single();
    if (!tpl) return;
    const matchSeg = segments.find(s => s.name.toLowerCase().includes(result.suggestedSegment.toLowerCase()));
    await supabase.from("campaigns").insert({
      name: result.campaignName, status: "draft", template_id: tpl.id, segment_id: matchSeg?.id || null,
    });
    invalidateAll();
    toast({ title: "AI campaign created!" });
  };

  const handleAIWizardAccept = async (result: any) => {
    const isSequence = result.emails?.length > 1;
    const matchSeg = segments.find(s => s.name.toLowerCase().includes(result.suggestedSegment.toLowerCase()));

    if (isSequence) {
      // Create campaign
      const { data: newCampaign, error } = await supabase.from("campaigns").insert({
        name: result.campaignName, status: "draft", campaign_type: "sequence",
        segment_id: matchSeg?.id || segments[0]?.id || null,
      }).select().single();
      if (error || !newCampaign) return;
      // Insert sequence steps
      await supabase.from("campaign_sequences").insert(
        result.emails.map((e: any) => ({
          campaign_id: newCampaign.id, step_number: e.step,
          delay_days: e.delayDays, subject_override: e.subject, body_html_override: e.bodyHtml,
        }))
      );
    } else {
      // Single email — create template + campaign
      const email = result.emails[0];
      const { data: tpl } = await supabase.from("email_templates").insert({
        name: result.campaignName, subject: email.subject, preview_text: email.previewText, body_html: email.bodyHtml, category: result.category,
      }).select().single();
      if (!tpl) return;
      await supabase.from("campaigns").insert({
        name: result.campaignName, status: "draft", template_id: tpl.id, segment_id: matchSeg?.id || null,
      });
    }
    invalidateAll();
    toast({ title: "AI campaign created!" });
  };

  /* Detail view */
  if (selectedCampaign) {
    return (
      <CampaignDetail
        campaign={selectedCampaign}
        onBack={() => setSelectedCampaign(null)}
        onEdit={openEditCampaign}
      />
    );
  }

  /* Main view */
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Email Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">Build, schedule, and track email campaigns with AI assistance</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { setEditingTemplate({ name: "", subject: "", preview_text: "", body_html: "", category: "welcome" }); setShowTemplateEditor(true); }}>
            <FileText className="h-3.5 w-3.5 mr-1" />New Template
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAICreator(true)}>
            <Sparkles className="h-3.5 w-3.5 mr-1" />AI Single Email
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAIWizard(true)} className="border-primary/30 text-primary hover:bg-primary/5">
            <Sparkles className="h-3.5 w-3.5 mr-1" />AI Sequence Wizard
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            setEditingCampaign({ name: "", status: "draft", campaign_type: "single", template_id: "", segment_id: "" });
            setSequenceSteps([]); setRecipients([]); setShowBuilder(true);
          }}>
            <Plus className="h-3.5 w-3.5 mr-1" />New Campaign
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            setEditingCampaign({ name: "", status: "draft", campaign_type: "sequence", segment_id: "" });
            setSequenceSteps([{ id: `step-1`, step_number: 1, subject: "", body_html: "", delay_days: 0 }]);
            setRecipients([]); setShowBuilder(true);
          }}>
            <Layers className="h-3.5 w-3.5 mr-1" />New Sequence
          </Button>
        </div>
      </div>

      {/* Explainer cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="p-3 flex items-start gap-3">
            <Mail className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">Campaign = Single Email</p>
              <p className="text-[11px] text-muted-foreground">One email to a list of contacts. Use a template, pick recipients, and send or schedule.</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="p-3 flex items-start gap-3">
            <Layers className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">Sequence = Multi-Email Drip</p>
              <p className="text-[11px] text-muted-foreground">A series of 2–5 emails sent automatically over days/weeks. Great for cold outreach and nurturing.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Campaigns", value: campaigns.length, icon: Mail },
          { label: "Emails Sent", value: totalSent.toLocaleString(), icon: Send },
          { label: "Avg Open Rate", value: `${avgOpenRate}%`, icon: Eye },
          { label: "Avg Click Rate", value: `${avgClickRate}%`, icon: MousePointerClick },
        ].map(s => (
          <Card key={s.label}><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-primary/10 p-2.5"><s.icon className="h-4 w-4 text-primary" /></div><div><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-lg font-bold font-heading">{s.value}</p></div></CardContent></Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <TabsList>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="segments">Segments</TabsTrigger>
          </TabsList>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search..." className="pl-8 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <TabsContent value="campaigns" className="mt-4 space-y-3">
          {filteredCampaigns.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No campaigns yet. Create one to get started.</CardContent></Card>
          ) : filteredCampaigns.map(campaign => {
            const tpl = getTemplate(campaign.template_id);
            const seg = getSegment(campaign.segment_id);
            const cfg = CAMPAIGN_STATUS_CONFIG[campaign.status as CampaignStatus] || CAMPAIGN_STATUS_CONFIG.draft;
            return (
              <Card key={campaign.id} className="hover:shadow-elevated transition-shadow cursor-pointer" onClick={() => setSelectedCampaign(campaign)}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className={`rounded-lg p-2.5 ${cfg.bgColor}`}><Mail className={`h-4 w-4 ${cfg.color}`} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-heading font-semibold text-foreground truncate">{campaign.name}</h3>
                      <Badge className={`${cfg.bgColor} ${cfg.color} border-0 text-[10px]`}>{cfg.label}</Badge>
                      {campaign.campaign_type === "sequence" && <Badge variant="outline" className="text-[10px]"><Layers className="h-2.5 w-2.5 mr-0.5" />Sequence</Badge>}
                      {campaign.auto_schedule && <Badge variant="outline" className="text-[10px] text-primary"><Clock className="h-2.5 w-2.5 mr-0.5" />Auto</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {campaign.campaign_type === "sequence" ? "Multi-email" : tpl?.name || "No template"} → {seg?.name || "No segment"}
                      {(campaign.recipient_count ?? 0) > 0 && ` • ${campaign.recipient_count} recipients`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(campaign.stats as any)?.sent && <div className="text-right shrink-0"><p className="text-sm font-bold font-heading">{(campaign.stats as any).sent}</p><p className="text-[10px] text-muted-foreground">sent</p></div>}
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCampaign(campaign)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDuplicate(campaign)}><Copy className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeletingCampaignId(campaign.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="templates" className="mt-4 space-y-3">
          {filteredTemplates.length === 0 && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium mb-3">No templates yet</p>
              <Button size="sm" onClick={() => { setEditingTemplate({ name: "", subject: "", preview_text: "", body_html: "", category: "welcome" }); setShowTemplateEditor(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1" />Create Template
              </Button>
            </CardContent></Card>
          )}
          {filteredTemplates.map(tpl => {
            const catCfg = TEMPLATE_CATEGORY_CONFIG[tpl.category];
            return (
              <Card key={tpl.id}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="rounded-lg bg-primary/10 p-2.5"><FileText className="h-4 w-4 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-heading font-semibold text-foreground truncate">{tpl.name}</h3>
                      {catCfg && <Badge variant="outline" className={`${catCfg.color} text-[10px]`}>{catCfg.label}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{tpl.subject}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewTemplate(tpl)}><Eye className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingTemplate(tpl); setShowTemplateEditor(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingTemplateId(tpl.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="segments" className="mt-4 space-y-3">
          {segments.map(seg => (
            <Card key={seg.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="rounded-lg bg-primary/10 p-2.5"><Users className="h-4 w-4 text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-heading font-semibold text-foreground">{seg.name}</h3>
                  <p className="text-xs text-muted-foreground">{seg.description}</p>
                </div>
                <div className="text-right"><p className="text-sm font-bold font-heading">{seg.estimated_count}</p><p className="text-[10px] text-muted-foreground">contacts</p></div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Campaign builder dialog */}
      <Dialog open={showBuilder} onOpenChange={v => { if (!v) closeBuilder(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col [&>button]:z-10">
          <DialogHeader>
            <DialogTitle>
              {editingCampaign?.id ? "Edit Campaign" : editingCampaign?.campaign_type === "sequence" ? "New Email Sequence" : "New Campaign"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-4 py-2 min-h-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Campaign Name</Label>
                  <Input value={editingCampaign?.name || ""} onChange={e => setEditingCampaign(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Spring Outreach Sequence" />
                </div>
                <div>
                  <Label className="text-sm">Type</Label>
                  <Select value={editingCampaign?.campaign_type || "single"} onValueChange={v => setEditingCampaign(p => ({ ...p, campaign_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single"><div className="flex items-center gap-1.5"><Mail className="h-3 w-3" />Single Email</div></SelectItem>
                      <SelectItem value="sequence"><div className="flex items-center gap-1.5"><Layers className="h-3 w-3" />Multi-Email Sequence</div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {editingCampaign?.campaign_type === "single" && (
                <div>
                  <Label className="text-sm">Template <span className="text-destructive">*</span></Label>
                  <Select value={editingCampaign?.template_id || ""} onValueChange={v => setEditingCampaign(p => ({ ...p, template_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                    <SelectContent>
                      {templates.length === 0
                        ? <div className="px-3 py-2 text-xs text-muted-foreground">No templates yet — close this and create one with "New Template"</div>
                        : templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)
                      }
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label className="text-sm">Segment (optional)</Label>
                <Select value={editingCampaign?.segment_id || "none"} onValueChange={v => setEditingCampaign(p => ({ ...p, segment_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select segment" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No segment</SelectItem>
                    {segments.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.estimated_count})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Recipients */}
              <CampaignRecipients recipients={recipients} onChange={setRecipients} campaignId={editingCampaign?.id} />

              <Separator />

              {/* Schedule */}
              <CampaignScheduleSettings config={scheduleConfig} onChange={setScheduleConfig} recipientCount={recipients.length} />

              {/* Sequence builder */}
              {editingCampaign?.campaign_type === "sequence" && (
                <>
                  <Separator />
                  <SequenceBuilder steps={sequenceSteps} onChange={setSequenceSteps} />
                </>
              )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeBuilder}>Cancel</Button>
            <Button className="gradient-brand text-primary-foreground" onClick={() => editingCampaign && saveCampaignMut.mutate(editingCampaign)} disabled={
              saveCampaignMut.isPending ||
              !editingCampaign?.name ||
              (editingCampaign?.campaign_type === "single" && !editingCampaign?.template_id) ||
              (editingCampaign?.campaign_type === "sequence" && sequenceSteps.length === 0)
            }>
              {saveCampaignMut.isPending ? "Saving..." : "Save Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template editor with live preview */}
      <Dialog open={showTemplateEditor} onOpenChange={v => { if (!v) { setShowTemplateEditor(false); setEditingTemplate(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>{editingTemplate?.id ? "Edit Template" : "New Template"}</DialogTitle></DialogHeader>
          <ScrollArea className="flex-1 pr-2">
            <div className="grid grid-cols-2 gap-4 mt-2">
              {/* Edit side */}
              <div className="space-y-3">
                <div><Label className="text-sm">Name</Label><Input value={editingTemplate?.name || ""} onChange={e => setEditingTemplate(p => ({ ...p, name: e.target.value }))} /></div>
                <div><Label className="text-sm">Category</Label>
                  <Select value={editingTemplate?.category || "welcome"} onValueChange={v => setEditingTemplate(p => ({ ...p, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(TEMPLATE_CATEGORY_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-sm">Subject Line</Label><Input value={editingTemplate?.subject || ""} onChange={e => setEditingTemplate(p => ({ ...p, subject: e.target.value }))} /></div>
                <div><Label className="text-sm">Preview Text</Label><Input value={editingTemplate?.preview_text || ""} onChange={e => setEditingTemplate(p => ({ ...p, preview_text: e.target.value }))} /></div>
                <div><Label className="text-sm">Body HTML</Label><Textarea value={editingTemplate?.body_html || ""} onChange={e => setEditingTemplate(p => ({ ...p, body_html: e.target.value }))} className="min-h-[250px] font-mono text-xs" /></div>
              </div>
              {/* Live preview side */}
              <div>
                <Label className="text-sm mb-2 block">Live Preview</Label>
                <EmailPreview
                  html={editingTemplate?.body_html || ""}
                  subject={editingTemplate?.subject || ""}
                  previewText={editingTemplate?.preview_text || ""}
                />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowTemplateEditor(false); setEditingTemplate(null); }}>Cancel</Button>
            <Button className="gradient-brand text-primary-foreground" onClick={() => editingTemplate && saveTemplateMut.mutate(editingTemplate)} disabled={saveTemplateMut.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template preview */}
      <Dialog open={!!previewTemplate} onOpenChange={v => !v && setPreviewTemplate(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{previewTemplate?.name}</DialogTitle></DialogHeader>
          <EmailPreview
            html={previewTemplate?.body_html || ""}
            subject={previewTemplate?.subject || ""}
            previewText={previewTemplate?.preview_text || ""}
          />
          <DialogFooter><Button variant="outline" onClick={() => setPreviewTemplate(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialogs */}
      <AlertDialog open={!!deletingCampaignId} onOpenChange={o => !o && setDeletingCampaignId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete campaign?</AlertDialogTitle><AlertDialogDescription>This will also remove all recipients and tracking data. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deletingCampaignId && deleteCampaignMut.mutate(deletingCampaignId)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!deletingTemplateId} onOpenChange={o => !o && setDeletingTemplateId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete template?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deletingTemplateId && deleteTemplateMut.mutate(deletingTemplateId)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      {/* AI Creators */}
      <AICampaignCreator
        open={showAICreator}
        onOpenChange={setShowAICreator}
        segments={segments.map(s => ({ id: s.id, name: s.name, description: s.description || "", rules: s.rules || [], estimatedCount: s.estimated_count, color: s.color || "primary" }))}
        onAccept={handleAIAccept}
      />
      <AISequenceWizard
        open={showAIWizard}
        onOpenChange={setShowAIWizard}
        segments={segments.map(s => ({ id: s.id, name: s.name, description: s.description || "", rules: s.rules || [], estimatedCount: s.estimated_count, color: s.color || "primary" }))}
        onAccept={handleAIWizardAccept}
      />
    </div>
  );
};

export default Campaigns_Page;
