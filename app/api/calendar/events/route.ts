import { NextRequest, NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/providers";

export async function GET(req: NextRequest) {
  try {
    const active = await getActiveProvider();
    if (!active) {
      return NextResponse.json(
        { error: "No mail provider connected", code: "no_provider" },
        { status: 400 },
      );
    }

    // Reject early when the stored token doesn't carry calendar scope so
    // we return a clear "please reconnect" instead of a generic 500 after
    // Google/Microsoft refuses the API call.
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

    const url = new URL(req.url);
    const start = url.searchParams.get("start") ?? undefined;
    const end = url.searchParams.get("end") ?? undefined;

    const events = await active.provider.getCalendarEvents({ start, end });
    return NextResponse.json({ provider: active.provider.name, events });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[calendar/events] failed:", msg);
    return NextResponse.json(
      { error: msg, code: "provider_error" },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      subject: string;
      start: string;
      end: string;
      body?: string;
      attendees?: string[];
    };
    if (!body.subject || !body.start || !body.end) {
      return NextResponse.json({ error: "Missing required fields: subject, start, end" }, { status: 400 });
    }
    const active = await getActiveProvider();
    if (!active) return NextResponse.json({ error: "No mail provider connected" }, { status: 400 });

    const event = await active.provider.createCalendarEvent(body);
    return NextResponse.json({ provider: active.provider.name, event });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
