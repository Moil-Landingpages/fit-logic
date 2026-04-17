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
import { AlertCircle, CheckCircle2, Upload } from "lucide-react";

// ─── Field mapping ────────────────────────────────────────────────────────────

const DB_FIELDS = [
  { value: "_skip",          label: "— Skip column —" },
  { value: "first_name",     label: "First name" },
  { value: "last_name",      label: "Last name" },
  { value: "email",          label: "Email" },
  { value: "phone",          label: "Phone" },
  { value: "date_of_birth",  label: "Date of birth" },
  { value: "status",         label: "Status" },
  { value: "pipeline_stage", label: "Pipeline stage" },
  { value: "lead_source",    label: "Lead source" },
  { value: "company",        label: "Company" },
  { value: "deal_value",     label: "Deal value" },
  { value: "address",        label: "Address" },
  { value: "city",           label: "City" },
  { value: "state",          label: "State" },
  { value: "zip",            label: "ZIP" },
  { value: "tags",           label: "Tags (comma-separated)" },
  { value: "notes",          label: "Notes" },
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

    // Require at least email or (first_name + last_name)
    const hasEmail = typeof rec.email === "string" && EMAIL_RE.test(rec.email as string);
    const hasName = typeof rec.first_name === "string" && rec.first_name.trim().length > 0;
    if (!hasEmail && !hasName) return null;

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

        const { error } = await supabase
          .from("patients")
          .upsert(normalizedRecords.map((record) => record.payload) as any, {
            onConflict: "email",
            ignoreDuplicates: false,
          });

        if (error) {
          for (const record of normalizedRecords) {
            const { error: rowError } = await supabase
              .from("patients")
              .upsert(record.payload as any, {
                onConflict: "email",
                ignoreDuplicates: false,
              });

            if (rowError) {
              errors++;
              errList.push(`Row ${record.rowNumber}: ${rowError.message}`);
            } else {
              inserted++;
            }
          }
        } else {
          inserted += records.length;
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
        {step === "map" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {rows.length.toLocaleString()} rows detected. Map your CSV columns to contact fields.
            </p>

            {/* Contact type selector */}
            <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
              <span className="text-sm font-medium">Import as:</span>
              <div className="flex items-center bg-card border rounded-lg p-0.5">
                {([{ key: "lead", label: "Leads" }, { key: "client", label: "Clients" }] as const).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setContactType(t.key)}
                    className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      contactType === t.key
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                All imported contacts will be tagged as {contactType === "lead" ? "leads" : "clients"}
              </span>
            </div>

            {!emailMapped && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>No email column mapped — duplicates won't be detected and contacts will always be inserted.</span>
              </div>
            )}
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {headers.map((h) => (
                <div key={h} className="flex items-center gap-3">
                  <span className="text-sm font-mono w-40 shrink-0 truncate text-muted-foreground" title={h}>
                    {h}
                  </span>
                  <Select
                    value={mapping[h] ?? "_skip"}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v as DbField }))}
                  >
                    <SelectTrigger className="flex-1 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DB_FIELDS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => setStep("preview")}>Preview import</Button>
            </DialogFooter>
          </div>
        )}

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
