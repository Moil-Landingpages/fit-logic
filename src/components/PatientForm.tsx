"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Building2, MapPin, Tag, StickyNote, TrendingUp, FlaskConical } from "lucide-react";
import { useLeadSources } from "@/hooks/use-lead-sources";

export interface PatientFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  company: string;
  deal_value: string;
  lead_source: string;
  pipeline_stage: string;
  status: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  tags: string;
  notes: string;
  is_test_contact: boolean;
}

interface PatientFormProps {
  defaultValues?: Partial<PatientFormData>;
  onSubmit: (data: PatientFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const COUNTRY_CODES = [
  { code: "+1",   flag: "🇺🇸", name: "US / Canada" },
  { code: "+44",  flag: "🇬🇧", name: "United Kingdom" },
  { code: "+61",  flag: "🇦🇺", name: "Australia" },
  { code: "+64",  flag: "🇳🇿", name: "New Zealand" },
  { code: "+353", flag: "🇮🇪", name: "Ireland" },
  { code: "+27",  flag: "🇿🇦", name: "South Africa" },
  { code: "+234", flag: "🇳🇬", name: "Nigeria" },
  { code: "+254", flag: "🇰🇪", name: "Kenya" },
  { code: "+233", flag: "🇬🇭", name: "Ghana" },
  { code: "+91",  flag: "🇮🇳", name: "India" },
  { code: "+86",  flag: "🇨🇳", name: "China" },
  { code: "+81",  flag: "🇯🇵", name: "Japan" },
  { code: "+82",  flag: "🇰🇷", name: "South Korea" },
  { code: "+49",  flag: "🇩🇪", name: "Germany" },
  { code: "+33",  flag: "🇫🇷", name: "France" },
  { code: "+34",  flag: "🇪🇸", name: "Spain" },
  { code: "+39",  flag: "🇮🇹", name: "Italy" },
  { code: "+31",  flag: "🇳🇱", name: "Netherlands" },
  { code: "+55",  flag: "🇧🇷", name: "Brazil" },
  { code: "+52",  flag: "🇲🇽", name: "Mexico" },
  { code: "+54",  flag: "🇦🇷", name: "Argentina" },
  { code: "+57",  flag: "🇨🇴", name: "Colombia" },
  { code: "+971", flag: "🇦🇪", name: "UAE" },
  { code: "+966", flag: "🇸🇦", name: "Saudi Arabia" },
] as const;

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1929 }, (_, i) => CURRENT_YEAR - i);

function parsePhone(fullPhone: string | undefined): { dialCode: string; localNumber: string } {
  if (!fullPhone) return { dialCode: "+1", localNumber: "" };
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const c of sorted) {
    if (fullPhone.startsWith(c.code)) {
      return { dialCode: c.code, localNumber: fullPhone.slice(c.code.length) };
    }
  }
  return { dialCode: "+1", localNumber: fullPhone };
}

function parseDob(dob: string | undefined): { month: string; year: string } {
  if (!dob) return { month: "", year: "" };
  const [year, month] = dob.split("-");
  return { month: month ?? "", year: year ?? "" };
}

