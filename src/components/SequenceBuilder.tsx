"use client";

import { useState, useRef } from "react";
import { Plus, Trash2, Clock, Mail, Eye, EyeOff, Sparkles, Loader2, Info, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmailPreview } from "@/components/EmailPreview";
import { RichEmailEditor, type EmailAttachment } from "@/components/RichEmailEditor";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

export interface SequenceStep {
  id: string;
  step_number: number;
  subject: string;
  body_html: string;
  delay_days: number;
  /** Per-step file attachments — round-tripped to campaign_sequences.attachments. */
  attachments?: EmailAttachment[];
}

interface SequenceBuilderProps {
  steps: SequenceStep[];
  onChange: (steps: SequenceStep[]) => void;
  /**
   * How delay_days is interpreted at send time. Default 'relative' preserves
   * the original behavior (days since previous step's send). Anchored modes
   * interpret delay_days as days before/after the recipient's anchor date
   * (currently sourced from the patient's next scheduled appointment).
   */
  anchorType?: "relative" | "before_appointment" | "after_appointment";
}

/**
 * Research-backed delay presets (sources: Woodpecker, Lemlist, HubSpot, Saleshandy).
 * Key principles:
 * - Never send back-to-back days (looks spammy)
 * - Increasing gaps signal respect for recipient's time
 * - 2-3 day initial follow-up catches momentum; longer gaps later avoid fatigue
 */
const RESEARCH_DELAY_OPTIONS: { value: number; label: string; description: string }[] = [
  { value: 2, label: "2 days", description: "Quick follow-up — keeps momentum" },
  { value: 3, label: "3 days", description: "Most common B2B follow-up spacing" },
  { value: 4, label: "4 days", description: "Balanced — not too eager, not forgotten" },
  { value: 5, label: "5 days", description: "Mid-sequence sweet spot" },
  { value: 7, label: "7 days", description: "One week — resets attention" },
  { value: 10, label: "10 days", description: "Late-sequence — avoids fatigue" },
  { value: 14, label: "14 days", description: "Final follow-up — respectful gap" },
];

/** Recommended delays per step position (0-indexed, step 2+) */
const RECOMMENDED_DELAYS: Record<number, number> = {
  1: 3,   // Step 2: 3 days after initial
  2: 5,   // Step 3: 5 days later
  3: 7,   // Step 4: 7 days later
  4: 14,  // Step 5: 14 days later (break-up)
};

const COLD_EMAIL_TIPS: Record<number, string> = {
  1: "Opening email — introduce yourself and value prop. Keep it under 100 words.",
  2: "Follow-up #1 — Reference the first email. Add social proof or a case study.",
  3: "Follow-up #2 — Different angle. Share a relevant insight or resource.",
  4: "Follow-up #3 — Create urgency or share a time-sensitive offer.",
  5: "Break-up email — Let them know this is your last follow-up. Often gets highest reply rates.",
};

