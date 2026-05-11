import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { getActiveProvider } from "@/lib/providers";

interface AppointmentRow {
  id: string;
  patient_id: string | null;
  subject: string;
  description: string | null;
  start_at: string;
  end_at: string;
  status: "scheduled" | "cancelled" | "completed";
  attendee_emails: string[];
  provider: "google" | "microsoft" | null;
  external_event_id: string | null;
  external_event_link: string | null;
  meeting_link: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateBody {
  patient_id?: string | null;
  subject: string;
  description?: string;
  start_at: string;        // ISO
  end_at: string;          // ISO
  attendee_emails?: string[];
  /** When false, only persist locally (don't push to Google/Microsoft). */
  push_to_calendar?: boolean;
}

export async function GET(req: NextRequest) {
  const sb = serverClient();
  const url = new URL(req.url);
  const patientId = url.searchParams.get("patient_id");
  const status = url.searchParams.get("status"); // "upcoming" | "past" | "cancelled" | "all"
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 500);

  let q = (sb as any)
    .from("appointments")
    .select("*, patients(id, first_name, last_name, email)")
    .order("start_at", { ascending: false })
    .limit(limit);

  if (patientId) q = q.eq("patient_id", patientId);

  if (status === "upcoming") {
    q = q.eq("status", "scheduled").gte("start_at", new Date().toISOString());
  } else if (status === "past") {
    q = q.lt("start_at", new Date().toISOString());
  } else if (status === "cancelled") {
    q = q.eq("status", "cancelled");
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ appointments: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = serverClient();
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.subject?.trim() || !body.start_at || !body.end_at) {
    return NextResponse.json(
      { error: "Missing required fields: subject, start_at, end_at" },
      { status: 400 },
    );
  }
  if (new Date(body.end_at).getTime() <= new Date(body.start_at).getTime()) {
    return NextResponse.json({ error: "end_at must be after start_at" }, { status: 400 });
  }

  // If a patient is named, auto-add their email to the attendee list so they
  // get the calendar invite. Caller can override by passing attendee_emails
  // explicitly.
  let attendeeEmails = body.attendee_emails ?? [];
  if (body.patient_id && attendeeEmails.length === 0) {
    const { data: p } = await sb
      .from("patients")
      .select("email")
      .eq("id", body.patient_id)
      .maybeSingle();
    if (p?.email) attendeeEmails = [p.email];
  }

  // Push to the connected calendar first. If the provider write fails we
  // still persist locally so the appointment isn't silently lost — the row
  // just lacks a provider/external_event_id and the user can retry.
  let providerName: "google" | "microsoft" | null = null;
  let externalId: string | null = null;
  let externalLink: string | null = null;
  let meetingLink: string | null = null;
  let pushError: string | null = null;
  const shouldPush = body.push_to_calendar !== false;

  if (shouldPush) {
    try {
      const active = await getActiveProvider();
      if (active) {
        const created = await active.provider.createCalendarEvent({
          subject: body.subject.trim(),
          body: body.description ?? "",
          start: body.start_at,
          end: body.end_at,
          attendees: attendeeEmails,
        });
        providerName = active.provider.name;
        externalId = created.id ?? null;
        externalLink = (created as { htmlLink?: string }).htmlLink ?? null;
        meetingLink = (created as { meetingLink?: string }).meetingLink ?? null;
      }
    } catch (err) {
      pushError = err instanceof Error ? err.message : "Calendar push failed";
    }
  }

  // Fallback: if the provider didn't return a join URL but the user typed
  // one in the description (Zoom, custom Meet, etc.), extract the first URL.
  if (!meetingLink && body.description) {
    const m = body.description.match(/https?:\/\/[^\s<>"')]+/);
    if (m) meetingLink = m[0];
  }

  const { data: row, error } = await (sb as any)
    .from("appointments")
    .insert({
      patient_id: body.patient_id ?? null,
      subject: body.subject.trim(),
      description: body.description ?? null,
      start_at: body.start_at,
      end_at: body.end_at,
      attendee_emails: attendeeEmails,
      status: "scheduled",
      provider: providerName,
      external_event_id: externalId,
      external_event_link: externalLink,
      meeting_link: meetingLink,
    })
    .select("*, patients(id, first_name, last_name, email)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    appointment: row as AppointmentRow,
    pushed_to_calendar: !!externalId,
    push_error: pushError,
  });
}
