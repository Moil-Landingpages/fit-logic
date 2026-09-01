"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Palette, Send, History, Save, RotateCcw, Loader2, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_NEWSLETTER_DESIGN, type NewsletterDesign } from "@/lib/newsletter-brand";

/* ========================================================================== */
/* Design panel — the "Canva-style" controls the client asked for              */
/* ========================================================================== */

const FONT_OPTIONS = [
  { label: "System sans", value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  { label: "Georgia (serif)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Trebuchet", value: "'Trebuchet MS', Tahoma, sans-serif" },
  { label: "Courier (mono)", value: "'Courier New', Courier, monospace" },
];

const BG_PRESETS = [
  { label: "Light grey", value: "#f4f4f5" },
  { label: "White", value: "#ffffff" },
  { label: "Light blue", value: "#eef5fb" },
  { label: "Warm sand", value: "#faf6f0" },
  { label: "Mint", value: "#eef7f3" },
];

interface DesignPanelProps {
  design: NewsletterDesign;
  onChange: (next: NewsletterDesign) => void;
}

/** Color input paired with a hex field — <input type=color> alone is unlabelled. */
function ColorField({ label, value, fallback, onChange }: {
  label: string; value?: string; fallback: string; onChange: (v: string) => void;
}) {
  const current = value || fallback;
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(current) ? current : fallback}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-9 rounded border border-input bg-background p-0.5 cursor-pointer"
          aria-label={label}
        />
        <Input
          value={current}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs font-mono"
        />
      </div>
    </div>
  );
}

function NumberField({ label, value, fallback, min, max, step = 1, suffix, onChange }: {
  label: string; value?: number; fallback: number; min: number; max: number;
  step?: number; suffix?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}{suffix ? ` (${suffix})` : ""}</Label>
      <Input
        type="number"
        min={min} max={max} step={step}
        value={value ?? fallback}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="h-8 text-xs"
      />
    </div>
  );
}

