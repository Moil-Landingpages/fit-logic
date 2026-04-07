# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server on port 8080
npm run build        # Production build
npm run build:dev    # Dev mode build
npm run lint         # ESLint check
npm run test         # Run tests once (Vitest)
npm run test:watch   # Watch mode tests
npm run preview      # Preview production build locally
```

## Architecture Overview

**FitLogic Sales Engine** is a React 18 + TypeScript SPA (Vite) for healthcare CRM and marketing automation — contacts, pipeline kanban, email campaigns, inquiry management, intake forms, analytics, and referral tracking.

### Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn-ui (Radix UI primitives), Lucide icons, Recharts
- **Backend:** Supabase (PostgreSQL + Auth + Edge Functions)
- **Deployment:** Lovable Cloud (lovable.dev) — project auto-deploys on push to `main`
- **Data Fetching:** TanStack React Query v5 — all queries use `useQuery`/`useMutation`
- **Forms:** react-hook-form + Zod validation
- **Routing:** React Router v6 — `/login` is public, all other routes protected via `ProtectedRoute`
- **Charts:** Recharts

### Path Alias

`@/*` maps to `src/*` (configured in `vite.config.ts` and `tsconfig.json`).

### Auth Flow

- `src/contexts/AuthContext.tsx` — wraps `supabase.auth` with session state; exposes `useAuth()`
- `src/components/ProtectedRoute.tsx` — redirects to `/login` when no session
- `src/pages/Login.tsx` — email/password sign-in + forgot-password reset
- Users are created in the Supabase dashboard (Authentication → Users); there is no self-registration UI

### Supabase Integration

- Client: `src/integrations/supabase/client.ts`
- Auto-generated schema types: `src/integrations/supabase/types.ts` — **do not hand-edit**
- All tables have RLS enforced with `auth.role() = 'authenticated'` (migration `20260407000001`)
- Exception: `intake_submissions` allows public INSERT for embedded forms
- Edge Functions (Deno): `supabase/functions/` — all use `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS

### Query Key Convention

All React Query keys live in `src/lib/queryKeys.ts` as the `QK` constant. Always use these instead of inline arrays so `invalidateQueries` hits the right cache entries.

```typescript
import { QK } from "@/lib/queryKeys";
queryClient.invalidateQueries({ queryKey: QK.patients });
queryClient.invalidateQueries({ queryKey: QK.campaignRecipients(campaignId) });
```

### Data Fetching Pattern

```typescript
const { data: contacts = [] } = useQuery({
  queryKey: QK.patients,
  queryFn: async () => {
    const { data, error } = await supabase.from("patients").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});
```

Mutations call `queryClient.invalidateQueries(...)` on success to sync the UI.

### Key Tables

| Table | Purpose |
|---|---|
| `patients` | Contacts/prospects — pipeline_stage, lead_source, company, deal_value, HIPAA audit trail |
| `practice_settings` | Singleton config row — email provider, timezone, business hours, Google tokens |
| `campaigns` / `campaign_sequences` | Email campaigns and multi-step sequences |
| `campaign_recipients` / `campaign_send_log` | Distribution and per-send delivery tracking |
| `email_suppressions` | Hard bounce / complaint suppression list (checked before every send) |
| `segments` | Rule-based contact segmentation |
| `inquiries` | Support tickets with AI classification |
| `intake_forms` / `intake_submissions` | Dynamic form builder and responses |
| `faqs` | FAQ library with AI-powered auto-response |
| `referrals` | Referral conversion tracking |
| `staff` | Staff accounts; escalation_staff_id FK in practice_settings |
| `audit_log` | HIPAA compliance log (trigger on patients) |

### Edge Functions

| Function | Purpose | Key Secrets Needed |
|---|---|---|
| `process-campaign-queue` | Sends queued emails via Resend or SendGrid; enforces business hours, suppression list, daily limits | `SUPABASE_SERVICE_ROLE_KEY` |
| `email-webhook` | Receives bounce/open/click/complaint webhooks from Resend & SendGrid | `SUPABASE_SERVICE_ROLE_KEY` |
| `track-email` | Serves 1×1 tracking pixel (open) and handles click redirects | `SUPABASE_SERVICE_ROLE_KEY` |
| `campaign-unsubscribe` | One-click unsubscribe handler | `SUPABASE_SERVICE_ROLE_KEY` |
| `classify-inquiry` | AI inquiry classification + sends auto-response emails on FAQ match | `LOVABLE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `generate-campaign` | AI-generates multi-step email sequences | `LOVABLE_API_KEY` |
| `generate-faq-answer` | AI-generates FAQ answers | `LOVABLE_API_KEY` |
| `google-oauth-callback` | Exchanges Google OAuth code for tokens; stores in practice_settings | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` |

Email provider API key is stored in `practice_settings.email_provider_api_key` with optional Supabase Vault encryption via `get_email_api_key()` DB function (migration `20260407000002`).

### Heaviest Files

- `src/pages/Patients.tsx` (~912 lines) — contact list, filters (stage/source/status/search), sort, profile detail, bulk import trigger, paginated loading (500/page)
- `src/pages/Settings.tsx` (~760 lines) — practice config, staff CRUD, Google OAuth connect, email provider setup
- `src/pages/Campaigns.tsx` (~700 lines) — campaign CRUD, AI wizard, scheduling, duplicate, segment assignment
- `src/components/CampaignDetail.tsx` (~535 lines) — per-campaign detail with recipients, sequences, activity log
- `src/pages/Index.tsx` (~484 lines) — kanban pipeline board with drag-and-drop stage updates
- `src/components/AISequenceWizard.tsx` (~464 lines) — AI-powered multi-step email sequence builder
- `src/pages/Analytics.tsx` (~460 lines) — pipeline funnel, email engagement, inquiry stats (3 tabs, all live data)
- `src/components/CampaignRecipients.tsx` (~456 lines) — recipient picker: Customers tab, Segments tab (with client-side rule evaluator), CSV tab, Manual tab
- `src/components/BulkImportDialog.tsx` (~408 lines) — papaparse CSV import with column mapping, chunked upsert, progress

### Fonts & Theme

- Heading font: Space Grotesk (`font-heading`)
- Body font: DM Sans
- Dark mode via `class` strategy on `<html>`
- Custom Tailwind colors for sidebar, category badges, and status groups in `tailwind.config.ts`

### Environment Variables

**Frontend (`.env`, Vite-exposed):**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_GOOGLE_CLIENT_ID` — optional; controls Google OAuth button in Settings

**Supabase Edge Function Secrets (set in Supabase dashboard):**
- `LOVABLE_API_KEY` — Lovable AI API for campaign/FAQ/inquiry generation
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth token exchange
- Email provider keys stored in `practice_settings` table (not env vars)
