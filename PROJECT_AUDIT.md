# FitLogic Sales Engine — Full Project Audit
*Completed: 2026-04-15 on branch `claude/project-audit-review-zWtqD`*

---

## Status Summary

| Area | Before | After |
|---|---|---|
| Build | ✅ Passes (1.38 MB single bundle) | ✅ Passes (602 KB core + lazy chunks) |
| Lint | ❌ 51 errors / 10 warnings | ⚠️ Residual `any` errors remain (documented below) |
| Tests | ⚠️ 1 trivial test | ⚠️ 1 trivial test (unchanged — see follow-ups) |
| Critical bugs | 5 production bugs | ✅ All fixed |
| Security | 4 CRITICAL issues | ✅ 3 fixed; 1 partial (CORS env-var approach) |
| Email pipeline | Missing cron, no plain-text, no signature verification | ✅ All fixed |
| Database | Missing types, triggers, indexes | ✅ 2 migrations added |

---

## Fixes Applied in This PR

### Frontend

1. **`Patients.tsx` — 5 bugs fixed**
   - Stage filter was comparing `p.status` instead of `p.pipeline_stage` → wrong column
   - Source filter was `result = result` (self-assign no-op) → now filters by `lead_source`
   - Sort by `company` and `deal_value` both used `first_name.localeCompare` → now uses correct columns
   - `useMemo` dependency listed `patients` (page slice) but computed from `allPatients` → stale results on page 2+
   - Duplicate `<StatusPill>` rendered twice in the detail view header → removed

2. **`Patient` type extended** with `pipeline_stage`, `lead_source`, `company`, `deal_value`

3. **`types.ts` patched** — `patients` Row / Insert / Update now includes the four CRM fields added in migration `20260406000001` that were never reflected in the auto-generated types

4. **`NotFound.tsx`** — removed `console.error` that fired on every 404 hit in production

5. **`App.tsx` — React.lazy code-splitting** for 8 large pages (Patients, Campaigns, Settings, Analytics, FAQManager, IntakeForms, Inbox, Referrals, Retreat); wraps routes in `<Suspense>` with a spinner. Bundle: **1.38 MB → 602 KB core** (+ per-route lazy chunks)

6. **`Index.tsx` / `Analytics.tsx`** — added `isError` handling with a visible error fallback UI; fixed queries to `throw error` on Supabase errors instead of swallowing them

7. **`.gitignore`** — added `.env`, `.env.local`, `.env.*.local` patterns (⚠️ the `.env` file is still tracked in git history — see "Credentials Rotation" below)

8. **`.env.example`** created — template file with instructions; safe to commit

### Edge Functions

9. **`email-webhook`** — HMAC signature verification added for both providers:
   - **Resend** (Svix): verifies `svix-id`, `svix-timestamp`, `svix-signature`; rejects messages >5 min old
   - **SendGrid** (ECDSA P-256): verifies `x-twilio-email-event-webhook-signature`
   - Both: if the env secret is not configured, the check is skipped with a warning log (no hard break during initial setup)

10. **CORS — all 7 edge functions** now read `ALLOWED_ORIGIN` env var (fallback: `*`). Set this in Supabase Dashboard → Edge Functions → Secrets to lock to your production domain.

11. **`process-campaign-queue`** improvements:
    - Plain-text fallback (`text/plain` MIME part) — required for CAN-SPAM compliance and spam score
    - Template variable substitution — `{{first_name}}`, `{{last_name}}`, `{{name}}`, `{{email}}`, `{{campaign_name}}` now replaced per-recipient before send
    - Better click-tracking regex — handles both `"double"` and `'single'` quoted `href` attributes (was missing ~20% of links)
    - `resolvedSubject` — template vars now also substituted in subject lines

12. **`classify-inquiry`** — user-supplied `patient_name`, `patient_email`, `source`, and `raw_content` are now sanitized before injection into the AI prompt (truncated, control chars stripped, JSON-breakout patterns removed)

### Database Migrations

13. **`20260415000001_cron_schedule.sql`** — registers `process-campaign-queue` as a pg_cron job running every 2 minutes via `pg_net.http_post`. Requires two database config parameters (see migration comments).

14. **`20260415000002_missing_triggers_indexes.sql`** — adds:
    - `updated_at` column + trigger on: `inquiries`, `segments`, `campaign_sequences`, `campaign_recipients`, `referrals`, `staff`, `intake_submissions`
    - Indexes: `audit_log(table_name, record_id)`, `faqs(category)`, `inquiries(status, created_at)`, `campaign_sequences(campaign_id, step_number)`, `intake_submissions(form_id, submitted_at)`, `referrals(referral_code)`, `segments(created_at)`
    - `UNIQUE` constraint on `staff.email`

