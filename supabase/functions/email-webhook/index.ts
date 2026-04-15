import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Webhook endpoints are server-to-server — no browser CORS needed.
// We accept any origin but only after validating the provider signature.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-webhook-signature, svix-id, svix-timestamp, svix-signature",
};

// ---------------------------------------------------------------------------
// Signature verification helpers
// ---------------------------------------------------------------------------

/** Verify Resend webhook signature (HMAC-SHA256 via Svix) */
async function verifyResendSignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) return true; // secret not configured — skip (warn in logs)

  const msgId        = req.headers.get("svix-id") ?? "";
  const msgTimestamp = req.headers.get("svix-timestamp") ?? "";
  const msgSig       = req.headers.get("svix-signature") ?? "";

  if (!msgId || !msgTimestamp || !msgSig) return false;

  // Reject messages older than 5 minutes
  const ts = parseInt(msgTimestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const toSign  = `${msgId}.${msgTimestamp}.${rawBody}`;
  const keyBytes = base64Decode(secret.replace(/^whsec_/, ""));
  const key      = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig      = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
  const computed = "v1," + btoa(String.fromCharCode(...new Uint8Array(sig)));

  return msgSig.split(" ").some((s) => s === computed);
}

/** Verify SendGrid webhook signature (ECDSA P-256) */
async function verifySendGridSignature(req: Request, rawBody: string): Promise<boolean> {
  const publicKey = Deno.env.get("SENDGRID_WEBHOOK_PUBLIC_KEY");
  if (!publicKey) return true; // secret not configured — skip

  const signature = req.headers.get("x-twilio-email-event-webhook-signature") ?? "";
  const timestamp = req.headers.get("x-twilio-email-event-webhook-timestamp") ?? "";

  if (!signature || !timestamp) return false;

  try {
    const payload = timestamp + rawBody;
    const keyDer  = base64Decode(publicKey);
    const key     = await crypto.subtle.importKey(
      "spki", keyDer, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]
    );
    const sigBytes = base64Decode(signature);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, key, sigBytes, new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}

