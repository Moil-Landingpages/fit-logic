/**
 * Centralized React Query key factory.
 * Use these constants everywhere instead of inline string arrays so that
 * invalidateQueries always hits the right cache entries.
 */
export const QK = {
  patients:           ["patients"]            as const,
  campaigns:          ["campaigns"]           as const,
  campaignRecipients: (id: string) => ["campaign_recipients", id] as const,
  campaignSequences:  (id: string) => ["campaign_sequences",  id] as const,
  emailTemplates:     ["email_templates"]     as const,
  segments:           ["segments"]            as const,
  inquiries:          ["inquiries"]           as const,
  referrals:          ["referrals"]           as const,
  intakeSubmissions:  ["intake_submissions"]  as const,
  intakeForms:        ["intake_forms"]        as const,
  faqs:               ["faqs"]               as const,
  staff:              ["staff"]              as const,
  settings:           ["settings"]           as const,
} as const;
