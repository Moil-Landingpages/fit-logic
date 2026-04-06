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

**FitLogic Sales Engine** is a React 18 + TypeScript SPA (Vite) for healthcare CRM and marketing automation — contacts, email campaigns, inquiry management, intake forms, analytics, and referral tracking.

### Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn-ui (Radix UI primitives), Lucide icons
- **Backend:** Supabase (PostgreSQL + Auth + Edge Functions)
- **Data Fetching:** TanStack React Query v5 — all queries use `useQuery`/`useMutation`; no Redux or context-based state for server data
- **Forms:** react-hook-form + Zod validation
- **Routing:** React Router v6 with a `<Layout>` wrapper around all routes
- **Charts:** Recharts

### Path Alias

`@/*` maps to `src/*` (configured in `vite.config.ts` and `tsconfig.json`).

### Supabase Integration

- Client: `src/integrations/supabase/client.ts`
- Auto-generated schema types: `src/integrations/supabase/types.ts` — do not hand-edit
- All tables have RLS enabled with currently-public policies; auth is scaffolded but not yet enforced
- Edge Functions (Deno): `supabase/functions/` — handles AI campaign generation, inquiry classification, FAQ answering, email tracking, campaign queue processing, and unsubscribe handling

### Key Tables

| Table | Purpose |
|---|---|
| `patients` | Contacts/prospects with HIPAA audit trail |
| `campaigns` / `campaign_sequences` | Email campaigns and multi-step sequences |
| `campaign_recipients` / `campaign_send_log` | Distribution and delivery tracking |
| `segments` | Rule-based patient segmentation |
| `inquiries` | Customer support tickets |
| `intake_forms` / `intake_submissions` | Dynamic form builder and responses |
| `faqs` | FAQ library with AI classification |
| `referrals` | Referral conversion tracking |
| `audit_log` | HIPAA compliance logging (triggers on `patients`) |

### Core Source Layout

```
src/
├── pages/          # 11 route-level page components
├── components/     # Reusable components + ui/ (shadcn-ui)
├── hooks/          # use-toast, use-mobile
├── lib/
│   ├── types.ts       # Shared TS interfaces and status/category configs
│   ├── utils.ts       # cn() classname utility
│   ├── mock-data.ts   # Dev sample data
│   ├── campaign-data.ts
│   └── intake-data.ts
└── integrations/supabase/
```

### Heaviest Files (most logic)

- `src/pages/Campaigns.tsx` (~36 KB) — full campaign CRUD, sequencing, scheduling
- `src/pages/Patients.tsx` (~35 KB) — contact list, filtering, profiles
- `src/components/CampaignDetail.tsx` (~27 KB)
- `src/components/AISequenceWizard.tsx` (~21 KB)

### Data Fetching Pattern

```typescript
const { data: contacts = [] } = useQuery({
  queryKey: ["patients"],
  queryFn: async () => {
    const { data } = await supabase.from("patients").select("*");
    return data || [];
  },
});
```

Mutations call `queryClient.invalidateQueries({ queryKey: ["patients"] })` to sync UI after writes.

### Active Issues to Address

1. **Pipeline screen** (`src/pages/Index.tsx`) — needs to load real deal/contact data from Supabase and function as a true pipeline visualizer; currently not wired to live data
2. **Cross-entity sync** — changes to a client profile must reflect immediately in pipeline, campaigns, and anywhere else that contact appears; currently there is no shared invalidation strategy across query keys
3. **Google/integrations** — integration connection flow is incomplete/broken
4. **Contact filtering** — filter and sort controls in `Patients.tsx` need verification and fixes
5. **Incomplete functionalities** — review components for stub handlers, TODO comments, and missing edge-case logic throughout

### Fonts & Theme

- Heading font: Space Grotesk
- Body font: DM Sans
- Dark mode via `class` strategy on `<html>`
- Custom Tailwind colors for sidebar, category badges, and status groups defined in `tailwind.config.ts`