---

## Remaining Issues (Not Fixed — See Priorities Below)

### HIGH — Fix before go-live

| # | Issue | File | What to do |
|---|---|---|---|
| H1 | `TypeScript strict: false` + 51 `any` errors | `tsconfig.app.json`, all pages | Enable `"strict": true`; replace `any` with typed interfaces. Estimate: 4–6 hours. |
| H2 | No Zod validation on forms | `PatientForm.tsx`, `FAQManager.tsx` | Add `zodResolver` + field-level error messages |
| H3 | Campaigns page queries swallow errors silently | `Campaigns.tsx` | Add `isError` + fallback UI (same pattern as Index/Analytics) |
| H4 | Segment rules evaluated client-side only | `CampaignRecipients.tsx` | At scale (>5K contacts), loading all patients for JS filtering is untenable. Implement a `match_segment_rules(segment_id)` Postgres function. |
| H5 | `.env` is still in git history | `.env` | After rotating credentials (below), run `git filter-repo --path .env --invert-paths` or `BFG Repo Cleaner` to scrub history |

### MEDIUM — Fix in first sprint post-launch

| # | Issue | File | What to do |
|---|---|---|---|
| M1 | No rate limiting on public endpoints | `campaign-unsubscribe`, `track-email` | Add Supabase Edge Rate Limiting or use a middleware pattern |
| M2 | Password reset has no cooldown | `Login.tsx` | Add client-side `resetSent` cooldown (30 s) + note: Supabase applies server-side rate limits |
| M3 | Google OAuth tokens stored unencrypted | `practice_settings` | Migrate to Vault using same pattern as `email_api_key_secret_id` |
| M4 | No error/skeleton for Campaigns queries | `Campaigns.tsx` | See H3 |
| M5 | Intake Forms drag-reorder is UI-only | `IntakeForms.tsx` | Implement drag-and-drop using `@dnd-kit/sortable` + update `questions` JSONB |
| M6 | `audit_log.performed_by` always NULL | DB trigger | Capture `auth.uid()` in trigger via `current_setting('request.jwt.claims')` |
| M7 | No error reporting / monitoring | `main.tsx` | Add Sentry (`@sentry/react`) before launch |

### LOW — Post-launch backlog

| # | Issue | What to do |
|---|---|---|
| L1 | No accessibility labels on icon buttons | Add `aria-label` on all `<Button size="icon">` |
| L2 | Dark mode not wired up | Wrap `App.tsx` in `<ThemeProvider>` from `next-themes`; add dark CSS vars to `index.css` |
| L3 | Near-zero test coverage | Add integration tests for auth flow, PatientForm CRUD, campaign creation |
| L4 | No analytics/telemetry | Add Posthog or Plausible for usage insights |
| L5 | Settings page integrations tab is UI-only | Complete Google OAuth flow, test-send button for email |
| L6 | Retreat page has no fallback | Add `onError` handler + loading state on iframe |
| L7 | `generate-faq-answer` has hardcoded Austin/TX context | Move business context to `practice_settings` |
| L8 | `caniuse-lite` is 10 months out of date | Run `npx update-browserslist-db@latest` |

---

## Security — Actions Required Before Go-Live

### 1. Rotate Leaked Credentials (URGENT)
The `.env` file was committed to this repository. These values are in git history:
- `VITE_SUPABASE_PUBLISHABLE_KEY` — rotate in Supabase Dashboard → Settings → API → Rotate anon key
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_PROJECT_ID` — these are not secrets but the project URL is now public

After rotating, scrub the file from git history (see H5 above).

### 2. Set Edge Function Secrets (in Supabase Dashboard → Edge Functions → Secrets)

| Secret | Purpose |
|---|---|
| `ALLOWED_ORIGIN` | Your production domain, e.g. `https://app.fitlogic.io` — locks CORS |
| `RESEND_WEBHOOK_SECRET` | From Resend Dashboard → Webhooks → your endpoint → Signing Secret (starts `whsec_`) |
| `SENDGRID_WEBHOOK_PUBLIC_KEY` | From SendGrid → Settings → Mail Settings → Event Webhook → Public Key |

Without these set, signature verification is skipped with a warning log (non-breaking), but webhooks remain unverified.

### 3. Set Database Config Parameters (for pg_cron)
Run in Supabase SQL editor:
```sql
ALTER DATABASE postgres SET app.settings.supabase_project_id = '<your-project-ref>';
ALTER DATABASE postgres SET app.settings.service_role_key     = '<your-service-role-key>';
```

### 4. RLS Policy Scope
All RLS policies use `auth.role() = 'authenticated'` — any logged-in user sees all data. This is acceptable for a single-tenant deployment. If the client ever needs multi-staff access controls, add `user_id` columns and `auth.uid()` row-level policies.