export function DesignPanel({ design, onChange }: DesignPanelProps) {
  const d = DEFAULT_NEWSLETTER_DESIGN;
  const set = (patch: Partial<NewsletterDesign>) => onChange({ ...design, ...patch });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2 gap-1.5">
          <Palette className="h-4 w-4" />
          <span className="text-xs">Design</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] p-3 space-y-3 max-h-[70vh] overflow-y-auto">
        <div>
          <p className="text-xs font-semibold">Newsletter design</p>
          <p className="text-[10px] text-muted-foreground">
            Applies to the whole email — no regeneration needed.
          </p>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px]">Background preset</Label>
          <div className="flex flex-wrap gap-1.5">
            {BG_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => set({ bgColor: p.value })}
                title={p.label}
                className={`h-7 w-7 rounded border-2 transition-transform hover:scale-105 ${
                  (design.bgColor || d.bgColor).toLowerCase() === p.value ? "border-primary" : "border-input"
                }`}
                style={{ background: p.value }}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <ColorField label="Page background" value={design.bgColor} fallback={d.bgColor} onChange={(v) => set({ bgColor: v })} />
          <ColorField label="Card background" value={design.cardColor} fallback={d.cardColor} onChange={(v) => set({ cardColor: v })} />
          <ColorField label="Accent / buttons" value={design.accentColor} fallback={d.accentColor} onChange={(v) => set({ accentColor: v })} />
          <ColorField label="Body text" value={design.bodyColor} fallback={d.bodyColor} onChange={(v) => set({ bodyColor: v })} />
        </div>

        <div className="space-y-1">
          <Label className="text-[11px]">Heading font</Label>
          <Select value={design.headingFont || d.headingFont} onValueChange={(v) => set({ headingFont: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px]">Body font</Label>
          <Select value={design.bodyFont || d.bodyFont} onValueChange={(v) => set({ bodyFont: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Headline size" suffix="px" value={design.headingSize} fallback={d.headingSize} min={14} max={48} onChange={(v) => set({ headingSize: v })} />
          <NumberField label="Body size" suffix="px" value={design.bodySize} fallback={d.bodySize} min={11} max={24} onChange={(v) => set({ bodySize: v })} />
          <NumberField label="Line height" value={design.lineHeight} fallback={d.lineHeight} min={1.1} max={2.4} step={0.05} onChange={(v) => set({ lineHeight: v })} />
          <NumberField label="Section spacing" suffix="px" value={design.sectionSpacing} fallback={d.sectionSpacing} min={0} max={64} onChange={(v) => set({ sectionSpacing: v })} />
          <NumberField label="Content width" suffix="px" value={design.contentWidth} fallback={d.contentWidth} min={400} max={800} step={10} onChange={(v) => set({ contentWidth: v })} />
        </div>

        <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => onChange({})}>
          <RotateCcw className="h-3 w-3 mr-1.5" />Reset to brand defaults
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/* ========================================================================== */
/* Test send                                                                   */
/* ========================================================================== */

interface TestSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  html: string;
  previewText?: string | null;
  useNewsletterShell?: boolean;
  design?: NewsletterDesign | null;
  issueLabel?: string | null;
  title?: string | null;
}

export function TestSendDialog(props: TestSendDialogProps) {
  const { open, onOpenChange, subject, html, previewText, useNewsletterShell, design, issueLabel, title } = props;
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/send-test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to, subject, html, previewText, useNewsletterShell, design, issueLabel, title,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error ?? "Test send failed");
      toast({ title: "Test sent", description: `Check ${to} — sent via ${data.provider ?? "your provider"}.` });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Test send failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="h-4 w-4" />Send a test</DialogTitle>
          <DialogDescription className="text-xs">
            Sends one copy to the address below with sample merge values. Nothing is
            logged against the campaign and no recipient is enrolled.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">Send to</Label>
          <Input
            type="email"
            placeholder="you@fitlogic.com"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && to.includes("@")) send(); }}
            className="h-9 text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            Subject arrives prefixed with <code className="bg-muted px-1 rounded">[TEST]</code>.
            Always open a test on a phone before publishing.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={sending || !to.includes("@")}>
            {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            Send test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========================================================================== */
/* Version history — "save a version before major edits" + restore             */
/* ========================================================================== */

export interface VersionOwner {
  templateId?: string | null;
  sequenceId?: string | null;
}

interface TemplateVersion {
  id: string;
  label: string | null;
  subject: string | null;
  preview_text: string | null;
  body_html: string;
  design: NewsletterDesign | null;
  created_at: string;
}

interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: VersionOwner;
  /** Current editor state — what "Save version" snapshots. */
  current: { subject?: string | null; previewText?: string | null; html: string; design?: NewsletterDesign | null };
  /** Called when the user restores a version. */
  onRestore: (v: { html: string; subject?: string | null; previewText?: string | null; design?: NewsletterDesign | null }) => void;
}

