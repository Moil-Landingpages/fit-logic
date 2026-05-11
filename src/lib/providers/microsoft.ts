import type { MailProvider, NormalizedEmail, SendEmailInput, CalendarEvent } from "./types";

interface MsCtx {
  accessToken: string;
  tenant: string; // "common", "consumers", "organizations", or specific tenant id
  refreshAccessToken: () => Promise<string | null>;
}

const GRAPH = "https://graph.microsoft.com/v1.0";

async function withRetry<T>(ctx: MsCtx, fn: (t: string) => Promise<Response>): Promise<T> {
  let token = ctx.accessToken;
  let res = await fn(token);
  if (res.status === 401) {
    const fresh = await ctx.refreshAccessToken();
    if (!fresh) throw new Error("Microsoft token refresh failed");
    token = fresh;
    res = await fn(token);
  }
  if (!res.ok) throw new Error(`Microsoft Graph error ${res.status}: ${await res.text()}`);
  // Some endpoints return 202/204 with no body
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

function htmlToText(html: string): string {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").trim();
}

export function microsoftProvider(ctx: MsCtx): MailProvider {
  return {
    name: "microsoft",

    async getEmails({ max = 25 } = {}) {
      const data = await withRetry<{ value: any[] }>(ctx, (t) =>
        fetch(`${GRAPH}/me/mailFolders/Inbox/messages?$top=${max}&$select=id,subject,from,bodyPreview,body,receivedDateTime,conversationId&$orderby=receivedDateTime desc`,
          { headers: { Authorization: `Bearer ${t}` } }));
      return (data.value ?? []).map((m): NormalizedEmail => {
        const isHtml = m.body?.contentType === "html";
        const raw: string = m.body?.content ?? m.bodyPreview ?? "";
        return {
          id: m.id,
          threadId: m.conversationId,
          from: (m.from?.emailAddress?.address ?? "").toLowerCase(),
          fromName: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "",
          subject: m.subject ?? "(no subject)",
          bodyText: isHtml ? htmlToText(raw) : raw,
          bodyHtml: isHtml ? raw : undefined,
          receivedAt: m.receivedDateTime,
        };
      });
    },

    async sendEmail(input, fromAddress) {
      const message = {
        message: {
          subject: input.subject,
          body: { contentType: "HTML", content: input.html },
          toRecipients: [{ emailAddress: { address: input.to, name: input.toName } }],
          attachments: (input.attachments ?? []).map((a) => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: a.filename,
            contentType: a.mimeType,
            contentBytes: a.content,
          })),
        },
        saveToSentItems: true,
      };
      const r = await fetch(`${GRAPH}/me/sendMail`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      if (r.status === 401) {
        const fresh = await ctx.refreshAccessToken();
        if (!fresh) throw new Error("Microsoft token refresh failed");
        const r2 = await fetch(`${GRAPH}/me/sendMail`, {
          method: "POST",
          headers: { Authorization: `Bearer ${fresh}`, "Content-Type": "application/json" },
          body: JSON.stringify(message),
        });
        if (!r2.ok) throw new Error(`Graph sendMail failed: ${await r2.text()}`);
      } else if (!r.ok) {
        throw new Error(`Graph sendMail failed: ${await r.text()}`);
      }
      // sendMail returns 202 with no id; synthesize one
      return { id: `ms_${Date.now()}_${fromAddress}` };
    },

    async getCalendarEvents({ start, end } = {}) {
      const startISO = start ?? new Date().toISOString();
      const endISO = end ?? new Date(Date.now() + 30 * 86400_000).toISOString();
      const data = await withRetry<{ value: any[] }>(ctx, (t) =>
        fetch(`${GRAPH}/me/calendarView?startDateTime=${encodeURIComponent(startISO)}&endDateTime=${encodeURIComponent(endISO)}&$top=50&$orderby=start/dateTime`,
          { headers: { Authorization: `Bearer ${t}`, Prefer: 'outlook.timezone="UTC"' } }));
      return (data.value ?? []).map((e): CalendarEvent => ({
        id: e.id,
        subject: e.subject ?? "(no title)",
        start: e.start?.dateTime,
        end: e.end?.dateTime,
        body: e.bodyPreview,
        attendees: (e.attendees ?? []).map((a: any) => a.emailAddress?.address).filter(Boolean),
      }));
    },

    async createCalendarEvent(ev) {
      // Request a Teams meeting alongside the event. `isOnlineMeeting=true`
      // + `onlineMeetingProvider="teamsForBusiness"` makes Graph attach a
      // Teams meeting and surface its join URL in `onlineMeeting.joinUrl`.
      const payload = {
        subject: ev.subject,
        body: { contentType: "HTML", content: ev.body ?? "" },
        start: { dateTime: ev.start, timeZone: "UTC" },
        end: { dateTime: ev.end, timeZone: "UTC" },
        attendees: (ev.attendees ?? []).map((a) => ({ emailAddress: { address: a }, type: "required" })),
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
      };
      const data = await withRetry<any>(ctx, (t) =>
        fetch(`${GRAPH}/me/events`, {
          method: "POST",
          headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }));
      const meetingLink: string | undefined =
        data.onlineMeeting?.joinUrl ?? data.onlineMeetingUrl ?? undefined;
      return { ...ev, id: data.id, htmlLink: data.webLink, meetingLink };
    },

    async deleteCalendarEvent(eventId) {
      let token = ctx.accessToken;
      let res = await fetch(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        const fresh = await ctx.refreshAccessToken();
        if (!fresh) throw new Error("Microsoft token refresh failed");
        token = fresh;
        res = await fetch(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        throw new Error(`Graph delete failed ${res.status}: ${await res.text()}`);
      }
    },
  };
}

export async function refreshMicrosoftAccessToken(
  refreshToken: string,
  tenant = "common",
): Promise<{ access_token: string; refresh_token?: string; expires_in: number } | null> {
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "openid profile email offline_access Mail.Read Mail.Send Calendars.ReadWrite",
    }),
  });
  if (!res.ok) {
    console.error("[microsoft] refresh failed", await res.text());
    return null;
  }
  return res.json();
}
