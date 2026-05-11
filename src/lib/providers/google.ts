import type { MailProvider, NormalizedEmail, SendEmailInput, CalendarEvent } from "./types";

interface GoogleCtx {
  accessToken: string;
  refreshAccessToken: () => Promise<string | null>;
}

function decodeBase64(data: string): string {
  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    return decodeURIComponent(escape(atob(normalized)));
  } catch { return ""; }
}

function extractEmail(raw: string): string {
  const m = raw.match(/<(.+?)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

async function withRetry<T>(ctx: GoogleCtx, fn: (token: string) => Promise<Response>): Promise<T> {
  let token = ctx.accessToken;
  let res = await fn(token);
  if (res.status === 401) {
    const fresh = await ctx.refreshAccessToken();
    if (!fresh) throw new Error("Google token refresh failed");
    token = fresh;
    res = await fn(token);
  }
  if (!res.ok) throw new Error(`Google API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export function googleProvider(ctx: GoogleCtx): MailProvider {
  return {
    name: "google",

    async getEmails({ max = 25 } = {}) {
      const list = await withRetry<{ messages?: { id: string }[] }>(ctx, (t) =>
        fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&labelIds=INBOX`,
          { headers: { Authorization: `Bearer ${t}` } }));
      const ids = (list.messages ?? []).map((m) => m.id);
      const out: NormalizedEmail[] = [];
      for (const id of ids) {
        const d = await withRetry<any>(ctx, (t) =>
          fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
            { headers: { Authorization: `Bearer ${t}` } }));
        const headers = d.payload.headers as { name: string; value: string }[];
        const from = headers.find((h) => h.name === "From")?.value ?? "";
        const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";

        // Walk the MIME tree depth-first and capture both text/plain and
        // text/html parts. Without this we used to fall back to whichever
        // part Gmail listed first — which for HTML emails meant we'd store
        // raw HTML inside what the rest of the app treats as plain text.
        const bodies = { text: "", html: "" };
        const walk = (node: any) => {
          if (!node) return;
          const mt: string | undefined = node.mimeType;
          if (mt === "text/plain" && node.body?.data && !bodies.text) {
            bodies.text = decodeBase64(node.body.data);
          } else if (mt === "text/html" && node.body?.data && !bodies.html) {
            bodies.html = decodeBase64(node.body.data);
          }
          if (Array.isArray(node.parts)) node.parts.forEach(walk);
        };
        walk(d.payload);
        // Single-part messages put the body directly on payload.body.
        if (!bodies.text && !bodies.html && d.payload.body?.data) {
          const raw = decodeBase64(d.payload.body.data);
          if (d.payload.mimeType === "text/html") bodies.html = raw;
          else bodies.text = raw;
        }
        // Derive a plain-text version from HTML when only HTML was sent —
        // the inquiry preview still expects something readable.
        if (!bodies.text && bodies.html) {
          bodies.text = bodies.html
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
        if (!bodies.text) bodies.text = d.snippet ?? "";

        out.push({
          id: d.id,
          threadId: d.threadId,
          from: extractEmail(from),
          fromName: from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || extractEmail(from),
          subject,
          bodyText: bodies.text,
          bodyHtml: bodies.html || undefined,
          receivedAt: new Date(parseInt(d.internalDate, 10)).toISOString(),
        });
      }
      return out;
    },

    async sendEmail(input, fromAddress, fromName) {
      const boundary = `b_${Math.random().toString(36).slice(2)}`;
      const subj = `=?UTF-8?B?${Buffer.from(input.subject).toString("base64")}?=`;
      const text = input.text ?? input.html.replace(/<[^>]+>/g, "");
      const mime = `From: ${fromName} <${fromAddress}>\r\nTo: ${input.toName || input.to} <${input.to}>\r\nSubject: ${subj}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${text}\r\n--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${input.html}\r\n--${boundary}--`;
      const raw = Buffer.from(mime).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const r = await withRetry<{ id: string }>(ctx, (t) =>
        fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw }),
        }));
      return { id: r.id };
    },

    async getCalendarEvents({ start, end } = {}) {
      const params = new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime",
        timeMin: start ?? new Date().toISOString(),
        ...(end ? { timeMax: end } : {}),
        maxResults: "50",
      });
      const data = await withRetry<{ items?: any[] }>(ctx, (t) =>
        fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
          { headers: { Authorization: `Bearer ${t}` } }));
      return (data.items ?? []).map((e: any): CalendarEvent => ({
        id: e.id,
        subject: e.summary ?? "(no title)",
        start: e.start?.dateTime ?? e.start?.date ?? "",
        end: e.end?.dateTime ?? e.end?.date ?? "",
        body: e.description,
        attendees: (e.attendees ?? []).map((a: any) => a.email),
      }));
    },

    async createCalendarEvent(ev) {
      // Request a Google Meet conference. The Calendar API only attaches a
      // Meet if both conferenceData.createRequest is sent AND
      // conferenceDataVersion=1 appears on the URL. Recipients get the join
      // link in the invite automatically.
      const requestId = `fl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const body = {
        summary: ev.subject,
        description: ev.body,
        start: { dateTime: ev.start },
        end: { dateTime: ev.end },
        attendees: (ev.attendees ?? []).map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      };
      const data = await withRetry<any>(ctx, (t) =>
        fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1", {
          method: "POST",
          headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }));
      // hangoutLink is the canonical meet.google.com URL. Older accounts
      // without a default conference may not return one, so we fall back to
      // the explicit conferenceData entry point.
      const meetingLink: string | undefined =
        data.hangoutLink
        ?? data.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri;
      return { ...ev, id: data.id, htmlLink: data.htmlLink, meetingLink };
    },

    async deleteCalendarEvent(eventId) {
      // 410 Gone (already deleted) and 404 are not errors for our purposes —
      // we treat the event as absent.
      let token = ctx.accessToken;
      let res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status === 401) {
        const fresh = await ctx.refreshAccessToken();
        if (!fresh) throw new Error("Google token refresh failed");
        token = fresh;
        res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
          { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
        );
      }
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        throw new Error(`Google delete failed ${res.status}: ${await res.text()}`);
      }
    },
  };
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  return res.json();
}
