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
  { value: "company",        label: "Company / Practice" },
  { value: "deal_value",     label: "Deal value ($)" },
  { value: "lead_source",    label: "Lead source" },
  { value: "pipeline_stage", label: "Pipeline stage" },
  { value: "status",         label: "Status" },
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
  email:        "email",
  "e-mail":     "email",
  phone:        "phone",
  telephone:    "phone",
  mobile:       "phone",
  cell:         "phone",
  dob:          "date_of_birth",
  "date of birth": "date_of_birth",
  birthday:     "date_of_birth",
  company:      "company",
  organization: "company",
  practice:     "company",
  "deal value": "deal_value",
  "deal_value": "deal_value",
  revenue:      "deal_value",
  source:       "lead_source",
  "lead source": "lead_source",
  stage:        "pipeline_stage",
  "pipeline stage": "pipeline_stage",
  status:       "status",
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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Step = "upload" | "map" | "preview" | "importing" | "done";
type ContactType = "lead" | "client";

interface ParsedRow {
  [key: string]: string;
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
  function buildRecord(csvRow: ParsedRow): Record<string, unknown> | null {
    const rec: Record<string, unknown> = {};
    for (const [csvCol, dbField] of Object.entries(mapping)) {
      if (dbField === "_skip") continue;
      const raw = (csvRow[csvCol] ?? "").trim();
      if (!raw) continue;

      if (dbField === "deal_value") {
        const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
        if (!isNaN(n)) rec[dbField] = n;
      } else if (dbField === "tags") {
        rec[dbField] = raw.split(",").map((t) => t.trim()).filter(Boolean);
      } else {
        rec[dbField] = raw;
      }
    }

    // Require at least email or (first_name + last_name)
    const hasEmail = typeof rec.email === "string" && EMAIL_RE.test(rec.email as string);
    const hasName  = rec.first_name || rec.last_name;
    if (!hasEmail && !hasName) return null;

    // Default required field — use selected contact type
    if (!rec.status) rec.status = contactType;

    return rec;
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
      const records: Record<string, unknown>[] = [];
      const chunkErrors: string[] = [];

      for (const row of chunk) {
        const rec = buildRecord(row);
        if (!rec) {
          skipped++;
          continue;
        }
        // Email format check
        if (rec.email && !EMAIL_RE.test(rec.email as string)) {
          errors++;
          errList.push(`Row ${i + chunk.indexOf(row) + 2}: invalid email "${rec.email}"`);
          continue;
        }
        records.push(rec);
      }

      if (records.length > 0) {
        const { error } = await supabase
          .from("patients")
          .upsert(records as any, {
            onConflict: "email",
            ignoreDuplicates: false,
          });

        if (error) {
          errors += records.length;
          chunkErrors.push(`Chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${error.message}`);
        } else {
          inserted += records.length;
        }
      }

      errList.push(...chunkErrors);
      setProgress(Math.round(((i + CHUNK_SIZE) / rows.length) * 100));
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