function base64Decode(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// Suppression helper
// ---------------------------------------------------------------------------
async function suppress(email: string, reason: string, campaignId?: string) {
  await supabase.from("email_suppressions").upsert(
    { email: email.toLowerCase(), reason, campaign_id: campaignId ?? null },
    { onConflict: "email", ignoreDuplicates: false }
  );
}

// ---------------------------------------------------------------------------
// campaign_send_log helpers
// ---------------------------------------------------------------------------
async function markBounced(trackingId: string, bounceType: string) {
  await supabase
    .from("campaign_send_log")
    .update({ status: "bounced", bounce_type: bounceType })
    .eq("tracking_id", trackingId);
}

async function markComplained(trackingId: string) {
  await supabase
    .from("campaign_send_log")
    .update({ status: "complained", complaint_at: new Date().toISOString() })
    .eq("tracking_id", trackingId);
}

async function markOpened(trackingId: string) {
  const { data } = await supabase
    .from("campaign_send_log")
    .select("id, opened_at")
    .eq("tracking_id", trackingId)
    .maybeSingle();
  if (data && !data.opened_at) {
    await supabase
      .from("campaign_send_log")
      .update({ status: "opened", opened_at: new Date().toISOString() })
      .eq("tracking_id", trackingId);
  }
}

async function markClicked(trackingId: string) {
  const { data } = await supabase
    .from("campaign_send_log")
    .select("id, clicked_at")
    .eq("tracking_id", trackingId)
    .maybeSingle();
  if (data && !data.clicked_at) {
    await supabase
      .from("campaign_send_log")
      .update({ status: "clicked", clicked_at: new Date().toISOString() })
      .eq("tracking_id", trackingId);
  }
}

// ---------------------------------------------------------------------------
// Update campaign stats after any delivery event
// ---------------------------------------------------------------------------
async function updateCampaignStats(campaignId: string) {
  const { data: rows } = await supabase
    .from("campaign_send_log")
    .select("status, opened_at, clicked_at, bounce_type, complaint_at")
    .eq("campaign_id", campaignId);

  if (!rows) return;

  const stats = {
    sent:       rows.filter((r) => r.status !== "failed").length,
    opened:     rows.filter((r) => r.opened_at).length,
    clicked:    rows.filter((r) => r.clicked_at).length,
    bounced:    rows.filter((r) => r.status === "bounced").length,
    complained: rows.filter((r) => r.complaint_at).length,
    failed:     rows.filter((r) => r.status === "failed").length,
  };

  await supabase.from("campaigns").update({ stats }).eq("id", campaignId);
}

// ---------------------------------------------------------------------------
// Get campaign_id from tracking_id
// ---------------------------------------------------------------------------
async function getCampaignId(trackingId: string): Promise<string | null> {
  const { data } = await supabase
    .from("campaign_send_log")
    .select("campaign_id")
    .eq("tracking_id", trackingId)
    .maybeSingle();
  return data?.campaign_id ?? null;
}

// ---------------------------------------------------------------------------
// Resend webhook handler
// ---------------------------------------------------------------------------
async function handleResend(events: unknown[]) {
  for (const event of events) {
    const e = event as Record<string, unknown>;
    const type = e.type as string;
    const data = (e.data ?? {}) as Record<string, unknown>;
    const trackingId = (data.tags as Record<string, string> | undefined)?.tracking_id;
    const email = data.to as string | undefined;

    if (!trackingId) continue;

    if (type === "email.bounced") {
      const bounceType = (data.bounce as Record<string, string> | undefined)?.type === "permanent"
        ? "hard_bounce"
        : "soft_bounce";
      await markBounced(trackingId, bounceType);
      if (email && bounceType === "hard_bounce") {
        const cid = await getCampaignId(trackingId);
        await suppress(email, "hard_bounce", cid ?? undefined);
      }
      const cid = await getCampaignId(trackingId);
      if (cid) await updateCampaignStats(cid);
    } else if (type === "email.complained") {
      await markComplained(trackingId);
      if (email) {
        const cid = await getCampaignId(trackingId);
        await suppress(email, "complaint", cid ?? undefined);
        if (cid) await updateCampaignStats(cid);
      }
    } else if (type === "email.opened") {
      await markOpened(trackingId);
      const cid = await getCampaignId(trackingId);
      if (cid) await updateCampaignStats(cid);
    } else if (type === "email.clicked") {
      await markClicked(trackingId);
      const cid = await getCampaignId(trackingId);
      if (cid) await updateCampaignStats(cid);
    }
  }
}

// ---------------------------------------------------------------------------
// SendGrid webhook handler
// ---------------------------------------------------------------------------
async function handleSendGrid(events: unknown[]) {
  for (const event of events) {
    const e = event as Record<string, unknown>;
    const type = e.event as string;
    const email = e.email as string | undefined;
    const trackingId = e.tracking_id as string | undefined;

    if (!trackingId) continue;

    if (type === "bounce") {
      const bounceType = (e.type as string) === "bounce" ? "hard_bounce" : "soft_bounce";
      await markBounced(trackingId, bounceType);
      if (email && bounceType === "hard_bounce") {
        const cid = await getCampaignId(trackingId);
        await suppress(email, "hard_bounce", cid ?? undefined);
      }
      const cid = await getCampaignId(trackingId);
      if (cid) await updateCampaignStats(cid);
    } else if (type === "spamreport") {
      await markComplained(trackingId);
      if (email) {
        const cid = await getCampaignId(trackingId);
        await suppress(email, "complaint", cid ?? undefined);
        if (cid) await updateCampaignStats(cid);
      }
    } else if (type === "open") {
      await markOpened(trackingId);
      const cid = await getCampaignId(trackingId);
      if (cid) await updateCampaignStats(cid);
    } else if (type === "click") {
      await markClicked(trackingId);
      const cid = await getCampaignId(trackingId);
      if (cid) await updateCampaignStats(cid);
    }
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Detect provider by payload shape
    const isResend = Array.isArray(body)
      ? (body[0] as Record<string, unknown>)?.type?.toString().startsWith("email.")
      : (body as Record<string, unknown>)?.type?.toString().startsWith("email.");

    // Verify provider signature before processing
    if (isResend) {
      const valid = await verifyResendSignature(req, rawBody);
      if (!valid) {
        console.warn("Resend webhook signature verification failed");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const valid = await verifySendGridSignature(req, rawBody);
      if (!valid) {
        console.warn("SendGrid webhook signature verification failed");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const events: unknown[] = Array.isArray(body) ? body : [body];

    if (isResend) {
      await handleResend(events);
    } else {
      await handleSendGrid(events);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("email-webhook error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
