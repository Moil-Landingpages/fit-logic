"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, Upload, ArrowRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

// ─── Field mapping ────────────────────────────────────────────────────────────

const DB_FIELDS = [
  { value: "_skip",          label: "— Skip column —",       type: "" },
  { value: "first_name",     label: "First name",            type: "Text" },
  { value: "last_name",      label: "Last name",             type: "Text" },
  { value: "email",          label: "Email address",         type: "Email" },
  { value: "phone",          label: "Phone number",          type: "Phone" },
  { value: "date_of_birth",  label: "Date of birth",         type: "Date" },
  { value: "status",         label: "Status",                type: "Text" },
  { value: "pipeline_stage", label: "Pipeline stage",        type: "Text" },
  { value: "lead_source",    label: "Lead source",           type: "Text" },
  { value: "company",        label: "Company",               type: "Text" },
  { value: "deal_value",     label: "Deal value",            type: "Number" },
  { value: "address",        label: "Address",               type: "Text" },
  { value: "city",           label: "City",                  type: "Text" },
  { value: "state",          label: "State",                 type: "Text" },
  { value: "zip",            label: "ZIP",                   type: "Text" },
  { value: "tags",           label: "Tags",                  type: "List" },
  { value: "notes",          label: "Notes",                 type: "Text" },
] as const;

type DbField = (typeof DB_FIELDS)[number]["value"];

