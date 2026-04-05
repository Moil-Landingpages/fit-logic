# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server on port 8080
npm run build        # Production build
npm run lint         # Run ESLint
npm run test         # Run Vitest tests once
npm run test:watch   # Run tests in watch mode
```

## Architecture

FitLogic is a sales engine and patient management platform for fitness/health practices. It's built with React 18 + TypeScript + Vite, using Supabase as the backend (PostgreSQL + auth + Edge Functions).

### Key libraries
- **shadcn/ui + Radix UI** — component primitives (buttons, dialogs, tabs, accordions)
- **TanStack React Query** — all server state and async data fetching
- **React Hook Form + Zod** — form handling and validation
- **Tailwind CSS** — styling with custom color tokens in `tailwind.config.ts`

### Path alias
`@/` maps to `./src/` (configured in vite.config.ts and tsconfig).

### Data flow
All data fetching uses React Query `useQuery` / `useMutation` against the Supabase client at `src/integrations/supabase/client.ts`. On mutations, invalidate the relevant query key to refresh state:

```typescript
const mutation = useMutation({
  mutationFn: async (data) => supabase.from("table").insert(data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["table"] }),
});
```

AI features (campaign/sequence generation) call Supabase Edge Functions via `supabase.functions.invoke("function-name", { body: ... })`.

### Configuration constants
`src/lib/types.ts` is the single source of truth for UI styling — it exports `CATEGORY_CONFIG`, `STATUS_CONFIG`, `CAMPAIGN_STATUS_CONFIG`, `QUESTION_TYPE_CONFIG`, etc. Use these instead of magic strings.

### Supabase types
`src/integrations/supabase/types.ts` is auto-generated from the Supabase schema. Do not hand-edit it.

### Key directories
- `src/pages/` — route-level components (one per page)
- `src/components/` — reusable feature components; `src/components/ui/` contains shadcn primitives
- `src/lib/` — shared utilities, types, and mock/seed data
- `src/integrations/supabase/` — Supabase client and generated types
- `src/test/` — Vitest unit tests

### AI campaign components
`AICampaignCreator.tsx` and `AISequenceWizard.tsx` handle AI-driven email creation. `SequenceBuilder.tsx` and `CampaignDetail.tsx` handle editing and display of sequences/campaigns.

## Dev notes
- Toast notifications use `sonner` — import `toast` from `"sonner"`.
- The `cn()` utility from `src/lib/utils.ts` merges Tailwind classes (uses `clsx` + `tailwind-merge`).
- Dark mode is class-based (`next-themes`).
- Mock data for offline development is in `src/lib/mock-data.ts`.
