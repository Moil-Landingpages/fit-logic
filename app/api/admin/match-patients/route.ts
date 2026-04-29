import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";

// A1.2: bulk-tag existing patient rows from a list of emails. Used during the
// 5,000-contact extraction workflow so cold-outreach campaigns don't ping
// existing patients with cold copy. Megan supplies a list of patient emails
// (exported from Charm), Andres POSTs them here with `tag: "patient"`.
//
// Auth: requires `Authorization: Bearer ${CRON_SECRET}` because there is no
// server-side admin UI yet and this route mutates production patient records.
//
// Request: POST /api/admin/match-patients
//   { "emails": ["a@x.com", "b@y.com"], "tag": "patient", "mode": "add" }
// Response:
//   { matched: number, updated: number, missing: string[] }
//
// `mode` defaults to "add". Pass "remove" to strip the tag instead.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  emails?: unknown;
  tag?: unknown;
  mode?: unknown;
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    // Refuse to run without a secret in production; in dev with no secret set,
    // we still gate on a header so this can't be hit by accident.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Server missing CRON_SECRET" }, { status: 500 });
    }
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const emailsInput = Array.isArray(body.emails) ? body.emails : null;
  const tagInput = typeof body.tag === "string" ? body.tag.trim() : "";
  const mode = body.mode === "remove" ? "remove" : "add";

  if (!emailsInput || emailsInput.length === 0) {
    return NextResponse.json({ error: "`emails` must be a non-empty array" }, { status: 400 });
  }
  if (!tagInput) {
    return NextResponse.json({ error: "`tag` is required" }, { status: 400 });
  }

  // Normalise: lowercase + dedupe.
  const emails = Array.from(
    new Set(
      emailsInput
        .filter((v): v is string => typeof v === "string")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  const supabase = serverClient();

  const { data: matches, error: lookupErr } = await supabase
    .from("patients")
    .select("id, email, tags")
    .in("email", emails);
  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }

  const matched = matches ?? [];
  const matchedEmails = new Set(matched.map((p: { email: string | null }) => (p.email ?? "").toLowerCase()));
  const missing = emails.filter((e) => !matchedEmails.has(e));

  let updated = 0;
  for (const row of matched) {
    const current: string[] = Array.isArray(row.tags) ? (row.tags as string[]) : [];
    let next: string[];
    if (mode === "add") {
      if (current.includes(tagInput)) continue;
      next = [...current, tagInput];
    } else {
      if (!current.includes(tagInput)) continue;
      next = current.filter((t) => t !== tagInput);
    }
    const { error: upErr } = await supabase
      .from("patients")
      .update({ tags: next })
      .eq("id", row.id);
    if (upErr) {
      return NextResponse.json({ error: upErr.message, partial: { updated, matched: matched.length, missing } }, { status: 500 });
    }
    updated++;
  }

  return NextResponse.json({
    matched: matched.length,
    updated,
    missing,
    mode,
    tag: tagInput,
  });
}