export function PatientForm({ defaultValues, onSubmit, onCancel, isSubmitting }: PatientFormProps) {
  const { register, handleSubmit, setValue, watch } = useForm<PatientFormData>({
    defaultValues: {
      first_name: "", last_name: "", email: "", phone: "", date_of_birth: "",
      company: "", deal_value: "", lead_source: "", pipeline_stage: "new_lead",
      status: "active", address: "", city: "", state: "", zip_code: "",
      tags: "", notes: "", is_test_contact: false,
      ...defaultValues,
    },
  });

  const { dialCode: initDialCode, localNumber: initLocal } = parsePhone(defaultValues?.phone);
  const { month: initMonth, year: initYear } = parseDob(defaultValues?.date_of_birth);

  const [dialCode, setDialCode] = useState(initDialCode);
  const [localPhone, setLocalPhone] = useState(initLocal);
  const [dobMonth, setDobMonth] = useState(initMonth);
  const [dobYear, setDobYear] = useState(initYear);

  const lead_source = watch("lead_source");
  const pipeline_stage = watch("pipeline_stage");
  const status = watch("status");
  const is_test_contact = watch("is_test_contact");

  // A1.3: lead-source dropdown is sourced from the lead_sources table so
  // Megan can add custom values from Settings. Selecting "Other" reveals a
  // free-text input that overrides the stored value.
  const { data: leadSourceOptions = [] } = useLeadSources();
  const knownLabels = new Set(leadSourceOptions.map((s) => s.label));
  // Determine the dropdown selection: a known label, "Other" (when value is
  // present but not in the list — i.e. a previously custom value), or "" empty.
  const dropdownValue = !lead_source
    ? ""
    : knownLabels.has(lead_source)
      ? lead_source
      : "Other";
  const showCustomLeadSource = dropdownValue === "Other";

  const handleDialCodeChange = (code: string) => {
    setDialCode(code);
    setValue("phone", `${code}${localPhone}`);
  };

  const handleLocalPhoneChange = (number: string) => {
    setLocalPhone(number);
    setValue("phone", `${dialCode}${number}`);
  };

  const handleDobMonthChange = (month: string) => {
    setDobMonth(month);
    setValue("date_of_birth", dobYear && month ? `${dobYear}-${month}-01` : "");
  };

  const handleDobYearChange = (year: string) => {
    setDobYear(year);
    setValue("date_of_birth", year && dobMonth ? `${year}-${dobMonth}-01` : "");
  };

  const selectedCountry = COUNTRY_CODES.find((c) => c.code === dialCode);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-h-[65vh] overflow-y-auto pr-2">
      {/* Contact Information */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <User className="h-3.5 w-3.5" /> Contact Information
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="first_name" className="text-xs">First Name *</Label>
            <Input id="first_name" {...register("first_name", { required: true })} placeholder="Jane" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last_name" className="text-xs">Last Name *</Label>
            <Input id="last_name" {...register("last_name", { required: true })} placeholder="Smith" className="h-9" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs">Email</Label>
          <Input id="email" type="email" {...register("email")} placeholder="jane@company.com" className="h-9" />
        </div>

        {/* Phone with country code */}
        <div className="space-y-1.5">
          <Label className="text-xs">Phone</Label>
          <div className="flex gap-2">
            <Select value={dialCode} onValueChange={handleDialCodeChange}>
              <SelectTrigger className="h-9 w-[110px] shrink-0">
                <SelectValue>
                  <span className="flex items-center gap-1.5 text-xs">
                    <span>{selectedCountry?.flag}</span>
                    <span className="font-mono">{dialCode}</span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {COUNTRY_CODES.map((c) => (
                  <SelectItem key={c.code + c.name} value={c.code}>
                    <span className="flex items-center gap-2 text-xs">
                      <span>{c.flag}</span>
                      <span className="font-mono text-muted-foreground">{c.code}</span>
                      <span>{c.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={localPhone}
              onChange={(e) => handleLocalPhoneChange(e.target.value)}
              placeholder="(555) 123-4567"
              className="h-9 flex-1"
              type="tel"
            />
          </div>
        </div>

        {/* Date of Birth — month + year only */}
        <div className="space-y-1.5">
          <Label className="text-xs">Date of Birth</Label>
          <div className="grid grid-cols-2 gap-2">
            <Select value={dobMonth} onValueChange={handleDobMonthChange}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Month" /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dobYear} onValueChange={handleDobYearChange}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent className="max-h-60">
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      {/* Company & Deal */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Building2 className="h-3.5 w-3.5" /> Company & Deal
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="company" className="text-xs">Company</Label>
            <Input id="company" {...register("company")} placeholder="Acme Corp" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deal_value" className="text-xs">Deal Value ($)</Label>
            <Input id="deal_value" type="number" min="0" step="0.01" {...register("deal_value")} placeholder="5000" className="h-9" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Lead Source</Label>
            <Select
              value={dropdownValue}
              onValueChange={(v) => {
                if (v === "Other") {
                  // Preserve any prior custom value; otherwise blank the input.
                  if (knownLabels.has(lead_source ?? "")) setValue("lead_source", "");
                } else {
                  setValue("lead_source", v);
                }
              }}
            >
              <SelectTrigger className="h-9"><SelectValue placeholder="Select source" /></SelectTrigger>
              <SelectContent>
                {leadSourceOptions.map((s) => (
                  <SelectItem key={s.id} value={s.label}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showCustomLeadSource && (
              <Input
                value={lead_source ?? ""}
                onChange={(e) => setValue("lead_source", e.target.value)}
                placeholder="Enter custom lead source"
                className="h-9 mt-1.5"
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={(v) => setValue("status", v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active Lead</SelectItem>
                <SelectItem value="inactive">Cold</SelectItem>
                <SelectItem value="archived">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      {/* Pipeline Stage */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <TrendingUp className="h-3.5 w-3.5" /> Pipeline Stage
        </div>
        <Select value={pipeline_stage} onValueChange={(v) => setValue("pipeline_stage", v)}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="new_lead">New Lead</SelectItem>
            <SelectItem value="contacted">Contacted</SelectItem>
            <SelectItem value="qualified">Qualified</SelectItem>
            <SelectItem value="proposal">Proposal</SelectItem>
            <SelectItem value="negotiation">Negotiation</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Location */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <MapPin className="h-3.5 w-3.5" /> Location
        </div>
        <Input id="address" {...register("address")} placeholder="Street address" className="h-9" />
        <div className="grid grid-cols-3 gap-3">
          <Input {...register("city")} placeholder="City" className="h-9" />
          <Input {...register("state")} placeholder="State" className="h-9" />
          <Input {...register("zip_code")} placeholder="ZIP" className="h-9" />
        </div>
      </div>

      <Separator />

      {/* Tags & Notes */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <Tag className="h-3.5 w-3.5" /> Tags
          </div>
          <Input {...register("tags")} placeholder="vip, hot-lead, follow-up (comma-separated)" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <StickyNote className="h-3.5 w-3.5" /> Notes
          </div>
          <Textarea {...register("notes")} placeholder="Meeting notes, deal details, next steps..." rows={3} />
        </div>
      </div>

      <Separator />

      {/* Test contact (used by Phase 1 send guardrail while practice is on the
          shared API key). Sends to non-test contacts are skipped at the queue
          route until practice_settings.test_mode_only is flipped off. */}
      <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
        <div className="flex items-start gap-2">
          <FlaskConical className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-xs font-medium text-foreground">Test contact</p>
            <p className="text-[10px] text-muted-foreground">
              While the practice is on the shared API key, only contacts flagged here will receive campaign emails.
            </p>
          </div>
        </div>
        <Switch checked={!!is_test_contact} onCheckedChange={(v) => setValue("is_test_contact", v)} />
      </div>

      <DialogFooter className="pt-4 sticky bottom-0 bg-background pb-1">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : defaultValues?.first_name ? "Update Contact" : "Add Contact"}
        </Button>
      </DialogFooter>
    </form>
  );
}