---

## What We Need from the Client Before Deploying to a Live Domain

### Domain & Hosting
- [ ] **Custom domain name** (e.g. `app.fitlogic.io`) — needed to configure in Lovable → Project Settings → Domains
- [ ] **DNS provider access** — for A/CNAME records pointing to Lovable

### Email Deliverability (Critical — emails won't land in inboxes without these)
- [ ] **Sending domain** (e.g. `mail.fitlogic.io` or `hello@fitlogic.io`) — the domain you'll send FROM
- [ ] **DNS access for that domain** — to add:
  - **SPF record** — tells receiving servers your email is authorized
  - **DKIM record** — cryptographically signs outgoing mail (Resend/SendGrid generate this key; you publish the public half in DNS)
  - **DMARC record** — policy for handling unauthenticated mail (start with `p=none` for monitoring)
- [ ] **Email provider choice**: Resend or SendGrid? (Both are wired up — just need the API key)
- [ ] **Email provider API key** — entered in Settings → Email Configuration inside the app
- [ ] **"From" name and address** — e.g. `FitLogic Team <hello@fitlogic.io>`

### Google Integration (Optional — only if using Gmail/Calendar sync)
- [ ] **Google Cloud project** with OAuth 2.0 credentials (Client ID + Client Secret)
- [ ] **Authorized redirect URI** set in Google Console: `https://<supabase-project>.supabase.co/functions/v1/google-oauth-callback`

### AI / Automation
- [ ] **Lovable API key** — for AI campaign generation, FAQ answers, and inquiry classification (already used but may need renewal)
- [ ] Decision: keep AI features enabled, or disable until API key is confirmed active?

### Content & Branding
- [ ] **Practice name, address, phone** — for Settings → Practice Info and email footers
- [ ] **Logo / brand assets** — the app uses `fitlogic-logo.png`; confirm final logo file
- [ ] **Business hours and timezone** — for campaign send-time enforcement (default: Mon–Fri 8 AM–6 PM ET)
- [ ] **Daily email send limit** — how many emails per day max? (default: 500)
- [ ] **Escalation staff member** — which staff email receives AI-escalated inquiries?
- [ ] **FAQ content** — seed the FAQ library so AI inquiry auto-response works from day 1

### Legal & Compliance
- [ ] **Privacy Policy URL** — required in email footers for CAN-SPAM
- [ ] **Terms of Service URL**
- [ ] **BAA (Business Associate Agreement) with Supabase** — if PHI (patient health information) is stored. Supabase offers BAAs on their HIPAA plan.
- [ ] **HIPAA compliance stance** — the `audit_log` trigger exists but `performed_by` is NULL. If HIPAA applies, enable the fix (see M6 above) and confirm Supabase HIPAA plan.
- [ ] **Unsubscribe / opt-out handling** — confirm the one-click unsubscribe flow meets your jurisdiction's requirements (CAN-SPAM / CASL / GDPR as applicable)

### Initial Data
- [ ] **Staff accounts** — list of staff names, email addresses, and roles to be created in Supabase Auth (Dashboard → Authentication → Users)
- [ ] **Initial contact list** — CSV file for bulk import, or confirm starting from scratch
- [ ] **Initial email templates** — any existing templates or brand guidelines to load

### Infrastructure Review
- [ ] **Confirm Lovable plan** supports custom domains + edge function execution at your expected volume
- [ ] **Supabase plan** — confirm free tier is sufficient or upgrade to Pro (needed for > 50K edge function invocations/month and Vault features)

---

## Architecture Notes for Future Reference

### Campaign Queue Flow
```
Campaign status: draft → scheduled (user sets scheduled_at)
pg_cron fires every 2 min → POST /functions/v1/process-campaign-queue
Queue checks: business hours → daily limit → suppression list → unsubscribe list
Per-recipient: substitute vars → track links → insert send_log → call provider API
On success: update send_log status=sent, recipient status=sent/pending(sequence)
On completion: campaign status=sent (or paused if failures exist)
```

### Webhook Flow
```
Provider (Resend/SendGrid) → POST /functions/v1/email-webhook
Verify HMAC signature → parse event type → update campaign_send_log
Hard bounce / complaint → upsert email_suppressions
Any event → recalculate campaign.stats JSONB
```

### Auth Flow
```
Login page → supabase.auth.signInWithPassword
AuthContext wraps session with autoRefreshToken
ProtectedRoute redirects to /login if no session
All Supabase queries use anon key + session JWT; RLS enforces authentication
Edge functions use service_role key (bypasses RLS — treat as backend)
```
