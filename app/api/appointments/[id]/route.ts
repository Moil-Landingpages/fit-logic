import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { getActiveProvider } from "@/lib/providers";

interface PatchBody {
  status?: "scheduled" | "cancelled" | "completed";
  subject?: string;
  description?: string;
  start_at?: string;
  end_at?: string;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const sb = serverClient();
  const id = params.id;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Cancel = also delete from the connected calendar (best-effort).
  if (body.status === "cancelled") {
    const { data: existing } = await (sb as any)
      .from("appointments")
      .select("provider, external_event_id, status")
      .eq("id", id)
      .maybeSingle();
    if (existing?.status === "cancelled") {
      return NextResponse.json({ ok: true, already_cancelled: true });
    }
    if (existing?.provider && existing?.external_event_id) {
      try {
        const active = await getActiveProvider();
        if (active && active.provider.name === existing.provider) {
          await active.provider.deleteCalendarEvent(existing.external_event_id);
        }
      } catch (err) {
        // Don't block the local cancel — surface the warning so the UI can
        // tell the user to remove it from their calendar manually.
        const msg = err instanceof Error ? err.message : "Calendar delete failed";
        const { error } = await (sb as any)
          .from("appointments")
          .update({ status: "cancelled" })
          .eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, calendar_warning: msg });
      }
    }
  }

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.subject !== undefined) updates.subject = body.subject;
  if (body.description !== undefined) updates.description = body.description;
  if (body.start_at !== undefined) updates.start_at = body.start_at;
  if (body.end_at !== undefined) updates.end_at = body.end_at;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await (sb as any)
    .from("appointments")
    .update(updates)
    .eq("id", id)
    .select("*, patients(id, first_name, last_name, email)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ appointment: data });
}