// Auto-detect common column names → DB field
const AUTO_MAP: Record<string, DbField> = {
  "first name": "first_name",
  firstname:    "first_name",
  "first_name": "first_name",
  "last name":  "last_name",
  lastname:     "last_name",
  "last_name":  "last_name",
  name:         "first_name",
  "full name":  "first_name",
  fullname:     "first_name",
  "contact name": "first_name",
  email:        "email",
  "e-mail":     "email",
  phone:        "phone",
  telephone:    "phone",
  mobile:       "phone",
  cell:         "phone",
  dob:          "date_of_birth",
  "date of birth": "date_of_birth",
  birthday:     "date_of_birth",
  status:       "status",
  "pipeline stage": "pipeline_stage",
  stage:        "pipeline_stage",
  "lead source": "lead_source",
  source:       "lead_source",
  company:      "company",
  organization: "company",
  "deal value": "deal_value",
  amount:       "deal_value",
  address:      "address",
  city:         "city",
  state:        "state",
  zip:          "zip",
  postal:       "zip",
  tags:         "tags",
  notes:        "notes",
  note:         "notes",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHUNK_SIZE = 50;
const FULL_NAME_HEADERS = new Set(["name", "full name", "fullname", "contact name"]);

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Step = "upload" | "map" | "preview" | "importing" | "done";
type ContactType = "lead" | "client";

interface ParsedRow {
  [key: string]: string;
}

interface BuiltRecord {
  payload: Record<string, unknown>;
  hasExplicitFirstName: boolean;
  hasExplicitLastName: boolean;
}

function toNameCase(value: string) {
  const cleaned = value.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function splitFullName(value: string) {
  const cleaned = value.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return { firstName: "", lastName: "" };
  const parts = cleaned.split(/\s+/);
  return {
    firstName: toNameCase(parts[0] ?? ""),
    lastName: toNameCase(parts.slice(1).join(" ")),
  };
}

function deriveNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? "";
  return splitFullName(localPart);
}

export function BulkImportDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep]           = useState<Step>("upload");
  const [headers, setHeaders]     = useState<string[]>([]);
  const [rows, setRows]           = useState<ParsedRow[]>([]);
  const [mapping, setMapping]     = useState<Record<string, DbField>>({});
  const [progress, setProgress]   = useState(0);
  const [summary, setSummary]     = useState({ inserted: 0, skipped: 0, errors: 0 });
  const [errorRows, setErrorRows] = useState<string[]>([]);
  const [contactType, setContactType] = useState<ContactType>("lead");

  // ─── Reset on close ────────────────────────────────────────────────────────
  const handleClose = () => {
    setStep("upload");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setProgress(0);
    setSummary({ inserted: 0, skipped: 0, errors: 0 });
    setErrorRows([]);
    setContactType("lead");
    onOpenChange(false);
  };

  // ─── File parse ────────────────────────────────────────────────────────────
  const handleFile = (file: File) => {
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const hdrs = result.meta.fields ?? [];
        setHeaders(hdrs);
        setRows(result.data);

        // Auto-map columns
        const auto: Record<string, DbField> = {};
        for (const h of hdrs) {
          const key = h.toLowerCase().trim();
          auto[h] = AUTO_MAP[key] ?? "_skip";
        }
        setMapping(auto);
        setStep("map");
      },
      error: (err) => {
        toast({ title: "Parse error", description: err.message, variant: "destructive" });
      },
    });
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  // ─── Build DB row from CSV row + mapping ───────────────────────────────────
  function buildRecord(csvRow: ParsedRow): BuiltRecord | null {
    const rec: Record<string, unknown> = {};
    const hasLastNameColumn = Object.values(mapping).includes("last_name");
    let hasExplicitFirstName = false;
    let hasExplicitLastName = false;

    for (const [csvCol, dbField] of Object.entries(mapping)) {
      if (dbField === "_skip") continue;
      const raw = (csvRow[csvCol] ?? "").trim();
      if (!raw) continue;
      const header = csvCol.toLowerCase().trim();

      if (dbField === "tags") {
        rec[dbField] = raw.split(",").map((t) => t.trim()).filter(Boolean);
      } else if (dbField === "deal_value") {
        const numericValue = Number(raw.replace(/[^0-9.-]/g, ""));
        if (!Number.isNaN(numericValue)) rec.deal_value = numericValue;
      } else if (dbField === "zip") {
        rec["zip_code"] = raw;
      } else if (dbField === "first_name" && FULL_NAME_HEADERS.has(header) && !hasLastNameColumn) {
        const { firstName, lastName } = splitFullName(raw);
        if (firstName) rec.first_name = firstName;
        if (lastName) rec.last_name = lastName;
        hasExplicitFirstName = !!firstName;
        hasExplicitLastName = !!lastName;
      } else {
        rec[dbField] = dbField === "email" ? raw.toLowerCase() : raw;
        if (dbField === "first_name") hasExplicitFirstName = true;
        if (dbField === "last_name") hasExplicitLastName = true;
      }
    }

    // Require at least a name (first or last) or a valid email
    const hasEmail = typeof rec.email === "string" && EMAIL_RE.test(rec.email as string);
    const hasFirstName = typeof rec.first_name === "string" && rec.first_name.trim().length > 0;
    const hasLastName = typeof rec.last_name === "string" && rec.last_name.trim().length > 0;
    if (!hasEmail && !hasFirstName && !hasLastName) return null;
    // Fall back to email-derived name if name is missing but email exists
    if (!hasFirstName && !hasLastName && hasEmail) {
      const derived = deriveNameFromEmail(rec.email as string);
      rec.first_name = derived.firstName || "Imported";
      rec.last_name = derived.lastName || "";
    }

    // Default required field — use selected contact type
    if (!rec.status) rec.status = contactType;
    if (!rec.pipeline_stage) rec.pipeline_stage = "new_lead";

    return { payload: rec, hasExplicitFirstName, hasExplicitLastName };
  }

  // ─── Import ────────────────────────────────────────────────────────────────
  const runImport = async () => {
    setStep("importing");
    let inserted = 0;
    let skipped  = 0;
    let errors   = 0;
    const errList: string[] = [];

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const records: Array<{ rowNumber: number; payload: Record<string, unknown>; hasExplicitFirstName: boolean; hasExplicitLastName: boolean }> = [];

      for (let offset = 0; offset < chunk.length; offset += 1) {
        const row = chunk[offset];
        const rowNumber = i + offset + 2;
        const rec = buildRecord(row);
        if (!rec) {
          skipped++;
          continue;
        }

        if (rec.payload.email && !EMAIL_RE.test(rec.payload.email as string)) {
          errors++;
          errList.push(`Row ${rowNumber}: invalid email "${rec.payload.email}"`);
          continue;
        }

        records.push({ rowNumber, ...rec });
      }

      if (records.length > 0) {
        const emails = records
          .map((record) => record.payload.email)
          .filter((email): email is string => typeof email === "string" && EMAIL_RE.test(email));

        const existingByEmail = new Map<string, { first_name: string; last_name: string }>();
        if (emails.length > 0) {
          const { data: existing } = await supabase
            .from("patients")
            .select("email, first_name, last_name")
            .in("email", emails);

          for (const patient of existing ?? []) {
            if (patient.email) {
              existingByEmail.set(patient.email.toLowerCase(), {
                first_name: patient.first_name,
                last_name: patient.last_name,
              });
            }
          }
        }

        const normalizedRecords = records.map((record) => {
          const payload = { ...record.payload };
          const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
          const existing = email ? existingByEmail.get(email) : null;

          if (!record.hasExplicitFirstName || !String(payload.first_name ?? "").trim()) {
            if (existing?.first_name) {
              payload.first_name = existing.first_name;
            } else if (email) {
              payload.first_name = deriveNameFromEmail(email).firstName || "Imported";
            }
          }

          if (!record.hasExplicitLastName) {
            if (existing?.last_name) {
              payload.last_name = existing.last_name;
            } else if (email) {
              payload.last_name = deriveNameFromEmail(email).lastName || "";
            } else {
              payload.last_name = "";
            }
          } else {
            payload.last_name = typeof payload.last_name === "string" ? payload.last_name.trim() : "";
          }

          return { ...record, payload };
        });

        for (const record of normalizedRecords) {
          const payload = record.payload;
          const email = typeof payload.email === "string" ? payload.email : null;

          // If the record has an email, check if it already exists and update; otherwise insert
          if (email) {
            const { data: existing } = await supabase
              .from("patients")
              .select("id")
              .eq("email", email)
              .maybeSingle();

            if (existing?.id) {
              const { error: updateErr } = await supabase
                .from("patients")
                .update(payload as any)
                .eq("id", existing.id);
              if (updateErr) {
                errors++;
                errList.push(`Row ${record.rowNumber}: ${updateErr.message}`);
              } else {
                inserted++;
              }
              continue;
            }
          }

          const { error: insertErr } = await supabase
            .from("patients")
            .insert(payload as any);
          if (insertErr) {
            errors++;
            errList.push(`Row ${record.rowNumber}: ${insertErr.message}`);
          } else {
            inserted++;
          }
        }
      }

      setProgress(Math.round((Math.min(i + chunk.length, rows.length) / rows.length) * 100));
    }

    setProgress(100);
    setSummary({ inserted, skipped, errors });
    setErrorRows(errList.slice(0, 20)); // cap displayed errors
    setStep("done");
    qc.invalidateQueries({ queryKey: QK.patients });
  };

  // ─── Email-mapped column guard ─────────────────────────────────────────────
  const emailMapped = Object.values(mapping).includes("email");

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Import Contacts</DialogTitle>
          <DialogDescription>
            Upload a CSV file to import contacts. Existing contacts matched by email will be updated.
          </DialogDescription>
        </DialogHeader>

        {/* ── Step: Upload ─────────────────────────────────────────────────── */}
        {step === "upload" && (
          <div
            className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:border-primary/60 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">Click or drag a CSV file here</p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports .csv files up to any size
            </p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
          </div>
        )}

        {/* ── Step: Map ────────────────────────────────────────────────────── */}
        {step === "map" && (() => {
          const mappedCount = Object.values(mapping).filter((v) => v !== "_skip").length;
          return (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                <span className="text-foreground">{mappedCount}/{headers.length} columns</span>
                <span className="text-muted-foreground"> will be imported · {rows.length.toLocaleString()} rows</span>
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Import as:</span>
                <div className="flex items-center bg-card border rounded-lg p-0.5">
                  {([{ key: "lead", label: "Leads" }, { key: "client", label: "Clients" }] as const).map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setContactType(t.key)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        contactType === t.key
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {!emailMapped && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>No email column mapped — duplicate detection is off, all rows will be inserted.</span>
              </div>
            )}

            {/* Mailchimp-style mapping table */}
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-y-auto max-h-[380px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-muted/60 border-b">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground w-10">Import</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground w-36">File column name</th>
                      <th className="w-8" />
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground w-48">Match to field</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Preview data</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground w-24">Data type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {headers.map((h) => {
                      const fieldVal = mapping[h] ?? "_skip";
                      const isSkipped = fieldVal === "_skip";
                      const fieldDef = DB_FIELDS.find((f) => f.value === fieldVal);
                      const previewVals = rows.slice(0, 2).map((r) => r[h]).filter(Boolean);
                      return (
                        <tr
                          key={h}
                          className={`transition-colors ${
                            isSkipped ? "bg-muted/20 opacity-60" : "bg-background hover:bg-muted/30"
                          }`}
                        >
                          {/* Import checkbox */}
                          <td className="px-3 py-2.5 text-center">
                            <Checkbox
                              checked={!isSkipped}
                              onCheckedChange={(checked) =>
                                setMapping((m) => ({
                                  ...m,
                                  [h]: checked
                                    ? (AUTO_MAP[h.toLowerCase().trim()] ?? "first_name")
                                    : "_skip",
                                }))
                              }
                            />
                          </td>
                          {/* CSV column name */}
                          <td className="px-3 py-2.5">
                            <span className="font-medium text-foreground truncate block max-w-[130px]" title={h}>{h}</span>
                          </td>
                          {/* Arrow */}
                          <td className="text-center">
                            <ArrowRight className={`h-4 w-4 mx-auto ${
                              isSkipped ? "text-muted-foreground/40" : "text-primary"
                            }`} />
                          </td>
                          {/* Field select */}
                          <td className="px-3 py-2">
                            <Select
                              value={fieldVal}
                              onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v as DbField }))}
                            >
                              <SelectTrigger className="h-8 text-xs w-44">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DB_FIELDS.map((f) => (
                                  <SelectItem key={f.value} value={f.value} className="text-xs">
                                    {f.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          {/* Preview data */}
                          <td className="px-3 py-2.5">
                            {previewVals.length > 0 ? (
                              <div className="space-y-0.5">
                                {previewVals.map((v, i) => (
                                  <p key={i} className="text-xs text-muted-foreground truncate max-w-[160px]" title={v}>{v}</p>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">no data</span>
                            )}
                          </td>
                          {/* Data type */}
                          <td className="px-3 py-2.5">
                            <span className="text-xs text-muted-foreground">
                              {isSkipped ? "—" : (fieldDef?.type || "Text")}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => setStep("preview")}>
                Continue → Preview {mappedCount} field{mappedCount !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </div>
          );
        })()}

        {/* ── Step: Preview ────────────────────────────────────────────────── */}
        {step === "preview" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Preview of the first 5 rows. Skipped columns are excluded.
            </p>
            <div className="overflow-x-auto rounded border text-xs">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {Object.entries(mapping)
                      .filter(([, v]) => v !== "_skip")
                      .map(([col]) => (
                        <th key={col} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                          {DB_FIELDS.find((f) => f.value === mapping[col])?.label ?? col}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {Object.entries(mapping)
                        .filter(([, v]) => v !== "_skip")
                        .map(([col]) => (
                          <td key={col} className="px-3 py-2 truncate max-w-[120px]" title={row[col]}>
                            {row[col] || <span className="text-muted-foreground italic">empty</span>}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("map")}>Back</Button>
              <Button onClick={runImport}>
                Import {rows.length.toLocaleString()} contacts
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step: Importing ──────────────────────────────────────────────── */}
        {step === "importing" && (
          <div className="py-8 space-y-4 text-center">
            <p className="text-sm font-medium">Importing contacts…</p>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground">{progress}% complete</p>
          </div>
        )}

        {/* ── Step: Done ───────────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
              <div>
                <p className="font-medium text-sm">Import complete</p>
                <p className="text-xs text-muted-foreground">
                  {summary.inserted.toLocaleString()} inserted/updated ·{" "}
                  {summary.skipped.toLocaleString()} skipped (missing name/email) ·{" "}
                  {summary.errors.toLocaleString()} errors
                </p>
              </div>
            </div>
            {errorRows.length > 0 && (
              <div className="rounded border border-destructive/30 bg-destructive/5 p-3 space-y-1 max-h-40 overflow-y-auto">
                <p className="text-xs font-medium text-destructive">Errors</p>
                {errorRows.map((e, i) => (
                  <p key={i} className="text-xs text-destructive/80">{e}</p>
                ))}
                {summary.errors > 20 && (
                  <p className="text-xs text-muted-foreground">…and {summary.errors - 20} more</p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
