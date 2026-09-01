"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Palette, Upload, Plus, X, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  brandKitFromSettings,
  renderNewsletterShell,
  type SocialLink,
} from "@/lib/newsletter-brand";

/**
 * Brand kit — the fixed half of every newsletter.
 *
 * These values are stamped into the header and footer of every newsletter send
 * (and every test send), so a monthly issue only ever has to supply the
 * variable content: topic, hero image, article, takeaways, CTA.
 */

const FONT_OPTIONS = [
  { label: "System sans", value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  { label: "Georgia (serif)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Trebuchet", value: "'Trebuchet MS', Tahoma, sans-serif" },
];

type BrandForm = {
  brand_logo_url: string;
  brand_primary_color: string;
  brand_accent_color: string;
  brand_bg_color: string;
  brand_body_color: string;
  brand_heading_font: string;
  brand_body_font: string;
  brand_heading_size: number;
  brand_body_size: number;
  clinic_address: string;
  clinic_phone: string;
  website_url: string;
  social_links: SocialLink[];
  medical_disclaimer: string;
  newsletter_footer_note: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Module scope, not inline: an inline component remounts on every keystroke
 *  and the hex field loses focus mid-edit. */
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-1.5">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 rounded border border-input bg-background p-0.5 cursor-pointer"
          aria-label={label}
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 text-xs font-mono" />
      </div>
    </div>
  );
}

