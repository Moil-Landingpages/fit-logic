/**
 * Centralized React Query key factory.
 * Use these constants everywhere instead of inline string arrays so that
 * invalidateQueries always hits the right cache entries.
 */
export const QK = {
  patients:           ["patients"]            as const,
  contactCampaigns:   (id: string | undefined) => ["contact-campaigns", id] as const,
  campaigns:          ["campaigns"]           as const,
  campaignRecipients: (id: string) => ["campaign_recipients", id] as const,
  campaignSequences:  (id: string) => ["campaign_sequences",  id] as const,
  campaignSendLog:    (id: string) => ["campaign_send_log",   id] as const,
  campaignTemplate:   (id: string | null | undefined) => ["campaign_template", id] as const,
  customersForCampaign: ["customers-for-campaign"] as const,
  patientsForSegment: (id: string | null | undefined) => ["patients-for-segment", id] as const,
  activeCampaignEmails: (id: string | undefined) => ["active-campaign-emails", id] as const,
  emailTemplates:     ["email_templates"]     as const,
  segments:           ["segments"]            as const,
  inquiries:          ["inquiries"]           as const,
  referrals:          ["referrals"]           as const,
  intakeSubmissions:  ["intake_submissions"]  as const,
  intakeForms:        ["intake_forms"]        as const,
  faqs:               ["faqs"]               as const,
  staff:              ["staff"]              as const,
  settings:           ["settings"]           as const,
  suppressions:       ["email_suppressions"] as const,
  sendLogAnalytics:   ["send_log_analytics"] as const,
  patientTimeline:    (id: string) => ["patient-timeline", id] as const,
} as const;
