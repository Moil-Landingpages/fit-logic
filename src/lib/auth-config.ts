/**
 * Authentication configuration.
 *
 * ALLOWED_DOMAINS controls which email domains can sign up.
 * Update this list when onboarding new organisations.
 * Set to an empty array to allow any domain.
 */
export const ALLOWED_DOMAINS: string[] = [
  "moilapp.com",
  "fitlogic.com",
];

/** Returns `true` when the email's domain is in the allow-list (or the list is empty). */
export function isAllowedDomain(email: string): boolean {
  if (ALLOWED_DOMAINS.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && ALLOWED_DOMAINS.includes(domain);
}

/** Human-readable string of allowed domains for error messages. */
export function allowedDomainsLabel(): string {
  return ALLOWED_DOMAINS.map((d) => `@${d}`).join(" or ");
}
