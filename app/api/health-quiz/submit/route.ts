import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";

interface QuizSubmitBody {
  form_id: string;
  quiz_type: "women" | "men";
  name: string;
  email: string;
  phone?: string;
  consent: boolean;
  score: number;
  max_score: number;
  severity: string;
  severity_label: string;
  answers: Record<string, string>;
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "—" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as QuizSubmitBody;
    const {
      form_id,
      quiz_type,
      name,
      email,
      phone,
      consent,
      score,
      max_score,
      severity,
      severity_label,
      answers,
    } = body;

    if (!form_id || !name?.trim() || !email?.trim()) {
      return NextResponse.json(
        { error: "form_id, name and email are required" },
        { status: 400 },
      );
    }

    // CRM columns (lead_source, pipeline_stage) were added in a later migration
    // and aren't in the auto-generated Supabase types yet, so we widen the
    // client locally with `any` — consistent with other CRM call sites.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = serverClient() as any;

    // Ensure the intake_form row exists. The seed migration may not have been
    // applied in this environment; without the row the FK on intake_submissions
    // would reject the insert and the user would see the generic save error.
    const { data: existingForm } = await sb
      .from("intake_forms")
      .select("id")
      .eq("id", form_id)
      .maybeSingle();

    if (!existingForm) {
      const placeholderName =
        quiz_type === "men"
          ? "Men's Hormone Health Quiz"
          : "Women's Hormone Health Quiz";
      const { error: formErr } = await sb.from("intake_forms").insert({
        id: form_id,
        name: placeholderName,
        description: `Public hormone-health questionnaire (${quiz_type}).`,
        questions: [],
        active: true,
      });
      if (formErr) {
        console.error("health-quiz: failed to create intake_form", formErr);
        return NextResponse.json({ error: "Form not available" }, { status: 500 });
      }
    }

    const submissionData: Record<string, string> = {
      ...answers,
      _quiz_type: quiz_type,
      _score: String(score),
      _max_score: String(max_score),
      _severity: severity,
      _severity_label: severity_label,
      _follow_up_consent: consent ? "yes" : "no",
    };
    if (phone?.trim()) submissionData._phone = phone.trim();

    let patientId: string | null = null;

    // If consent given, create or update a patient (contact) so staff can follow up.
    if (consent) {
      const cleanEmail = email.trim().toLowerCase();
      const { data: existingPatient } = await sb
        .from("patients")
        .select("id, lead_source, notes")
        .ilike("email", cleanEmail)
        .maybeSingle();

      const quizNote = `Hormone Health Quiz (${quiz_type}) — ${severity_label}: ${score}/${max_score}`;

      if (existingPatient) {
        patientId = existingPatient.id;
        const mergedNotes = existingPatient.notes
          ? `${existingPatient.notes}\n\n${quizNote}`
          : quizNote;
        await sb
          .from("patients")
          .update({
            phone: phone?.trim() || undefined,
            notes: mergedNotes,
            tags: ["health-quiz", `quiz-${quiz_type}`, `severity-${severity}`],
          })
          .eq("id", existingPatient.id);
      } else {
        const { first, last } = splitName(name);
        const { data: created, error: pErr } = await sb
          .from("patients")
          .insert({
            first_name: first,
            last_name: last,
            email: cleanEmail,
            phone: phone?.trim() || null,
            lead_source: "Hormone Health Quiz",
            pipeline_stage: "new_lead",
            status: "active",
            gender: quiz_type === "men" ? "male" : "female",
            notes: quizNote,
            tags: ["health-quiz", `quiz-${quiz_type}`, `severity-${severity}`],
          })
          .select("id")
          .single();
        if (pErr) {
          console.error("health-quiz: failed to create patient", pErr);
        } else {
          patientId = created.id;
        }
      }
    }

    const { error: subErr } = await sb.from("intake_submissions").insert({
      form_id,
      patient_id: patientId,
      patient_name: name.trim(),
      patient_email: email.trim() || null,
      submission_data: submissionData,
      completion_status: "submitted",
      review_status: "pending",
      submitted_at: new Date().toISOString(),
    });

    if (subErr) {
      console.error("health-quiz: failed to insert submission", subErr);
      return NextResponse.json(
        { error: "Failed to save submission" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, patient_id: patientId });
  } catch (err) {
    console.error("health-quiz: unexpected error", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
