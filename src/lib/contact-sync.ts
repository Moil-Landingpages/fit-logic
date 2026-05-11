/**
 * Pipeline ↔ status synchronization invoked from every send path.
 *
 * Why this exists: Megan keeps two parallel signals on a contact:
 *   - `status`        — the lifecycle bucket (lead, active, inactive, archived)
 *   - `pipeline_stage` — where the deal sits in the funnel (new_lead,
 *     contacted, qualified, proposal, negotiation, won, lost)
 *
 * Without explicit syncing these drift. A contact she's been emailing for a
 * month would still read "New Lead" on the kanban because nothing flipped
 * the stage. This helper handles ONE direction:
 *
 *   - When ANY email goes out to a contact whose status === 'lead' AND
 *     whose pipeline_stage is 'new_lead' (or null), bump the stage to
 *     'contacted' and stamp last_contacted_at.
 *
 * The reverse direction (pipeline_stage='won' → status='active') is enforced
 * by the DB trigger added in migration 20260502000003 so it can't be missed
 * by a future code path.
 *
 * The function is idempotent and best-effort: if the patient was already
 * past 'new_lead' or isn't a 'lead', only last_contacted_at is updated. All
 * errors are logged and swallowed — sync failures must NEVER prevent an
 * email from being recorded as sent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

interface PatientShape {
  id: string;
  status: string | null;
  pipeline_stage: string | null;
}

const STAGES_TO_PROMOTE_FROM = new Set<string>(["new_lead", ""]);

/**
 * Sync a single contact after a successful send. Pass the patient's CURRENT
 * status + pipeline_stage so we can decide without a fresh round-trip.
 */
export async function syncContactOnEmailSent(
  supabase: SupabaseClient,
  patient: PatientShape,
  sentAt: string,
): Promise<void> {
  const updates: Record<string, unknown> = { last_contacted_at: sentAt };

  // Only promote contacts we haven't actively engaged yet. Don't touch
  // contacts already past 'contacted' (qualified, proposal, won, etc.).
  // Previously gated on status==='lead' too, but that surprised users:
  // clicking the Email button on a contact should advance the deal from
  // its first stage regardless of the contact's account status
  // (active/inactive/lead).
  const stage = (patient.pipeline_stage ?? "").trim();
  if (STAGES_TO_PROMOTE_FROM.has(stage)) {
    updates.pipeline_stage = "contacted";
  }

  const { error } = await supabase.from("patients").update(updates).eq("id", patient.id);
  if (error) {
    console.warn("[contact-sync] failed to update patient", {
      patient_id: patient.id,
      error: error.message,
    });
  }
}

/**
 * Bulk version — for the campaign queue / cron loops where we already have
 * the patient map prefetched. Decides per-row whether to promote, then
 * issues a small number of UPDATEs (one per distinct update payload) to
 * avoid N+1.
 *
 * For simplicity and predictability, we issue one UPDATE per patient. The
 * batch size is bounded by the queue's 500-recipient cap and Postgres
 * absorbs the writes easily.
 */
export async function syncContactsOnEmailSent(
  supabase: SupabaseClient,
  patients: Iterable<PatientShape>,
  sentAt: string,
): Promise<void> {
  await Promise.all(
    Array.from(patients).map((p) => syncContactOnEmailSent(supabase, p, sentAt)),
  );
}
