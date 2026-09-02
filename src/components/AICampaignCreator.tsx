"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Loader2, Check, Lightbulb, Clock, Users, ChevronDown, ChevronUp, ShieldCheck, Palette, ArrowLeft, ArrowRight, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EmailPreview } from "@/components/EmailPreview";
import { VerificationChecklist, type GenerationVerification } from "@/components/EmailDesignTools";
import type { NewsletterDesign } from "@/lib/newsletter-brand";
import { RichEmailEditor } from "@/components/RichEmailEditor";
import type { Segment } from "@/lib/campaign-data";

interface AICampaignResult {
  campaignName: string;
  subject: string;
  previewText: string;
  bodyHtml: string;
  category: "welcome" | "followup" | "promotional" | "educational" | "reactivation";
  suggestedSegment: string;
  sendTimeRecommendation: string;
  rationale: string;
  /** Newsletter path only. */
  kind?: "newsletter";
  title?: string;
  design?: NewsletterDesign;
  issueLabel?: string | null;
  verification?: GenerationVerification;
  /** The article the copy was grounded in — stored alongside the template so a
   *  reviewer can re-check a claim against its source later. */
  sourceMaterial?: string | null;
}

interface AICampaignCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segments: Segment[];
  onAccept: (result: AICampaignResult) => void;
}

const EXAMPLE_PROMPTS = [
  "Announce our next wellness retreat and invite past patients to register",
  "Introduce Fit Logic's BHRT program to new leads concerned about hormonal imbalance",
  "Send a follow-up to contacts who completed a gut health intake form",
  "Promote our supplement line to active patients with a limited-time offer",
  "Re-engage cold leads with an educational email on functional medicine benefits",
  "Invite corporate wellness contacts to explore our group membership plans",
];

type CreatorStep = "prompt" | "review" | "preview";

const DRAFT_STORAGE_KEY = "ai-campaign-creator-draft";

interface PersistedDraft {
  step: CreatorStep;
  prompt: string;
  result: AICampaignResult | null;
  sourceMaterial?: string;
  issueLabel?: string;
}

type EmailType = "cold_outreach" | "newsletter" | "educational" | "reengagement" | "promotional";

const EMAIL_TYPE_OPTIONS: { value: EmailType; label: string }[] = [
  { value: "cold_outreach", label: "Cold outreach" },
  { value: "newsletter",    label: "Newsletter" },
  { value: "educational",   label: "Educational" },
  { value: "reengagement",  label: "Re-engagement" },
  { value: "promotional",   label: "Promotional" },
];

interface PracticeLink {
  id: string;
  label: string;
  url: string;
  is_default: boolean;
}

