"use client";

import { useState } from "react";
import { Sparkles, Loader2, Check, ArrowRight, ArrowLeft, Mail, Layers, Users, Clock, Eye, Lightbulb, Pencil, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { EmailPreview } from "@/components/EmailPreview";
import type { Segment } from "@/lib/campaign-data";

interface GeneratedEmail {
  step: number;
  subject: string;
  previewText: string;
  bodyHtml: string;
  delayDays: number;
  tip: string;
}

interface AIWizardResult {
  campaignName: string;
  category: string;
  suggestedSegment: string;
  sendTimeRecommendation: string;
  rationale: string;
  emails: GeneratedEmail[];
}

interface AISequenceWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segments: Segment[];
  onAccept: (result: AIWizardResult) => void;
}

type WizardStep = "goal" | "details" | "generating" | "review";

const GOAL_EXAMPLES = [
  "Re-engage leads who signed up but never booked a call",
  "Welcome new customers and onboard them to our platform",
  "Promote our upcoming workshop to past attendees",
  "Cold outreach to prospects in the real estate industry",
  "Follow up with people who downloaded our free guide",
];

export function AISequenceWizard({ open, onOpenChange, segments, onAccept }: AISequenceWizardProps) {
  const [step, setStep] = useState<WizardStep>("goal");
  const [goal, setGoal] = useState("");
  const [emailCount, setEmailCount] = useState("3");
  const [tone, setTone] = useState("professional");
  const [additionalContext, setAdditionalContext] = useState("");
  const [result, setResult] = useState<AIWizardResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewEmail, setPreviewEmail] = useState<GeneratedEmail | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const handleGenerate = async () => {
    setStep("generating");
    setError(null);

    try {
      const res = await fetch("/api/generate-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Goal: ${goal}\n\nNumber of emails in sequence: ${emailCount}\nTone: ${tone}\n${additionalContext ? `Additional context: ${additionalContext}` : ""}`,
          segments: segments.map(s => ({ name: s.name, description: s.description, estimatedCount: s.estimatedCount })),
          mode: "sequence",
          emailCount: parseInt(emailCount),
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error ?? "Failed to generate");

      // 3-3-5-7-14 recommended cadence: day 0, +3, +3, +5, +7, +14 for subsequent steps
      const RECOMMENDED_DELAYS = [0, 3, 3, 5, 7, 14];

      if (data && !data.emails) {
        setResult({
          campaignName: data.campaignName,
          category: data.category,
          suggestedSegment: data.suggestedSegment,
          sendTimeRecommendation: data.sendTimeRecommendation,
          rationale: data.rationale,
          emails: [{
            step: 1, subject: data.subject, previewText: data.previewText,
            bodyHtml: data.bodyHtml, delayDays: 0, tip: "Opening email"
          }],
        });
      } else {
        const normalized = {
          ...(data as AIWizardResult),
          emails: (data as AIWizardResult).emails.map((e: GeneratedEmail, i: number) => ({
            ...e,
            delayDays: i === 0 ? 0 : (RECOMMENDED_DELAYS[i] ?? 14),
          })),
        };
        setResult(normalized);
      }
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
      setStep("details");
    }
  };

  const updateEmail = (idx: number, updates: Partial<GeneratedEmail>) => {
    if (!result) return;
    const newEmails = [...result.emails];
    newEmails[idx] = { ...newEmails[idx], ...updates };
    setResult({ ...result, emails: newEmails });
  };

  const handleAccept = () => {
    if (result) {
      onAccept(result);
      handleReset();
      onOpenChange(false);
    }
  };

  const handleReset = () => {
    setStep("goal");
    setGoal("");
    setEmailCount("3");
    setTone("professional");
    setAdditionalContext("");
    setResult(null);
    setError(null);
    setPreviewEmail(null);
    setEditingIdx(null);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={v => { if (!v) handleReset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Campaign Wizard
          </DialogTitle>
          <DialogDescription>
            {step === "goal" && "What's the goal of this campaign?"}
            {step === "details" && "Fine-tune the details"}
            {step === "generating" && "Building your campaign..."}
            {step === "review" && "Review, edit, and preview your emails before accepting"}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-2">
          {(["goal", "details", "review"] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`h-1.5 flex-1 rounded-full ${
                step === "generating" ? (i < 2 ? "bg-primary" : "bg-primary/30 animate-pulse") :
                (["goal", "details", "generating", "review"].indexOf(step) >= i ? "bg-primary" : "bg-muted")
              }`} />
            </div>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {step === "goal" && (
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-sm font-medium">Describe your campaign goal</Label>
                <Textarea
                  placeholder="e.g., Re-engage leads who haven't responded in 2 weeks with a value-driven cold email sequence..."
                  value={goal}
                  onChange={e => setGoal(e.target.value)}
                  className="min-h-[100px] resize-none mt-1.5"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Lightbulb className="h-3 w-3" /> Try one of these:
                </p>
                <div className="flex flex-wrap gap-2">
                  {GOAL_EXAMPLES.map(ex => (
                    <button key={ex} onClick={() => setGoal(ex)}
                      className="text-xs px-2.5 py-1.5 rounded-full border bg-muted/50 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors text-left">
                      {ex.length > 55 ? ex.slice(0, 55) + "…" : ex}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === "details" && (
            <div className="space-y-4 py-2">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Goal:</span> {goal}
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm">Number of Emails</Label>
                  <Select value={emailCount} onValueChange={setEmailCount}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 email (single send)</SelectItem>
                      <SelectItem value="2">2 emails (quick follow-up)</SelectItem>
                      <SelectItem value="3">3 emails (recommended)</SelectItem>
                      <SelectItem value="4">4 emails (thorough)</SelectItem>
                      <SelectItem value="5">5 emails (full sequence)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Tone</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="casual">Casual & Friendly</SelectItem>
                      <SelectItem value="urgent">Urgent & Direct</SelectItem>
                      <SelectItem value="educational">Educational</SelectItem>
                      <SelectItem value="witty">Witty & Bold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-sm">Additional Context (optional)</Label>
                <Textarea
                  placeholder="Specific offers, links, company details, target audience info..."
                  value={additionalContext}
                  onChange={e => setAdditionalContext(e.target.value)}
                  className="mt-1 min-h-[60px] resize-none"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
              )}
            </div>
          )}

          {step === "generating" && (
            <div className="py-16 text-center">
              <Loader2 className="h-10 w-10 mx-auto mb-4 text-primary animate-spin" />
              <p className="font-heading font-semibold text-foreground">Building your {emailCount}-email campaign...</p>
              <p className="text-xs text-muted-foreground mt-1">Researching best practices and crafting your sequence</p>
            </div>
          )}

          {step === "review" && result && (
            <div className="space-y-4 py-2">

              {/* ── Sequence Relation Map ── */}
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" /> Sequence Flow
                </p>
                <div className="overflow-x-auto pb-2">
                  <div className="flex items-stretch gap-0 min-w-max">
                    {/* Start node */}
                    <div className="flex flex-col items-center justify-center">
                      <div className="rounded-full bg-primary/10 border-2 border-primary/30 w-9 h-9 flex items-center justify-center shrink-0">
                        <Mail className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-[9px] text-muted-foreground mt-1 font-medium">START</span>
                    </div>

                    {result.emails.map((email, idx) => (
                      <div key={idx} className="flex items-stretch">
                        {/* Arrow + delay label */}
                        <div className="flex flex-col items-center justify-center w-14 shrink-0">
                          <div className="flex items-center w-full">
                            <div className="flex-1 h-px bg-border" />
                            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          </div>
                          <span className="text-[9px] text-primary font-semibold mt-0.5">
                            {idx === 0 ? "Day 0" : `+${email.delayDays}d`}
                          </span>
                        </div>

                        {/* Email node */}
                        <div className="flex flex-col items-center">
                          <div className={`rounded-xl border-2 ${
                            idx === 0
                              ? "border-primary/40 bg-primary/5"
                              : idx === result.emails.length - 1
                              ? "border-violet-400/40 bg-violet-500/10"
                              : "border-border bg-muted/30"
                          } px-3 py-2 w-36 shadow-sm`}>
                            <div className="flex items-center gap-1.5 mb-1">
                              <div className={`rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold shrink-0 ${
                                idx === 0 ? "bg-primary text-primary-foreground" :
                                idx === result.emails.length - 1 ? "bg-violet-500 text-violet-50" :
                                "bg-muted-foreground/20 text-muted-foreground"
                              }`}>{email.step}</div>
                              <span className="text-[9px] text-muted-foreground uppercase tracking-wide font-medium">
                                {idx === 0 ? "Intro" : idx === result.emails.length - 1 ? "Close" : `Follow-up`}
                              </span>
                            </div>
                            <p className="text-[10px] font-semibold text-foreground leading-tight line-clamp-2">
                              {email.subject}
                            </p>
                            {email.tip && (
                              <p className="text-[9px] text-muted-foreground mt-1 leading-tight line-clamp-1 italic">{email.tip}</p>
                            )}
                          </div>
                          <span className="text-[9px] text-muted-foreground mt-1">
                            {idx === 0 ? "Immediately" : `After ${email.delayDays} day${email.delayDays !== 1 ? "s" : ""}`}
                          </span>
                        </div>
                      </div>
                    ))}

                    {/* Arrow to end */}
                    <div className="flex flex-col items-center justify-center w-14 shrink-0">
                      <div className="flex items-center w-full">
                        <div className="flex-1 h-px bg-border" />
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      </div>
                    </div>

                    {/* End node */}
                    <div className="flex flex-col items-center justify-center">
                      <div className="rounded-full bg-emerald-500/10 border-2 border-emerald-300 w-9 h-9 flex items-center justify-center shrink-0">
                        <Check className="h-4 w-4 text-emerald-600" />
                      </div>
                      <span className="text-[9px] text-muted-foreground mt-1 font-medium">DONE</span>
                    </div>
                  </div>
                </div>

                {/* Total duration summary */}
                <div className="mt-3 pt-3 border-t space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {result.emails.length} email{result.emails.length !== 1 ? "s" : ""} · cadence: {result.emails.map((e, i) => i === 0 ? "Day 0" : `+${e.delayDays}d`).join(" → ")}
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      Total span: {result.emails.reduce((acc, e) => acc + e.delayDays, 0)} days
                    </span>
                  </div>
                </div>
              </div>

              {/* Campaign info - editable name */}
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <Input
                        value={result.campaignName}
                        onChange={e => setResult({ ...result, campaignName: e.target.value })}
                        className="font-heading font-semibold text-foreground border-0 bg-transparent px-0 h-auto text-base focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                      <Badge variant="outline" className="mt-1 text-[10px]">{result.category}</Badge>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className="bg-primary/10 text-primary border-0 text-[10px]">
                        <Sparkles className="h-3 w-3 mr-0.5" />AI Generated
                      </Badge>
                      <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-400/30 bg-emerald-500/10">
                        <ShieldCheck className="h-3 w-3 mr-0.5" />Deliverability optimized
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground italic">{result.rationale}</p>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />{result.suggestedSegment}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />{result.sendTimeRecommendation}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Separator />

              {/* Variable substitution info */}
              {result.emails.some(e => /\{(name|first_name|last_name|email|company)\}/i.test(e.bodyHtml + e.subject)) && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 flex items-start gap-2">
                  <Lightbulb className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Personalization detected</span> — variables like{" "}
                    <code className="bg-muted rounded px-1">{`{first_name}`}</code>,{" "}
                    <code className="bg-muted rounded px-1">{`{name}`}</code>,{" "}
                    <code className="bg-muted rounded px-1">{`{email}`}</code> will be replaced with each contact's data when the email is sent.
                  </p>
                </div>
              )}

              {/* Email list */}
              <div>
                <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-primary" />
                  {result.emails.length} Email{result.emails.length !== 1 ? "s" : ""} in Sequence
                  <span className="text-xs text-muted-foreground font-normal ml-2">Click to preview, pencil to edit</span>
                </h4>
                <div className="space-y-3">
                  {result.emails.map((email, idx) => {
                    const isEditing = editingIdx === idx;

                    return (
                      <Card key={idx} className={`transition-colors ${isEditing ? "border-primary/40" : ""}`}>
                        <CardContent className="p-0">
                          {/* Header */}
                          <div className="flex items-center gap-2 p-3">
                            <Badge variant="outline" className="text-[10px] font-mono shrink-0">Step {email.step}</Badge>
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${
                              idx === 0 ? "text-primary border-primary/30 bg-primary/5" : "text-muted-foreground"
                            }`}>
                              {idx === 0 ? "Day 0" : `+${email.delayDays}d`}
                            </Badge>
                            <span className="text-sm font-medium truncate flex-1">{email.subject}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm" className="h-6 px-2 text-[10px] gap-1"
                                onClick={() => setPreviewEmail(email)}
                                title="Preview email"
                              >
                                <Eye className="h-3 w-3" />Preview
                              </Button>
                              <Button
                                variant={isEditing ? "secondary" : "ghost"}
                                size="sm" className="h-6 w-6 p-0"
                                onClick={() => setEditingIdx(isEditing ? null : idx)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>

                          {/* Tip */}
                          {isEditing && email.tip && (
                            <p className="px-3 text-[10px] text-muted-foreground italic">💡 {email.tip}</p>
                          )}

                          {/* Edit mode */}
                          {isEditing && (
                            <div className="px-3 pb-3 space-y-2 border-t mt-2 pt-3">
                              <div>
                                <Label className="text-xs text-muted-foreground">Subject</Label>
                                <Input
                                  value={email.subject}
                                  onChange={e => updateEmail(idx, { subject: e.target.value })}
                                  className="mt-1 text-sm"
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Preview Text</Label>
                                <Input
                                  value={email.previewText}
                                  onChange={e => updateEmail(idx, { previewText: e.target.value })}
                                  className="mt-1 text-sm"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs text-muted-foreground">Delay (days)</Label>
                                  <Select
                                    value={String(email.delayDays)}
                                    onValueChange={v => updateEmail(idx, { delayDays: parseInt(v) })}
                                  >
                                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {[0, 1, 2, 3, 4, 5, 7, 10, 14].map(d => (
                                        <SelectItem key={d} value={String(d)}>{d === 0 ? "Immediately" : `${d} day${d > 1 ? "s" : ""}`}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Email Body (HTML)</Label>
                                <Textarea
                                  value={email.bodyHtml}
                                  onChange={e => updateEmail(idx, { bodyHtml: e.target.value })}
                                  className="mt-1 text-sm font-mono min-h-[150px]"
                                />
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-2">
          {step === "goal" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button className="gradient-brand text-primary-foreground" onClick={() => setStep("details")} disabled={!goal.trim()}>
                Next <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </>
          )}
          {step === "details" && (
            <>
              <Button variant="outline" onClick={() => setStep("goal")}><ArrowLeft className="h-3.5 w-3.5 mr-1" />Back</Button>
              <Button className="gradient-brand text-primary-foreground" onClick={handleGenerate}>
                <Sparkles className="h-4 w-4 mr-1.5" />Generate {emailCount} Email{parseInt(emailCount) !== 1 ? "s" : ""}
              </Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="outline" onClick={handleReset}>Start Over</Button>
              <Button variant="outline" onClick={() => setStep("details")}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />Regenerate
              </Button>
              <Button className="gradient-brand text-primary-foreground" onClick={handleAccept}>
                <Check className="h-4 w-4 mr-1.5" />Use This Campaign
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Full-screen email preview dialog */}
    <Dialog open={!!previewEmail} onOpenChange={v => !v && setPreviewEmail(null)}>
      <DialogContent className="max-w-3xl h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0 flex-row items-center justify-between space-y-0">
          <div className="min-w-0">
            <DialogTitle className="text-sm font-semibold truncate">
              {previewEmail?.subject || "Email Preview"}
            </DialogTitle>
            {previewEmail?.previewText && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{previewEmail.previewText}</p>
            )}
          </div>
          {previewEmail && (
            <Badge variant="outline" className="text-[10px] font-mono shrink-0 ml-3">
              Step {previewEmail.step}
            </Badge>
          )}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto flex justify-center bg-muted/10 p-6">
          <div className="bg-background rounded-lg shadow-md border w-full max-w-[620px]">
            {previewEmail && (() => {
              const wrapped = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;background:#fff}img{max-width:100%;height:auto}a{color:#2563eb}p{margin:0 0 12px}</style></head><body>${previewEmail.bodyHtml || '<p style="color:#999;text-align:center;padding:40px">No email content</p>'}</body></html>`;
              return (
                <iframe
                  srcDoc={wrapped}
                  className="w-full border-0 block rounded-lg"
                  style={{ minHeight: 500 }}
                  sandbox="allow-same-origin"
                  title="Email preview"
                  onLoad={(e) => {
                    const iframe = e.target as HTMLIFrameElement;
                    const resize = () => {
                      try {
                        const body = iframe.contentDocument?.body;
                        if (body) iframe.style.height = Math.max(500, body.scrollHeight + 32) + "px";
                      } catch { /* cross-origin guard */ }
                    };
                    resize();
                    setTimeout(resize, 150);
                    setTimeout(resize, 500);
                  }}
                />
              );
            })()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