export function BrandKitTab({
  settings,
  onSave,
  saving,
}: {
  settings: any;
  onSave: (updates: Record<string, unknown>) => void;
  saving?: boolean;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState<BrandForm>(() => ({
    brand_logo_url: settings?.brand_logo_url ?? "",
    brand_primary_color: settings?.brand_primary_color ?? "#0e9aa7",
    brand_accent_color: settings?.brand_accent_color ?? "#0e9aa7",
    brand_bg_color: settings?.brand_bg_color ?? "#f4f4f5",
    brand_body_color: settings?.brand_body_color ?? "#111827",
    brand_heading_font: settings?.brand_heading_font ?? FONT_OPTIONS[1].value,
    brand_body_font: settings?.brand_body_font ?? FONT_OPTIONS[0].value,
    brand_heading_size: settings?.brand_heading_size ?? 26,
    brand_body_size: settings?.brand_body_size ?? 15,
    clinic_address: settings?.clinic_address ?? "",
    clinic_phone: settings?.clinic_phone ?? "",
    website_url: settings?.website_url ?? "",
    social_links: Array.isArray(settings?.social_links) ? settings.social_links : [],
    medical_disclaimer: settings?.medical_disclaimer ?? "",
    newsletter_footer_note: settings?.newsletter_footer_note ?? "",
  }));

  const set = <K extends keyof BrandForm>(key: K, value: BrandForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const uploadLogo = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please pick an image.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Logos must be under 2 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const name = `brand-logo-${Date.now()}.${file.name.split(".").pop()}`;
      const { error } = await supabase.storage.from("emails").upload(name, file, { contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("emails").getPublicUrl(name);
      set("brand_logo_url", data.publicUrl);
    } catch (e) {
      toast({
        title: "Logo upload failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  // Live preview of the fixed shell with placeholder body copy.
  const previewHtml = useMemo(() => {
    const brand = brandKitFromSettings({ ...settings, ...form });
    return renderNewsletterShell({
      brand,
      bodyFragment:
        `<p style="margin:0 0 12px;">Hi {first_name},</p>` +
        `<p style="margin:0 0 12px;">This is where each month's content goes — topic, hero image, article, key takeaways and your call to action. Everything above and below this block stays the same every issue.</p>`,
      issueLabel: "Monthly Newsletter",
      title: "Your newsletter headline",
      unsubscribeUrl: null,
    });
  }, [form, settings]);

  const handleSave = () => {
    onSave({
      ...form,
      brand_heading_size: Number(form.brand_heading_size) || 26,
      brand_body_size: Number(form.brand_body_size) || 15,
      social_links: form.social_links.filter((s) => s.url?.trim()),
      // Empty strings become NULL so the defaults in newsletter-brand apply.
      brand_logo_url: form.brand_logo_url.trim() || null,
      clinic_address: form.clinic_address.trim() || null,
      clinic_phone: form.clinic_phone.trim() || null,
      website_url: form.website_url.trim() || null,
      newsletter_footer_note: form.newsletter_footer_note.trim() || null,
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4" />Brand identity
            </CardTitle>
            <CardDescription className="text-xs">
              Applied to the header and footer of every newsletter and test send.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Logo</Label>
              <div className="flex items-center gap-3">
                {form.brand_logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.brand_logo_url} alt="Logo" className="h-10 max-w-[140px] object-contain rounded border bg-white p-1" />
                ) : (
                  <div className="h-10 w-[140px] rounded border border-dashed grid place-items-center text-[10px] text-muted-foreground">
                    No logo
                  </div>
                )}
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} />
                  <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-xs hover:bg-accent transition-colors">
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Upload
                  </span>
                </label>
                {form.brand_logo_url && (
                  <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => set("brand_logo_url", "")}>
                    Remove
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ColorRow label="Accent / buttons" value={form.brand_accent_color} onChange={(v) => set("brand_accent_color", v)} />
              <ColorRow label="Primary" value={form.brand_primary_color} onChange={(v) => set("brand_primary_color", v)} />
              <ColorRow label="Page background" value={form.brand_bg_color} onChange={(v) => set("brand_bg_color", v)} />
              <ColorRow label="Body text" value={form.brand_body_color} onChange={(v) => set("brand_body_color", v)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Heading font</Label>
                <Select value={form.brand_heading_font} onValueChange={(v) => set("brand_heading_font", v)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Body font</Label>
                <Select value={form.brand_body_font} onValueChange={(v) => set("brand_body_font", v)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Headline size (px)</Label>
                <Input type="number" min={14} max={48} value={form.brand_heading_size}
                  onChange={(e) => set("brand_heading_size", Number(e.target.value))} className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Body size (px)</Label>
                <Input type="number" min={11} max={24} value={form.brand_body_size}
                  onChange={(e) => set("brand_body_size", Number(e.target.value))} className="h-9 text-xs" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Footer &amp; compliance</CardTitle>
            <CardDescription className="text-xs">
              Contact details, links and the educational disclaimer appended to every issue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Clinic phone</Label>
                <Input value={form.clinic_phone} onChange={(e) => set("clinic_phone", e.target.value)} className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Website</Label>
                <Input value={form.website_url} onChange={(e) => set("website_url", e.target.value)} placeholder="https://…" className="h-9 text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Clinic address</Label>
              <Input value={form.clinic_address} onChange={(e) => set("clinic_address", e.target.value)} className="h-9 text-xs" />
              <p className="text-[10px] text-muted-foreground">
                A physical mailing address is required by CAN-SPAM on every marketing email.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Social links</Label>
              {form.social_links.map((link, i) => (
                <div key={i} className="flex gap-1.5">
                  <Input
                    value={link.label} placeholder="Instagram"
                    onChange={(e) => {
                      const next = [...form.social_links];
                      next[i] = { ...next[i], label: e.target.value };
                      set("social_links", next);
                    }}
                    className="h-8 text-xs w-32"
                  />
                  <Input
                    value={link.url} placeholder="https://…"
                    onChange={(e) => {
                      const next = [...form.social_links];
                      next[i] = { ...next[i], url: e.target.value };
                      set("social_links", next);
                    }}
                    className="h-8 text-xs flex-1"
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                    onClick={() => set("social_links", form.social_links.filter((_, j) => j !== i))}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="h-8 text-xs"
                onClick={() => set("social_links", [...form.social_links, { label: "", url: "" }])}>
                <Plus className="h-3.5 w-3.5 mr-1" />Add link
              </Button>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Medical / educational disclaimer</Label>
              <Textarea
                value={form.medical_disclaimer}
                onChange={(e) => set("medical_disclaimer", e.target.value)}
                className="min-h-[70px] text-xs resize-y"
              />
              <p className="text-[10px] text-muted-foreground">
                Shown in the footer of every newsletter. Keep it in place for patient-facing health content.
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Extra footer note (optional)</Label>
              <Input value={form.newsletter_footer_note} onChange={(e) => set("newsletter_footer_note", e.target.value)} className="h-9 text-xs" />
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="gradient-brand text-primary-foreground">
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          Save brand kit
        </Button>
      </div>

      <Card className="lg:sticky lg:top-4 h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Live preview</CardTitle>
          <CardDescription className="text-xs">
            The fixed shell every issue is built inside.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <iframe
            title="Brand kit preview"
            srcDoc={previewHtml}
            className="w-full h-[620px] rounded-md border bg-white"
            sandbox=""
          />
        </CardContent>
      </Card>
    </div>
  );
}