export function AICampaignCreator({ open, onOpenChange, segments, onAccept }: AICampaignCreatorProps) {
  const [step, setStep] = useState<CreatorStep>("prompt");
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<AICampaignResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEditFields, setShowEditFields] = useState(true);

  // A2.5: email type + saved link picker. Both default-empty so the prompt
  // contract stays optional — older AI campaigns continue to work.
  const [emailType, setEmailType] = useState<EmailType>("cold_outreach");
  const [ctaUrl, setCtaUrl] = useState<string>("");

  // Newsletter inputs. Source material + strict grounding are the fix for the
  // wizard inventing months, statistics and medical claims that appeared
  // nowhere in the prompt or the article.
  const [sourceMaterial, setSourceMaterial] = useState("");
  const [strictGrounding, setStrictGrounding] = useState(true);
  const [issueLabel, setIssueLabel] = useState("");
  const [imageDirectives, setImageDirectives] = useState("");
  const [designNotes, setDesignNotes] = useState("");
  const [sectionCount, setSectionCount] = useState("2");
  const [includeHeroImage, setIncludeHeroImage] = useState(true);
  const [includeCtaButton, setIncludeCtaButton] = useState(true);
  const [design, setDesign] = useState<NewsletterDesign>({});
  const [verified, setVerified] = useState(false);

  const isNewsletter = emailType === "newsletter";

  const { data: links = [] } = useQuery({
    queryKey: ["practice_links"],
    queryFn: async (): Promise<PracticeLink[]> => {
      // Cast to bypass auto-generated supabase types — practice_links was
      // added in migration 20260429000002.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tbl = (supabase as any).from("practice_links");
      const { data, error: e } = await tbl
        .select("id, label, url, is_default")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      if (e) throw e;
      return (data ?? []) as PracticeLink[];
    },
  });

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as PersistedDraft;
      if (draft.prompt) setPrompt(draft.prompt);
      if (draft.result) setResult(draft.result);
      if (draft.step) setStep(draft.step);
      if (draft.sourceMaterial) setSourceMaterial(draft.sourceMaterial);
      if (draft.issueLabel) setIssueLabel(draft.issueLabel);
    } catch {
      // ignore malformed draft
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!prompt && !result) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }
    const draft: PersistedDraft = { step, prompt, result, sourceMaterial, issueLabel };
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore quota errors
    }
  }, [open, step, prompt, result, sourceMaterial, issueLabel]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    setResult(null);

    setStep("prompt");
    try {
      const res = await fetch("/api/generate-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          segments: segments.map((s) => ({ name: s.name, description: s.description, estimatedCount: s.estimatedCount })),
          // A2.5
          emailType,
          ctaUrl: ctaUrl || undefined,
          // Newsletter path — the route switches on mode/emailType rather than
          // on whichever category the model happens to pick, which is what made
          // two runs of the same prompt come back structurally different.
          ...(isNewsletter
            ? {
                mode: "newsletter",
                sourceMaterial: sourceMaterial.trim() || undefined,
                strictGrounding,
                issueLabel: issueLabel.trim() || undefined,
                imageDirectives: imageDirectives.trim() || undefined,
                designNotes: designNotes.trim() || undefined,
                sectionCount: parseInt(sectionCount, 10),
                includeHeroImage,
                includeCtaButton,
                design,
              }
            : { sourceMaterial: sourceMaterial.trim() || undefined, strictGrounding: strictGrounding && !!sourceMaterial.trim() }),
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error ?? "Failed to generate campaign");
      const generated = data as AICampaignResult;
      setResult(generated);
      if (generated.design) setDesign(generated.design);
      // A fresh generation always needs a fresh human review.
      setVerified(false);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate campaign");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAccept = () => {
    if (result) {
      onAccept({
        ...result,
        design,
        sourceMaterial: sourceMaterial.trim() || null,
        issueLabel: issueLabel.trim() || result.issueLabel || null,
        verification: result.verification,
      });
      handleReset();
      onOpenChange(false);
    }
  };

  const handleReset = () => {
    setStep("prompt");
    setPrompt("");
    setResult(null);
    setError(null);
    setShowEditFields(true);
    setSourceMaterial("");
    setIssueLabel("");
    setImageDirectives("");
    setDesignNotes("");
    setSectionCount("2");
    setIncludeHeroImage(true);
    setIncludeCtaButton(true);
    setDesign({});
    setVerified(false);
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Campaign Creator
          </DialogTitle>
          <DialogDescription>
            {step === "prompt" && "Describe your campaign goal and AI will generate everything."}
            {step === "review" && "Review and edit your campaign before previewing."}
            {step === "preview" && "Full preview — confirm before saving."}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-1">
          {(["prompt", "review", "preview"] as CreatorStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${
                step === s ? "bg-primary" :
                (["prompt", "review", "preview"].indexOf(step) > i) ? "bg-primary" : "bg-muted"
              }`} />
            </div>
          ))}
        </div>
        <div className="flex justify-between px-1">
          {["1. Describe", "2. Review", "3. Preview"].map((label, i) => (
            <span key={i} className="text-[10px] text-muted-foreground">{label}</span>
          ))}
        </div>

        <ScrollArea className="flex-1 pr-2 min-h-0">
          {/* ── Step 1: Prompt ── */}
          {step === "prompt" && (
            <div className="space-y-4 py-2">
              {/* A2.5: email type + saved-link picker — nudges the prompt
                  upstream so we don't depend on Megan remembering to write
                  "this is a newsletter" in the prompt. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Email type</Label>
                  <Select value={emailType} onValueChange={(v) => setEmailType(v as EmailType)} disabled={isGenerating}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMAIL_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">CTA link</Label>
                  <Select
                    value={ctaUrl}
                    onValueChange={(v) => setCtaUrl(v === "__none__" ? "" : v)}
                    disabled={isGenerating}
                  >
                    <SelectTrigger className="h-9 mt-1">
                      <SelectValue placeholder={links.length ? "Pick a saved link" : "No saved links yet"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No CTA link</SelectItem>
                      {links.map((l) => (
                        <SelectItem key={l.id} value={l.url}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Source material — the single biggest lever on accuracy.
                  With an article pasted here and strict mode on, the model may
                  not introduce a fact (or a month) that is not in it. */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Label className="text-xs font-medium">Source material (optional but recommended)</Label>
                    <p className="text-[10px] text-muted-foreground">
                      Paste the article, blog post or notes this email should be built from.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={strictGrounding}
                      onCheckedChange={setStrictGrounding}
                      disabled={isGenerating}
                      id="strict-grounding"
                    />
                    <Label htmlFor="strict-grounding" className="text-[10px] leading-tight cursor-pointer">
                      Only use<br />facts from source
                    </Label>
                  </div>
                </div>
                <Textarea
                  placeholder="Paste your source article here…"
                  value={sourceMaterial}
                  onChange={(e) => setSourceMaterial(e.target.value)}
                  className="min-h-[90px] resize-y text-xs"
                  disabled={isGenerating}
                />
                {strictGrounding && !sourceMaterial.trim() && (
                  <p className="text-[10px] text-amber-600">
                    Strict mode needs source material. Without it the AI writes educational framing only
                    and flags everything for your review.
                  </p>
                )}
              </div>

              {isNewsletter && (
                <div className="rounded-lg border p-3 space-y-3">
                  <p className="text-xs font-medium">Newsletter structure &amp; design</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Issue label</Label>
                      <Input
                        placeholder="e.g. Monthly Newsletter · Issue 01"
                        value={issueLabel}
                        onChange={(e) => setIssueLabel(e.target.value)}
                        className="h-9 mt-1 text-sm"
                        disabled={isGenerating}
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Leave blank and no month or issue number is invented.
                      </p>
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Main content sections</Label>
                      <Select value={sectionCount} onValueChange={setSectionCount} disabled={isGenerating}>
                        <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["1", "2", "3", "4"].map((n) => (
                            <SelectItem key={n} value={n}>{n} section{n === "1" ? "" : "s"}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Switch checked={includeHeroImage} onCheckedChange={setIncludeHeroImage} disabled={isGenerating} />
                      <span className="text-[11px]">Featured image above the article</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Switch checked={includeCtaButton} onCheckedChange={setIncludeCtaButton} disabled={isGenerating} />
                      <span className="text-[11px]">CTA button at the end</span>
                    </label>
                  </div>

                  <div>
                    <Label className="text-[11px] text-muted-foreground">Image directions</Label>
                    <Textarea
                      placeholder="e.g. A photo of a woman looking at her hair in a mirror; a calm clinic interior for the second section"
                      value={imageDirectives}
                      onChange={(e) => setImageDirectives(e.target.value)}
                      className="min-h-[52px] resize-y text-xs mt-1"
                      disabled={isGenerating}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Each becomes a labelled placeholder you click to replace with the real photo.
                    </p>
                  </div>

                  <div>
                    <Label className="text-[11px] text-muted-foreground">Design direction</Label>
                    <Textarea
                      placeholder="e.g. Clean, minimal wellness aesthetic; larger headline and smaller body text"
                      value={designNotes}
                      onChange={(e) => setDesignNotes(e.target.value)}
                      className="min-h-[44px] resize-y text-xs mt-1"
                      disabled={isGenerating}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Colors, fonts and sizes are set with the Design panel after generating — no regeneration needed.
                    </p>
                  </div>
                </div>
              )}

              <Textarea
                placeholder="Describe your campaign goal... e.g., 'Re-engage leads who haven't responded in 2 weeks with a special offer'"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[100px] resize-none"
                disabled={isGenerating}
              />
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Lightbulb className="h-3 w-3" /> Try one of these:
                </p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_PROMPTS.map((ep) => (
                    <button
                      key={ep}
                      onClick={() => setPrompt(ep)}
                      disabled={isGenerating}
                      className="text-xs px-2.5 py-1.5 rounded-full border bg-muted/50 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors text-left"
                    >
                      {ep.length > 60 ? ep.slice(0, 60) + "…" : ep}
                    </button>
                  ))}
                </div>
              </div>
              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Review + Edit ── */}
          {step === "review" && result && (
            <div className="space-y-4 py-2">
              {/* Campaign name + meta */}
              <div className="rounded-lg border bg-primary/5 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <Input
                      value={result.campaignName}
                      onChange={e => setResult({ ...result, campaignName: e.target.value })}
                      className="font-heading font-semibold border-0 bg-transparent px-0 h-auto text-base focus-visible:ring-0"
                    />
                    <Badge variant="outline" className="mt-1 text-[10px]">{result.category}</Badge>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                    <Badge className="bg-primary/10 text-primary border-0 text-[10px]">
                      <Sparkles className="h-3 w-3 mr-0.5" />AI Generated
                    </Badge>
                    {(result.category === "promotional" || result.category === "welcome") ? (
                      <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-200 bg-purple-50">
                        <Palette className="h-3 w-3 mr-0.5" />Branded HTML
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200 bg-emerald-50">
                        <ShieldCheck className="h-3 w-3 mr-0.5" />Deliverability optimized
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground italic">{result.rationale}</p>
              </div>

              {/* Strategy details */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-medium">Suggested Audience</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{result.suggestedSegment}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-medium">Best Send Time</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{result.sendTimeRecommendation}</p>
                </div>
              </div>

              <VerificationChecklist
                verification={result.verification}
                acknowledged={verified}
                onAcknowledgedChange={setVerified}
              />

              <Separator />

              {/* Collapsible edit fields */}
              <div className="rounded-lg border overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left bg-muted/30 hover:bg-muted/50 transition-colors"
                  onClick={() => setShowEditFields(!showEditFields)}
                >
                  <span className="text-sm font-medium text-foreground">Edit Subject, Preview Text & Body</span>
                  {showEditFields ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {showEditFields && (
                  <div className="p-3 space-y-3 border-t">
                    <div>
                      <Label className="text-xs text-muted-foreground">Subject Line</Label>
                      <Input value={result.subject} onChange={e => setResult({ ...result, subject: e.target.value })} className="mt-1 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Preview Text</Label>
                      <Input value={result.previewText} onChange={e => setResult({ ...result, previewText: e.target.value })} className="mt-1 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Email Body</Label>
                      <div className="mt-1">
                        <RichEmailEditor
                          value={result.bodyHtml}
                          onChange={(html) => setResult({ ...result, bodyHtml: html })}
                          subject={result.subject}
                          previewText={result.previewText}
                          placeholder="Edit your email content here. Use double Enter for paragraphs. Click 'Insert Variable' to personalize."
                          minHeight={280}
                          enableNewsletterTools
                          isNewsletter={result.kind === "newsletter"}
                          design={design}
                          onDesignChange={setDesign}
                          issueLabel={issueLabel || result.issueLabel}
                          newsletterTitle={result.title ?? result.campaignName}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Full Preview ── */}
          {step === "preview" && result && (
            <div className="space-y-4 py-2">
              {/* Subject bar */}
              <div className="rounded-lg border bg-muted/30 px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Subject</p>
                  <p className="text-sm font-semibold text-foreground">{result.subject}</p>
                  {result.previewText && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{result.previewText}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1 items-end shrink-0">
                  <Badge variant="outline" className="text-[10px]">{result.category}</Badge>
                  <Badge className="bg-primary/10 text-primary border-0 text-[10px]">
                    <Sparkles className="h-3 w-3 mr-0.5" />{result.campaignName}
                  </Badge>
                </div>
              </div>

              {/* Full email rendered preview */}
              <div className="rounded-lg border overflow-hidden bg-white">
                <div className="px-3 py-2 border-b bg-muted/20 flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Rendered Email Preview</span>
                </div>
                <EmailPreview
                  html={result.bodyHtml}
                  subject={result.subject}
                  previewText={result.previewText}
                />
              </div>

              {/* Confirm callout */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-3">
                <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-800">Looks good? Click "Save Campaign" to create it as a draft.</p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    {verified
                      ? "You can still go back and edit before saving."
                      : "Go back to Review and confirm the accuracy check before saving."}
                  </p>
                </div>
              </div>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="mt-2">
          {step === "prompt" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>Cancel</Button>
              <Button
                className="gradient-brand text-primary-foreground"
                onClick={handleGenerate}
                disabled={!prompt.trim() || isGenerating}
              >
                {isGenerating ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Generating…</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-1.5" />Generate Campaign</>
                )}
              </Button>
            </>
          )}
          {step === "review" && result && (
            <>
              <Button variant="outline" onClick={handleReset}>Start Over</Button>
              <Button variant="outline" onClick={() => setStep("preview")}>
                <Eye className="h-4 w-4 mr-1.5" />Preview Email
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </>
          )}
          {step === "preview" && result && (
            <>
              <Button variant="outline" onClick={() => setStep("review")}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />Back to Review
              </Button>
              <Button
                className="gradient-brand text-primary-foreground"
                onClick={handleAccept}
                disabled={!verified}
                title={verified ? undefined : "Confirm the accuracy check on the Review step first"}
              >
                <Check className="h-4 w-4 mr-1.5" />Save Campaign
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
