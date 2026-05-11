export type ProviderName = "google" | "microsoft";

export interface NormalizedEmail {
  id: string;
  threadId?: string;
  from: string;
  fromName: string;
  subject: string;
  /** Plain-text version. Always populated (extracted, derived, or snippet). */
  bodyText: string;
  /** Raw HTML version when the provider returned a text/html part. */
  bodyHtml?: string;
  receivedAt: string;
}

export interface SendEmailInput {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: string; mimeType: string }[];
}

export interface CalendarEvent {
  id?: string;
  subject: string;
  start: string; // ISO
  end: string;   // ISO
  body?: string;
  attendees?: string[];
}

export interface MailProvider {
  name: ProviderName;
  sendEmail(input: SendEmailInput, fromAddress: string, fromName: string): Promise<{ id: string }>;
  getEmails(opts?: { max?: number }): Promise<NormalizedEmail[]>;
  getCalendarEvents(opts?: { start?: string; end?: string }): Promise<CalendarEvent[]>;
  /**
   * Returns the created event with `id` populated and, when available,
   * `htmlLink` (URL to open the event in the provider's UI) and
   * `meetingLink` (Meet/Teams join URL when the event has conferencing).
   */
  createCalendarEvent(ev: CalendarEvent): Promise<CalendarEvent & { htmlLink?: string; meetingLink?: string }>;
  /** Best-effort delete on the provider's calendar; throws on transport failure. */
  deleteCalendarEvent(eventId: string): Promise<void>;
}

export interface ProviderConnection {
  provider: ProviderName;
  provider_email: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expiry: string;
  microsoft_tenant?: string | null;
}