export function VersionHistoryDialog({ open, onOpenChange, owner, current, onRestore }: VersionHistoryDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const ownerKey = owner.templateId ?? owner.sequenceId ?? "none";
  const queryKey = ["email_template_versions", ownerKey];

  const { data: versions = [], isLoading } = useQuery<TemplateVersion[]>({
    queryKey,
    enabled: open && ownerKey !== "none",
    queryFn: async () => {
      const col = owner.templateId ? "template_id" : "sequence_id";
      const val = owner.templateId ?? owner.sequenceId!;
      // Cast through any — email_template_versions postdates the generated types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("email_template_versions")
        .select("id, label, subject, preview_text, body_html, design, created_at")
        .eq(col, val)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as TemplateVersion[];
    },
  });

  const saveVersion = async () => {
    if (ownerKey === "none") return;
    setBusy(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("email_template_versions").insert({
        template_id: owner.templateId ?? null,
        sequence_id: owner.templateId ? null : owner.sequenceId ?? null,
        label: label.trim() || `Snapshot ${new Date().toLocaleString()}`,
        subject: current.subject ?? null,
        preview_text: current.previewText ?? null,
        body_html: current.html,
        design: current.design ?? {},
      });
      if (error) throw error;
      setLabel("");
      await qc.invalidateQueries({ queryKey });
      toast({ title: "Version saved", description: "You can restore this exact copy later." });
    } catch (e) {
      toast({ title: "Could not save version", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const deleteVersion = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("email_template_versions").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    await qc.invalidateQueries({ queryKey });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4" />Version history</DialogTitle>
          <DialogDescription className="text-xs">
            Save a snapshot before a big edit, then restore it if the change does not work out.
            This is separate from Undo, which only covers the current editing session.
          </DialogDescription>
        </DialogHeader>

        {ownerKey === "none" ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            Save this template or sequence step first — versions attach to a saved record.
          </p>
        ) : (
          <>
            <div className="flex gap-1.5">
              <Input
                placeholder="Label this version (optional)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="h-9 text-xs"
              />
              <Button size="sm" className="h-9 shrink-0" onClick={saveVersion} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Save version
              </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
              {isLoading && <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>}
              {!isLoading && versions.length === 0 && (
                <p className="text-xs text-muted-foreground py-6 text-center">No saved versions yet.</p>
              )}
              {versions.map((v) => (
                <div key={v.id} className="flex items-center gap-2 rounded-md border p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{v.label || "Untitled version"}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(v.created_at).toLocaleString()}
                      {v.subject ? ` · ${v.subject}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[9px] shrink-0">
                    {Math.max(1, Math.round(v.body_html.length / 1000))}k
                  </Badge>
                  <Button
                    variant="outline" size="sm" className="h-7 text-[11px] shrink-0"
                    onClick={() => {
                      onRestore({
                        html: v.body_html,
                        subject: v.subject,
                        previewText: v.preview_text,
                        design: v.design ?? undefined,
                      });
                      toast({ title: "Version restored", description: "Undo still works if this was not what you wanted." });
                      onOpenChange(false);
                    }}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />Restore
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0"
                    onClick={() => deleteVersion(v.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ========================================================================== */
/* Pre-send verification — patient-facing health content must be checked       */
/* ========================================================================== */

export interface GenerationVerification {
  groundedInSource: boolean;
  hadSourceMaterial: boolean;
  strictMode: boolean;
  factsUsed: string[];
  unverifiedClaims: string[];
}

/**
 * Surfaces exactly what the model asserted and what a human still has to
 * confirm. The client asked "what should always be manually verified before
 * publishing?" — this is that answer, rendered next to the draft instead of
 * living in a document nobody opens.
 */
export function VerificationChecklist({
  verification,
  acknowledged,
  onAcknowledgedChange,
}: {
  verification?: GenerationVerification | null;
  acknowledged: boolean;
  onAcknowledgedChange: (v: boolean) => void;
}) {
  const v = verification;
  const unverified = v?.unverifiedClaims ?? [];
  const facts = v?.factsUsed ?? [];

  const risk: "low" | "medium" | "high" = !v
    ? "medium"
    : v.strictMode && v.groundedInSource && unverified.length === 0
      ? "low"
      : !v.hadSourceMaterial
        ? "high"
        : "medium";

  const riskStyle = {
    low: "border-emerald-200 bg-emerald-50 text-emerald-900",
    medium: "border-amber-200 bg-amber-50 text-amber-900",
    high: "border-red-200 bg-red-50 text-red-900",
  }[risk];

  const riskLabel = {
    low: "Grounded in your source material",
    medium: "Review before sending",
    high: "No source material — verify every claim",
  }[risk];

  return (
    <div className={`rounded-lg border p-3 space-y-2.5 ${riskStyle}`}>
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold">Accuracy check · {riskLabel}</p>
      </div>

      <ul className="text-[11px] space-y-1 leading-relaxed">
        <li>
          <strong>Dates &amp; issue names:</strong>{" "}
          {v?.strictMode
            ? "The model was told never to invent a month, season or issue number."
            : "Confirm any month, season or issue number in the title actually came from you."}
        </li>
        <li>
          <strong>Statistics &amp; studies:</strong> confirm every number and citation below appears in your source.
        </li>
        <li>
          <strong>Medical claims:</strong> confirm nothing reads as a diagnosis, guarantee, or treatment promise.
        </li>
        <li>
          <strong>Links &amp; CTA:</strong> click every link in a test send before publishing.
        </li>
      </ul>

      {facts.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Facts the AI used</p>
          <ul className="list-disc pl-4 text-[11px] space-y-0.5 mt-1">
            {facts.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}

      {unverified.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Needs your confirmation</p>
          <ul className="list-disc pl-4 text-[11px] space-y-0.5 mt-1">
            {unverified.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      <label className="flex items-start gap-2 pt-1 cursor-pointer">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => onAcknowledgedChange(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 accent-current"
        />
        <span className="text-[11px] font-medium">
          I have reviewed the dates, statistics, medical claims and links in this draft.
        </span>
      </label>
    </div>
  );
}
