"use client";

import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { Upload, Users, Plus, Trash2, Search, UserPlus, FileSpreadsheet, Check, AlertTriangle, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { SegmentRule } from "@/lib/campaign-data";

export interface Recipient {
  email: string;
  name: string;
  patient_id?: string;
  source: "customer" | "csv_import" | "manual";
}

interface CampaignRecipientsProps {
  recipients: Recipient[];
  onChange: (recipients: Recipient[]) => void;
  /** Current campaign ID (for editing — excludes self from duplicate check) */
  campaignId?: string;
}

// ─── Segment rule evaluator ───────────────────────────────────────────────────
type PatientRow = Record<string, unknown>;

function evaluateRule(patient: PatientRow, rule: SegmentRule): boolean {
  const raw = patient[rule.field];
  const val = String(raw ?? "").toLowerCase();
  const ruleVal = rule.value.toLowerCase();

  // Relative date helpers
  const resolveDate = (v: string): Date | null => {
    const m = v.match(/^(\d+)_(days|months|years?)_ago$/);
    if (!m) return null;
    const n = parseInt(m[1]);
    const unit = m[2];
    const d = new Date();
    if (unit.startsWith("day")) d.setDate(d.getDate() - n);
    else if (unit.startsWith("month")) d.setMonth(d.getMonth() - n);
    else d.setFullYear(d.getFullYear() - n);
    return d;
  };

  switch (rule.operator) {
    case "is":       return val === ruleVal;
    case "is_not":   return val !== ruleVal;
    case "contains":
      if (Array.isArray(raw)) return (raw as string[]).some(t => t.toLowerCase().includes(ruleVal));
      return val.includes(ruleVal);
    case "greater_than": return parseFloat(val) > parseFloat(ruleVal);
    case "less_than":    return parseFloat(val) < parseFloat(ruleVal);
    case "before": {
      if (!raw) return false;
      const d = resolveDate(ruleVal) ?? new Date(ruleVal);
      return new Date(String(raw)) < d;
    }
    case "after": {
      if (!raw) return false;
      const d = resolveDate(ruleVal) ?? new Date(ruleVal);
      return new Date(String(raw)) > d;
    }
    default: return true;
  }
}

function matchesSegment(patient: PatientRow, rules: SegmentRule[]): boolean {
  if (!rules?.length) return true;
  return rules.every(r => evaluateRule(patient, r));
}

export function CampaignRecipients({ recipients, onChange, campaignId }: CampaignRecipientsProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualName, setManualName] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(
    new Set(recipients.filter(r => r.patient_id).map(r => r.patient_id!))
  );
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-for-campaign"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, first_name, last_name, email")
        .not("email", "is", null)
        .order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: segments = [] } = useQuery({
    queryKey: QK.segments,
    queryFn: async () => {
      const { data } = await supabase.from("segments").select("id, name, description, rules, estimated_count, color").order("name");
      return data ?? [];
    },
  });

  // All patients (for segment evaluation) — loaded lazily only when a segment is selected
  const { data: allPatientsForSeg = [] } = useQuery({
    queryKey: ["patients-for-segment", selectedSegmentId],
    enabled: !!selectedSegmentId,
    queryFn: async () => {
      const { data } = await supabase.from("patients").select("*").not("email", "is", null);
      return data ?? [];
    },
  });

  const segmentMatches = (() => {
    if (!selectedSegmentId) return [];
    const seg = segments.find(s => s.id === selectedSegmentId);
    if (!seg) return [];
    const rules: SegmentRule[] = Array.isArray(seg.rules) ? seg.rules as unknown as SegmentRule[] : [];
    return allPatientsForSeg.filter((p) => matchesSegment(p as PatientRow, rules));
  })();

  const addFromSegment = () => {
    if (!segmentMatches.length) return;
    const existingEmails = new Set(recipients.map(r => r.email.toLowerCase()));
    const toAdd: Recipient[] = [];
    let dupeCount = 0;
    for (const p of segmentMatches) {
      const email = p.email as string;
      if (existingEmails.has(email.toLowerCase())) continue;
      if (activeEmailSet.has(email.toLowerCase())) dupeCount++;
      toAdd.push({ email, name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(), patient_id: p.id as string, source: "customer" });
      existingEmails.add(email.toLowerCase());
      setSelectedCustomerIds(prev => { const n = new Set(prev); n.add(p.id as string); return n; });
    }
    onChange([...recipients, ...toAdd]);
    let msg = `Added ${toAdd.length} contact${toAdd.length !== 1 ? "s" : ""} from segment`;
    if (dupeCount > 0) msg += ` (${dupeCount} overlap with active campaigns)`;
    toast({ title: msg });
  };

  // Fetch emails already in active campaigns/sequences (not draft, not completed)
  const { data: activeCampaignEmails = [] } = useQuery({
    queryKey: ["active-campaign-emails", campaignId],
    queryFn: async () => {
      // First get active campaign IDs
      const { data: activeCampaigns, error: cErr } = await supabase
        .from("campaigns")
        .select("id, name")
        .in("status", ["scheduled", "sending", "paused"]);
      if (cErr || !activeCampaigns?.length) return [];

      const activeCampaignIds = activeCampaigns
        .filter(c => c.id !== campaignId)
        .map(c => c.id);
      if (!activeCampaignIds.length) return [];

      const campaignNameMap = Object.fromEntries(activeCampaigns.map(c => [c.id, c.name]));

      const { data, error } = await supabase
        .from("campaign_recipients")
        .select("email, campaign_id, status")
        .in("campaign_id", activeCampaignIds)
        .neq("status", "skipped");
      if (error) return [];
      return (data || []).map((r: any) => ({
        email: r.email.toLowerCase(),
        campaignName: campaignNameMap[r.campaign_id] || "Unknown campaign",
        status: r.status,
      }));
    },
  });

  const activeEmailSet = new Set(activeCampaignEmails.map(e => e.email));

  const getDuplicateWarning = (email: string): string | null => {
    const match = activeCampaignEmails.find(e => e.email === email.toLowerCase());
    if (!match) return null;
    return `Already in "${match.campaignName}" (${match.status})`;
  };

  const filteredCustomers = customers.filter(c => {
    const q = search.toLowerCase();
    return (
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q)
    );
  });

  const toggleCustomer = (c: typeof customers[0]) => {
    const next = new Set(selectedCustomerIds);
    if (next.has(c.id)) {
      next.delete(c.id);
      onChange(recipients.filter(r => r.patient_id !== c.id));
    } else {
      next.add(c.id);
      const warning = getDuplicateWarning(c.email!);
      if (warning) {
        toast({ title: "Heads up", description: `${c.first_name} is already active in another campaign. They'll be added but watch for overlap.` });
      }
      onChange([...recipients, { email: c.email!, name: `${c.first_name} ${c.last_name}`, patient_id: c.id, source: "customer" }]);
    }
    setSelectedCustomerIds(next);
  };

  const selectAll = () => {
    const eligible = filteredCustomers.filter(c => c.email);
    const next = new Set(selectedCustomerIds);
    const newRecipients = [...recipients];
    let dupeCount = 0;
    eligible.forEach(c => {
      if (!next.has(c.id)) {
        next.add(c.id);
        if (activeEmailSet.has(c.email!.toLowerCase())) dupeCount++;
        newRecipients.push({ email: c.email!, name: `${c.first_name} ${c.last_name}`, patient_id: c.id, source: "customer" });
      }
    });
    setSelectedCustomerIds(next);
    onChange(newRecipients);
    if (dupeCount > 0) {
      toast({ title: "Overlap detected", description: `${dupeCount} contact(s) are already in active campaigns.` });
    }
  };

  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").filter(l => l.trim());
      const header = lines[0].toLowerCase();
      const emailIdx = header.split(",").findIndex(h => h.trim().includes("email"));
      const nameIdx = header.split(",").findIndex(h => h.trim().includes("name"));
      if (emailIdx === -1) {
        toast({ title: "CSV Error", description: "No 'email' column found.", variant: "destructive" });
        return;
      }
      const imported: Recipient[] = [];
      const existingEmails = new Set(recipients.map(r => r.email.toLowerCase()));
      let dupeCount = 0;
      let skippedDupes = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
        const email = cols[emailIdx];
        if (email && email.includes("@")) {
          if (existingEmails.has(email.toLowerCase())) {
            skippedDupes++;
            continue;
          }
          if (activeEmailSet.has(email.toLowerCase())) dupeCount++;
          imported.push({ email, name: nameIdx >= 0 ? cols[nameIdx] || "" : "", source: "csv_import" });
          existingEmails.add(email.toLowerCase());
        }
      }
      onChange([...recipients, ...imported]);
      let msg = `Imported ${imported.length} contacts`;
      if (skippedDupes > 0) msg += `, ${skippedDupes} duplicates skipped`;
      if (dupeCount > 0) msg += `. ${dupeCount} overlap with active campaigns`;
      toast({ title: msg });
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const addManual = () => {
    if (!manualEmail.includes("@")) return;
    if (recipients.some(r => r.email.toLowerCase() === manualEmail.toLowerCase())) {
      toast({ title: "Duplicate", description: "This email is already added.", variant: "destructive" });
      return;
    }
    const warning = getDuplicateWarning(manualEmail);
    if (warning) {
      toast({ title: "Overlap detected", description: warning });
    }
    onChange([...recipients, { email: manualEmail, name: manualName, source: "manual" }]);
    setManualEmail("");
    setManualName("");
  };

  const removeRecipient = (email: string) => {
    const removed = recipients.find(r => r.email === email);
    if (removed?.patient_id) {
      const next = new Set(selectedCustomerIds);
      next.delete(removed.patient_id);
      setSelectedCustomerIds(next);
    }
    onChange(recipients.filter(r => r.email !== email));
  };

  const customerCount = recipients.filter(r => r.source === "customer").length;
  const csvCount = recipients.filter(r => r.source === "csv_import").length;
  const manualCount = recipients.filter(r => r.source === "manual").length;
  const overlapCount = recipients.filter(r => activeEmailSet.has(r.email.toLowerCase())).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading font-semibold text-sm text-foreground">Recipients</h3>
          <p className="text-xs text-muted-foreground">
            {recipients.length} contact{recipients.length !== 1 ? "s" : ""} selected
            {customerCount > 0 && <span className="ml-1">• {customerCount} customers</span>}
            {csvCount > 0 && <span className="ml-1">• {csvCount} imported</span>}
            {manualCount > 0 && <span className="ml-1">• {manualCount} manual</span>}
          </p>
        </div>
      </div>

      {/* Overlap warning */}
      {overlapCount > 0 && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-status-pending/10 border border-status-pending/20">
          <AlertTriangle className="h-3.5 w-3.5 text-status-pending mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">{overlapCount} recipient(s)</span> are already in active campaigns. 
            They'll still be added — just be aware they may receive emails from multiple sequences.
          </p>
        </div>
      )}

      <Tabs defaultValue="customers" className="w-full">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="customers" className="text-xs"><Users className="h-3 w-3 mr-1" />Customers</TabsTrigger>
          <TabsTrigger value="segments" className="text-xs"><Layers className="h-3 w-3 mr-1" />Segments</TabsTrigger>
          <TabsTrigger value="csv" className="text-xs"><FileSpreadsheet className="h-3 w-3 mr-1" />CSV</TabsTrigger>
          <TabsTrigger value="manual" className="text-xs"><UserPlus className="h-3 w-3 mr-1" />Manual</TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="space-y-2 mt-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search customers..." className="pl-7 h-8 text-xs" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button variant="outline" size="sm" className="text-xs h-8" onClick={selectAll}>
              <Check className="h-3 w-3 mr-1" />Select All
            </Button>
          </div>
          <ScrollArea className="h-[180px] rounded border p-1">
            {filteredCustomers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No customers with emails found</p>
            ) : filteredCustomers.map(c => {
              const dupWarning = getDuplicateWarning(c.email!);
              return (
                <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-xs">
                  <Checkbox checked={selectedCustomerIds.has(c.id)} onCheckedChange={() => toggleCustomer(c)} />
                  <span className="font-medium">{c.first_name} {c.last_name}</span>
                  {dupWarning && <AlertTriangle className="h-3 w-3 text-status-pending shrink-0" />}
                  <span className="text-muted-foreground ml-auto truncate max-w-[180px]">{c.email}</span>
                </label>
              );
            })}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="segments" className="space-y-3 mt-2">
          {segments.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No segments defined yet. Create them in the Segments tab.</p>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Select a segment</Label>
                <Select value={selectedSegmentId} onValueChange={setSelectedSegmentId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Choose segment…" />
                  </SelectTrigger>
                  <SelectContent>
                    {segments.map(s => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        <span>{s.name}</span>
                        {s.estimated_count > 0 && (
                          <span className="ml-2 text-muted-foreground">~{s.estimated_count}</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedSegmentId && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{segmentMatches.length}</span> matching contacts with email addresses
                  </p>
                  <Button size="sm" className="text-xs h-7 w-full" onClick={addFromSegment} disabled={segmentMatches.length === 0}>
                    <Plus className="h-3 w-3 mr-1" /> Add {segmentMatches.length} contacts
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="csv" className="space-y-3 mt-2">
          <Card className="border-dashed">
            <CardContent className="py-6 text-center">
              <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground mb-2">Upload a CSV with <code className="text-[10px] bg-muted px-1 rounded">email</code> and optionally <code className="text-[10px] bg-muted px-1 rounded">name</code> columns</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} />
              <Button variant="outline" size="sm" className="text-xs" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3 w-3 mr-1" />Choose CSV File
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual" className="space-y-2 mt-2">
          <div className="flex gap-2">
            <Input placeholder="Name" className="h-8 text-xs" value={manualName} onChange={e => setManualName(e.target.value)} />
            <Input placeholder="email@example.com" className="h-8 text-xs flex-1" value={manualEmail} onChange={e => setManualEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && addManual()} />
            <Button size="sm" className="h-8 text-xs" onClick={addManual} disabled={!manualEmail.includes("@")}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Selected recipients list */}
      {recipients.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Selected ({recipients.length})</Label>
          <ScrollArea className="h-[100px] rounded border p-1">
            {recipients.map(r => {
              const dupWarning = getDuplicateWarning(r.email);
              return (
                <div key={r.email} className="flex items-center justify-between px-2 py-1 text-xs rounded hover:bg-muted/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="text-[9px] shrink-0">
                      {r.source === "customer" ? "CRM" : r.source === "csv_import" ? "CSV" : "Manual"}
                    </Badge>
                    <span className="truncate">{r.name || r.email}</span>
                    {r.name && <span className="text-muted-foreground truncate">{r.email}</span>}
                    {dupWarning && (
                      <Badge variant="outline" className="text-[8px] text-status-pending border-status-pending/30 shrink-0">
                        <AlertTriangle className="h-2 w-2 mr-0.5" />Overlap
                      </Badge>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive" onClick={() => removeRecipient(r.email)}>
                    <Trash2 className="h-2.5 w-2.5" />
                  </Button>
                </div>
              );
            })}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