export function SequenceBuilder({ steps, onChange, anchorType = "relative" }: SequenceBuilderProps) {
  const isAnchored = anchorType !== "relative";
  const anchorVerb = anchorType === "after_appointment" ? "after" : "before";
  const { toast } = useToast();
  const [expandedStep, setExpandedStep] = useState<string | null>(steps[0]?.id || null);
  const [previewStep, setPreviewStep] = useState<string | null>(null);
  const [improvingStep, setImprovingStep] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (id: string) => { dragId.current = id; };
  const handleDragOver  = (e: React.DragEvent, id: string) => { e.preventDefault(); setDragOverId(id); };
  const handleDragEnd   = () => { dragId.current = null; setDragOverId(null); };
  const handleDrop      = (targetId: string) => {
    if (!dragId.current || dragId.current === targetId) return;
    const from = steps.findIndex((s) => s.id === dragId.current);
    const to   = steps.findIndex((s) => s.id === targetId);
    if (from === -1 || to === -1) return;
    const reordered = [...steps];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    onChange(reordered.map((s, i) => ({ ...s, step_number: i + 1 })));
    dragId.current = null;
    setDragOverId(null);
  };

  const addStep = () => {
    const nextNum = steps.length + 1;
    // For anchored sequences, EVERY step has a meaningful offset (including
    // step 1 — "send 5 days before appointment"). For relative sequences,
    // step 1 fires immediately on enrollment so its delay_days is 0.
    const defaultDelay = isAnchored
      ? (RECOMMENDED_DELAYS[nextNum - 1] ?? 3)
      : (nextNum === 1 ? 0 : RECOMMENDED_DELAYS[nextNum - 1] ?? 7);
    const newStep: SequenceStep = {
      id: `step-${Date.now()}`,
      step_number: nextNum,
      subject: "",
      body_html: "",
      delay_days: defaultDelay,
    };
    onChange([...steps, newStep]);
    setExpandedStep(newStep.id);
  };

  const updateStep = (id: string, updates: Partial<SequenceStep>) => {
    onChange(steps.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const removeStep = (id: string) => {
    const filtered = steps.filter((s) => s.id !== id);
    onChange(filtered.map((s, i) => ({ ...s, step_number: i + 1 })));
    if (expandedStep === id) setExpandedStep(filtered[0]?.id || null);
    if (previewStep === id) setPreviewStep(null);
  };

  const handleAIImprove = async (step: SequenceStep) => {
    setImprovingStep(step.id);
    try {
      const res = await fetch("/api/generate-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Improve this email (step ${step.step_number} of ${steps.length} in a cold email sequence).\nCurrent subject: "${step.subject}"\nCurrent body: "${step.body_html}"\n\nMake it more compelling, personal, and action-oriented. Keep inline HTML styles. Keep it concise.\nReturn an improved version maintaining the same general intent but with better copy, stronger hooks, and clearer CTA.`,
          mode: "sequence",
          emailCount: 1,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error ?? "Failed");
      const improved = data.emails?.[0] || data;
      updateStep(step.id, {
        subject: improved.subject || step.subject,
        body_html: improved.bodyHtml || improved.body_html || step.body_html,
      });
      toast({ title: "Email improved with AI ✨" });
    } catch (e) {
      toast({ title: "AI Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setImprovingStep(null);
    }
  };

  const totalDays = steps.reduce((sum, s) => sum + s.delay_days, 0);
  const summary = isAnchored
    ? `${steps.length} email${steps.length !== 1 ? "s" : ""} anchored to appointment date`
    : `${steps.length} email${steps.length !== 1 ? "s" : ""} over ${totalDays} days`;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-heading font-semibold text-sm text-foreground">Email Sequence</h3>
            <p className="text-xs text-muted-foreground">{summary}</p>
          </div>
          {steps.length < 5 && (
            <Button size="sm" variant="outline" onClick={addStep}>
              <Plus className="h-3 w-3 mr-1" /> Add Step
            </Button>
          )}
        </div>

        {/* Research note */}
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/15">
          <Info className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Research-backed spacing:</span> Increasing delays between emails avoids spam perception and improves reply rates. 
            Studies show 3→5→7→14 day gaps outperform daily sends by 2-3x.
          </p>
        </div>

        {/* Timeline overview */}
        {steps.length > 0 && (
          <div className="flex items-center gap-1 px-1">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-center gap-1 flex-1">
                <button
                  onClick={() => { setExpandedStep(step.id); setPreviewStep(null); }}
                  className={`flex items-center justify-center h-7 w-7 rounded-full text-[10px] font-bold transition-colors shrink-0 ${
                    expandedStep === step.id
                      ? "bg-primary text-primary-foreground"
                      : step.subject
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {idx + 1}
                </button>
                {idx < steps.length - 1 && (
                  <div className="flex-1 flex items-center gap-0.5">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[9px] text-muted-foreground">{steps[idx + 1].delay_days}d</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {steps.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center">
              <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground mb-3">Build a multi-step email sequence</p>
              <Button size="sm" className="gradient-brand text-primary-foreground" onClick={addStep}>
                <Plus className="h-3 w-3 mr-1" /> Add First Email
              </Button>
            </CardContent>
          </Card>
        )}

        {steps.map((step, idx) => {
          const isExpanded = expandedStep === step.id;
          const isPreviewing = previewStep === step.id;
          const recommendedDelay = RECOMMENDED_DELAYS[idx];

          // In anchored mode every step (including step 1) has a meaningful
          // offset — the pill renders above all of them. In relative mode the
          // first step fires immediately so it has no preceding wait.
          const showPill = isAnchored || idx > 0;

          return (
            <div key={step.id}>
              {showPill && (() => {
                const isRecommended = !isAnchored && step.delay_days === recommendedDelay;
                const description = isAnchored
                  ? `${step.delay_days} day${step.delay_days === 1 ? "" : "s"} ${anchorVerb} the appointment`
                  : RESEARCH_DELAY_OPTIONS.find(o => o.value === step.delay_days)?.description ?? "Custom spacing";
                const pillLabel = isAnchored ? "Send" : "Wait";
                const pillSuffix = isAnchored ? `${anchorVerb} appt.` : null;
                return (
                  <div className="relative flex items-stretch py-1 pl-7 pr-4 group">
                    {/* Vertical connector spine */}
                    <div className="absolute left-7 top-0 bottom-0 w-px bg-gradient-to-b from-primary/40 via-primary/20 to-primary/40" aria-hidden />
                    {/* Tiny inline timer dot pinned to the spine */}
                    <div className="absolute left-7 top-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-background border border-primary/40 flex items-center justify-center shadow-sm">
                      <Clock className="h-2.5 w-2.5 text-primary" />
                    </div>
                    {/* Pill content */}
                    <div className="ml-6 flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 shadow-sm hover:border-primary/40 transition-colors">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{pillLabel}</span>
                      <Select
                        value={String(step.delay_days)}
                        onValueChange={(v) => updateStep(step.id, { delay_days: parseInt(v) })}
                      >
                        <SelectTrigger className="h-6 px-2 py-0 text-xs font-semibold border-0 bg-primary/10 text-primary hover:bg-primary/15 focus:ring-1 focus:ring-primary/30 gap-1 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-60">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="start">
                          {RESEARCH_DELAY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={String(opt.value)} className="text-xs">
                              <div className="flex items-center gap-2 w-full">
                                <span className="font-medium">{opt.label}</span>
                                {opt.value === recommendedDelay && (
                                  <span className="ml-auto text-[9px] font-semibold uppercase tracking-wide text-primary">
                                    ★ Recommended
                                  </span>
                                )}
                                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                                  {opt.description}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {pillSuffix && (
                        <span className="text-[10px] font-medium text-primary uppercase tracking-wide">{pillSuffix}</span>
                      )}
                      {isRecommended && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide text-primary px-1.5 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                          ★ Best
                        </span>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[10px] text-muted-foreground hidden md:inline truncate max-w-[200px] cursor-help border-l border-border/60 pl-2 ml-1">
                            {description}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                          {description}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                );
              })()}

              <Card
                draggable
                onDragStart={() => handleDragStart(step.id)}
                onDragOver={(e) => handleDragOver(e, step.id)}
                onDrop={() => handleDrop(step.id)}
                onDragEnd={handleDragEnd}
                className={`border-l-4 transition-all cursor-grab active:cursor-grabbing ${
                  isExpanded ? "border-l-primary" : "border-l-primary/20"
                } ${dragOverId === step.id ? "ring-2 ring-primary/40 scale-[1.01]" : ""}`}
              >
                <CardContent className="p-0">
                  <button
                    className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/30 transition-colors"
                    onClick={() => { setExpandedStep(isExpanded ? null : step.id); setPreviewStep(null); }}
                  >
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 cursor-grab" />
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">Step {step.step_number}</Badge>
                    <span className={`text-sm flex-1 truncate ${step.subject ? "font-medium text-foreground" : "text-muted-foreground italic"}`}>
                      {step.subject || "Untitled email"}
                    </span>
                    {step.body_html && <Badge variant="outline" className="text-[9px] text-primary shrink-0">Has content</Badge>}
                    {steps.length > 1 && (
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive shrink-0"
                        onClick={(e) => { e.stopPropagation(); removeStep(step.id); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-3 border-t">
                      {COLD_EMAIL_TIPS[step.step_number] && (
                        <p className="text-[10px] text-muted-foreground italic pt-2">💡 {COLD_EMAIL_TIPS[step.step_number]}</p>
                      )}
                      <div>
                        <Label className="text-xs text-muted-foreground">Subject Line</Label>
                        <Input value={step.subject} onChange={(e) => updateStep(step.id, { subject: e.target.value })}
                          placeholder={`Email ${step.step_number} subject...`} className="mt-1 text-sm" />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Email Body</Label>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]"
                            onClick={() => setPreviewStep(isPreviewing ? null : step.id)}>
                            {isPreviewing ? <EyeOff className="h-3 w-3 mr-0.5" /> : <Eye className="h-3 w-3 mr-0.5" />}
                            {isPreviewing ? "Edit" : "Preview"}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]"
                            onClick={() => handleAIImprove(step)} disabled={improvingStep === step.id || !step.body_html}>
                            {improvingStep === step.id ? <Loader2 className="h-3 w-3 mr-0.5 animate-spin" /> : <Sparkles className="h-3 w-3 mr-0.5" />}
                            AI Improve
                          </Button>
                        </div>
                      </div>
                      {isPreviewing ? (
                        <EmailPreview html={step.body_html} subject={step.subject} />
                      ) : (
                        <div className="space-y-3">
                          <RichEmailEditor
                            value={step.body_html}
                            onChange={(html) => updateStep(step.id, { body_html: html })}
                            subject={step.subject}
                            placeholder="Write your email here. Use double Enter for new paragraphs. Click 'Insert Variable' to personalize."
                            minHeight={180}
                            attachments={step.attachments ?? []}
                            onAttachmentsChange={(next) => updateStep(step.id, { attachments: next })}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })}

        {steps.length > 0 && steps.length < 5 && (
          <Button variant="outline" size="sm" className="w-full" onClick={addStep}>
            <Plus className="h-3 w-3 mr-1" /> Add Another Email
          </Button>
        )}
      </div>
    </TooltipProvider>
  );
}
