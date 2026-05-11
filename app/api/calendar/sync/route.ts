import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { getActiveProvider } from "@/lib/providers";

/**
 * Pulls events from the connected Google/Microsoft calendar and inserts any
 * that don't already exist in `appointments` as new rows (provider="google"
 * | "microsoft", source=provider event id). Matches existing CRM rows by
 * `external_event_id` to avoid duplicates.
 *
 * Best-effort patient match: events where any attendee email matches a
 * patient in our DB get `patient_id` set automatically.
 */
export async function POST(req: NextRequest) {
  const sb = serverClient();
  const active = await getActiveProvider();
  if (!active) {
    return NextResponse.json(
      { error: "No calendar provider connected", code: "no_provider" },
      { status: 400 },
    );
  }

  // Reject early when the stored token doesn't carry calendar scope so we
  // return a clear "please reconnect" instead of a 13-second timeout when
  // Google/Microsoft refuses the call.
  const scope = (active.row.token_scope ?? "") as string;
  const hasCalendarScope =
    active.provider.name === "google"
      ? /calendar/i.test(scope)
      : /Calendars\.(Read|ReadWrite)/i.test(scope);
  if (!hasCalendarScope) {
    return NextResponse.json(
      {
        error:
          "Connected account doesn't have calendar permission. Disconnect in Settings and reconnect to grant calendar access.",
        code: "missing_scope",
        provider: active.provider.name,
        token_scope: scope,
      },
      { status: 412 },
    );
  }

  // Default window: 30 days back, 90 days forward. Adjustable via query.
  const url = new URL(req.url);
  const now = Date.now();
  const start = url.searchParams.get("start") ?? new Date(now - 30 * 86_400_000).toISOString();
  const end = url.searchParams.get("end") ?? new Date(now + 90 * 86_400_000).toISOString();

  let providerEvents: Awaited<ReturnType<typeof active.provider.getCalendarEvents>>;
  try {
    providerEvents = await active.provider.getCalendarEvents({ start, end });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[calendar/sync] provider fetch failed:", msg);
    // Surface common cases with hints. Token-revoked / scope-missing reach
    // here as 401/403 messages from withRetry after refresh fails.
    const lower = msg.toLowerCase();
    const isAuth = lower.includes("401") || lower.includes("unauthor") || lower.includes("refresh failed");
    const isScope = lower.includes("403") || lower.includes("forbidden") || lower.includes("insufficient");
    return NextResponse.json(
      {
        error: msg,
        code: isAuth ? "auth_failed" : isScope ? "scope_denied" : "provider_error",
        hint: isAuth
          ? "Your token has expired or been revoked. Disconnect and reconnect in Settings."
          : isScope
          ? "The connected account hasn't granted calendar access. Reconnect to grant it."
          : undefined,
        provider: active.provider.name,
      },
      { status: 502 },
    );
  }

  if (!providerEvents.length) {
    return NextResponse.json({ synced: 0, total_provider_events: 0 });
  }

  // Look up which provider IDs we already have stored so we only insert new
  // ones. Match is on (provider, external_event_id) to avoid colliding with
  // appointments synced from a different provider.
  const ids = providerEvents.map((e) => e.id).filter(Boolean) as string[];
  const { data: existing } = await (sb as any)
    .from("appointments")
    .select("external_event_id")
    .eq("provider", active.provider.name)
    .in("external_event_id", ids);
  const existingIds = new Set(
    ((existing ?? []) as { external_event_id: string }[]).map((r) => r.external_event_id),
  );

  const fresh = providerEvents.filter((e) => e.id && !existingIds.has(e.id));
  if (!fresh.length) {
    return NextResponse.json({
      synced: 0,
      total_provider_events: providerEvents.length,
      message: "All provider events already in CRM",
    });
  }

  // Bulk-load patients to match attendees -> patient_id without an N+1.
  const allAttendeeEmails = Array.from(
    new Set(fresh.flatMap((e) => (e.attendees ?? []).map((a) => a.toLowerCase()))),
  );
  const { data: patientRows } = await sb
    .from("patients")
    .select("id, email")
    .in("email", allAttendeeEmails.length ? allAttendeeEmails : ["__none__"]);
  const patientByEmail = new Map<string, string>(
    ((patientRows ?? []) as { id: string; email: string }[])
      .filter((p) => p.email)
      .map((p) => [p.email.toLowerCase(), p.id]),
  );

  const rows = fresh.map((e) => {
    // Pick the first attendee email that matches a known patient. The
    // organiser is in `attendees` too for Microsoft events.
    const attendees = (e.attendees ?? []).map((a) => a.toLowerCase());
    const matchedPatientId =
      attendees.map((email) => patientByEmail.get(email)).find(Boolean) ?? null;

    // Extract a meeting link from the description if the provider didn't
    // attach one to the body. (Google's hangoutLink is only on freshly
    // created events through us, not arbitrary calendar entries.)
    const meetingLink: string | null = (() => {
      const m = (e.body ?? "").match(/https?:\/\/(?:meet\.google\.com|teams\.(?:microsoft|live)\.com|.+zoom\.us)\/[^\s<>"')]+/);
      return m ? m[0] : null;
    })();

    return {
      patient_id: matchedPatientId,
      subject: e.subject || "(no title)",
      description: e.body ?? null,
      start_at: e.start,
      end_at: e.end,
      attendee_emails: attendees,
      status: "scheduled" as const,
      provider: active.provider.name,
      external_event_id: e.id ?? null,
      external_event_link: null,
      meeting_link: meetingLink,
    };
  });

  // Filter out malformed entries (all-day events sometimes come back as a
  // date string with no time component; the appointments check constraint
  // requires end_at > start_at).
  const valid = rows.filter((r) => {
    if (!r.start_at || !r.end_at) return false;
    return new Date(r.end_at).getTime() > new Date(r.start_at).getTime();
  });

  if (!valid.length) {
    return NextResponse.json({
      synced: 0,
      total_provider_events: providerEvents.length,
      skipped: rows.length,
    });
  }

  const { error, count } = await (sb as any)
    .from("appointments")
    .insert(valid, { count: "exact" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    synced: count ?? valid.length,
    total_provider_events: providerEvents.length,
    skipped: rows.length - valid.length,
    matched_to_contacts: valid.filter((r) => r.patient_id).length,
    provider: active.provider.name,
  });
}
