import { useState } from "react";
import { Sparkles, Loader2, Check, Lightbulb, Clock, Users, ChevronDown, ChevronUp, ShieldCheck, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmailPreview } from "@/components/EmailPreview";
import { supabase } from "@/integrations/supabase/client";
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
}

interface AICampaignCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segments: Segment[];
  onAccept: (result: AICampaignResult) => void;
}

const EXAMPLE_PROMPTS = [
  "Re-engage leads who haven't responded in 2 weeks with a value offer",
  "Welcome new customers with an intro to our services and a booking CTA",
  "Promote our upcoming workshop to past attendees",
  "Send a follow-up to contacts who completed a form this week",
];

export function AICampaignCreator({ open, onOpenChange, segments, onAccept }: AICampaignCreatorProps) {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<AICampaignResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEditFields, setShowEditFields] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-campaign", {
        body: {
          prompt: prompt.trim(),
          segments: segments.map((s) => ({ name: s.name, description: s.description, estimatedCount: s.estimatedCount })),
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      setResult(data as AICampaignResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate campaign");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAccept = () => {
    if (result) {
      onAccept(result);
      handleReset();
      onOpenChange(false);
    }
  };

  const handleReset = () => {
    setPrompt("");
    setResult(null);
    setError(null);
    setShowEditFields(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleReset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Campaign Creator
          </DialogTitle>
          <DialogDescription>
            Describe your campaign goal and AI will generate everything — then preview and edit before accepting.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2">
          {!result ? (
            <div className="space-y-4 py-2">
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
          ) : (
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

              {/* Email preview — always visible */}
              <EmailPreview
                html={result.bodyHtml}
                subject={result.subject}
                previewText={result.previewText}
              />

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
                      <Label className="text-xs text-muted-foreground">Email Body (HTML)</Label>
                      <Textarea
                        value={result.bodyHtml}
                        onChange={e => setResult({ ...result, bodyHtml: e.target.value })}
                        className="mt-1 text-sm font-mono min-h-[200px]"
                      />
                    </div>
                  </div>
                )}
              </div>

              <Separator />

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
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="mt-2">
          {!result ? (
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
          ) : (
            <>
              <Button variant="outline" onClick={handleReset}>Start Over</Button>
              <Button className="gradient-brand text-primary-foreground" onClick={handleAccept}>
                <Check className="h-4 w-4 mr-1.5" />Use This Campaign
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
