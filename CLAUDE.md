# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. 

## Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run start        # Serve production build
npm run lint         # ESLint check
```

There is no test runner configured in this project.

## Architecture Overview

**FitLogic Sales Engine** is a React 18 + TypeScript **Next.js 14 App Router** app for healthcare CRM and marketing automation — contacts, pipeline kanban, email campaigns, inquiry management, intake forms, analytics, and referral tracking.

### Stack

- **Frontend:** React 18, TypeScript, Next.js 14 (App Router), Tailwind CSS, shadcn-ui (Radix UI primitives), Lucide icons, Recharts, next-themes
- **Backend:** Supabase (PostgreSQL + Auth), Next.js API Routes (`app/api/`)
- **Data Fetching:** TanStack React Query v5 — all queries use `useQuery`/`useMutation`
- **Forms:** react-hook-form + Zod validation
- **Routing:** Next.js App Router — `app/(protected)/` route group is auth-gated, `app/login/` is public

### Path Alias

`@/*` maps to `src/*` (configured in `tsconfig.json`).

### Directory Layout

```
app/                        # Next.js App Router
  layout.tsx                # Root layout — wraps <Providers>
  providers.tsx             # QueryClient, Toaster, AuthProvider, ErrorBoundary
  globals.css
  login/                    # Public login page
  (protected)/              # Auth-gated route group
    layout.tsx              # Checks session; redirects to /login if unauthenticated
    page.tsx                # Kanban pipeline dashboard
    patients/ campaigns/ analytics/ settings/ inbox/ faqs/ intake/ referrals/ ...
  api/                      # Next.js API routes (server-side handlers)
    process-campaign-queue/ classify-inquiry/ email-webhook/ generate-campaign/
    generate-faq-answer/ google-oauth-callback/ track-email/ campaign-unsubscribe/

src/
  page-components/          # Full page logic imported by app/**/page.tsx
  components/               # Shared components; ui/ contains shadcn primitives
  contexts/AuthContext.tsx  # Supabase auth session state + useAuth() hook
  hooks/                    # use-mobile.tsx, use-toast.ts
  integrations/supabase/    # client.ts (re-exports browserClient), types.ts (auto-generated)
  lib/
    queryKeys.ts            # Centralized React Query keys (QK constant)
    supabase.ts             # browserClient + serverClient() factory
    types.ts                # Shared TS types and config maps (CATEGORY_CONFIG, etc.)
    utils.ts                # cn() helper (clsx + tailwind-merge)
    mock-data.ts            # Dev mock data for staff, FAQs, inquiries
```

### Auth Flow

- `src/contexts/AuthContext.tsx` — wraps `supabase.auth` with session state; exposes `useAuth()` (`session`, `user`, `loading`, `signOut`)
- `app/(protected)/layout.tsx` — Next.js route-group layout; redirects to `/login` via `useRouter` when no session
- `app/providers.tsx` — wraps the whole app with QueryClient, AuthProvider, and an ErrorBoundary
- Users are created in the Supabase dashboard; no self-registration UI

### Supabase Integration

Two clients in `src/lib/supabase.ts`:
- `browserClient` — uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; import in client components and contexts
- `serverClient()` — uses `SECRET_KEY` (service role, bypasses RLS); import only in `app/api/**` routes

`src/integrations/supabase/client.ts` re-exports `browserClient` for backwards compatibility.

Auto-generated schema types: `src/integrations/supabase/types.ts` — **do not hand-edit**.

All tables have RLS enforced with `auth.role() = 'authenticated'` (migration `20260407000001`).
Exception: `intake_submissions` allows public INSERT for embedded forms.

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

Mutations call `queryClient.invalidateQueries(...)` on success to sync the UI. Default `staleTime` is 30 seconds (`retry: 1`).

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

Email provider API key is stored in `practice_settings.email_provider_api_key` with optional Supabase Vault encryption via `get_email_api_key()` DB function (migration `20260407000002`).

### API Routes (`app/api/`)

| Route | Purpose |
|---|---|
| `process-campaign-queue` | Sends queued emails via Resend or SendGrid; enforces business hours, suppression list, daily limits |
| `email-webhook` | Receives bounce/open/click/complaint webhooks from Resend & SendGrid |
| `track-email` | Serves 1×1 tracking pixel (open) and handles click redirects |
| `campaign-unsubscribe` | One-click unsubscribe handler |
| `classify-inquiry` | AI inquiry classification + sends auto-response emails on FAQ match |
| `generate-campaign` | AI-generates multi-step email sequences |
| `generate-faq-answer` | AI-generates FAQ answers |
| `google-oauth-callback` | Exchanges Google OAuth code for tokens; stores in practice_settings |

### Heaviest Page Components (`src/page-components/`)

- `Patients.tsx` (~44 KB) — contact list, filters (stage/source/status/search), sort, profile detail, bulk import, paginated loading
- `Campaigns.tsx` (~37 KB) — campaign CRUD, AI wizard, scheduling, duplicate, segment assignment
- `Settings.tsx` (~32 KB) — practice config, staff CRUD, Google OAuth connect, email provider setup
- `IntakeForms.tsx` (~25 KB) — dynamic form builder with drag-drop fields
- `Analytics.tsx` / `Index.tsx` (~21 KB each) — pipeline funnel/engagement stats; kanban board
- `src/components/CampaignDetail.tsx` (~535 lines) — per-campaign detail with recipients, sequences, activity log
- `src/components/CampaignRecipients.tsx` (~456 lines) — recipient picker: Customers, Segments, CSV, Manual tabs
- `src/components/AISequenceWizard.tsx` (~464 lines) — AI-powered multi-step email sequence builder
- `src/components/BulkImportDialog.tsx` (~408 lines) — papaparse CSV import with column mapping, chunked upsert

### Fonts & Theme

- Heading font: Space Grotesk (`font-heading`)
- Body font: DM Sans
- Dark mode via `class` strategy on `<html>` (next-themes)
- Custom Tailwind colors for sidebar, category badges, and status groups in `tailwind.config.js`

### Environment Variables

**Frontend (`NEXT_PUBLIC_` prefix, exposed to browser):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL` — optional; defaults to `http://localhost:3000`

**Server-side only (API routes, never exposed to browser):**
- `SECRET_KEY` — Supabase service role key (bypasses RLS)
- `LOVABLE_API_KEY` — AI generation for campaigns/FAQ/inquiry
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth token exchange
- Email provider keys stored in `practice_settings` table (not env vars)
