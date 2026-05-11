import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { getActiveProvider } from "@/lib/providers";

export async function POST() {
  const sb = serverClient();
  try {
    const active = await getActiveProvider();
    if (!active) {
      return NextResponse.json({ error: "No mail provider connected" }, { status: 400 });
    }
    const { provider } = active;
    const sourceTag = provider.name === "google" ? "gmail" : "outlook";

    const [patientsRes, existingRes] = await Promise.all([
      sb.from("patients").select("id, email, first_name, last_name"),
      sb.from("inquiries").select("source_id").eq("source", sourceTag),
    ]);

    const patientsByEmail = new Map(
      ((patientsRes.data ?? []) as any[])
        .filter((p) => p.email)
        .map((p) => [p.email.toLowerCase(), p]),
    );
    const existingIds = new Set(((existingRes.data ?? []) as any[]).map((i) => i.source_id));

    const messages = await provider.getEmails({ max: 50 });
    const fresh = messages.filter((m) => !existingIds.has(m.id));
    if (!fresh.length) return NextResponse.json({ synced: 0, message: "No new emails" });

    const enriched = fresh.map((m) => {
      const patient = patientsByEmail.get(m.from);
      return {
        msg: m,
        row: {
          source: sourceTag,
          source_id: m.id,
          patient_id: patient?.id ?? null,
          patient_name: patient ? `${patient.first_name} ${patient.last_name}`.trim() : m.fromName,
          patient_email: m.from,
          // raw_content stays plain-text for back-compat (search, list preview).
          raw_content: `${m.subject}\n\n${m.bodyText}`,
          status: "pending",
          category: "General_Info",
        },
      };
    });

    let inserted = 0;
    for (const { msg, row } of enriched) {
      const { data: insertedRow, error } = await sb
        .from("inquiries")
        .insert(row as never)
        .select("id")
        .single();
      if (error) {
        if (error.code !== "23505") console.error("inquiry insert error", error);
        continue;
      }
      inserted++;

      // Persist the inbound message in the thread table so InquiryDetail
      // renders the HTML version properly. The synthetic fallback in the
      // UI only sees raw_content (plain text) and can't recover the HTML
      // once it's been stripped — so the rich body has to be saved here.
      const inquiryId = (insertedRow as { id: string } | null)?.id;
      if (inquiryId) {
        const { error: msgErr } = await (sb as any).from("inquiry_messages").insert({
          inquiry_id: inquiryId,
          direction: "inbound",
          from_name: msg.fromName,
          from_email: msg.from,
          subject: msg.subject,
          body_text: msg.bodyText,
          body_html: msg.bodyHtml ?? null,
          provider: provider.name,
          message_id: msg.id,
          status: "received",
          created_at: msg.receivedAt,
        });
        if (msgErr) console.warn("inquiry_messages insert error", msgErr);
      }
    }

    const matched = enriched.filter((r) => r.row.patient_id).length;
    return NextResponse.json({
      synced: inserted,
      contacts_matched: matched,
      unknown_senders: enriched.length - matched,
    });
  } catch (err) {
    console.error("mail/sync error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
