# Fit Logic — CRM & Sales Pipeline

A full-stack CRM built for Fit Logic, a functional medicine clinic. Manages contacts, email campaigns, sequences, referrals, intake forms, and a sales pipeline with AI-powered email generation.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| UI | React 18 + shadcn/ui + Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Email | Resend |
| AI | Google Gemini |
| Charts | Recharts |
| Forms | React Hook Form + Zod |
| State | TanStack Query v5 |

---

## Features

- **Sales Pipeline** — Kanban board with drag-and-drop, stage expand/collapse, and stage detail sheet
- **Contacts** — Full contact management with import/export CSV, filtering, and bulk actions
- **Campaigns** — AI-generated single campaigns and multi-step email sequences
- **Email Tracking** — Open pixel, click rewriting, bounce and complaint handling via Resend webhooks
- **Inbox** — Inquiry management with Gmail sync and AI classification
- **Analytics** — Pipeline funnel, email engagement, and inquiry trend charts
- **Referrals** — Referral link generation and conversion tracking
- **FAQ / Knowledge Base** — AI-assisted FAQ management
- **Settings** — Practice config, business hours, staff, and integrations

---

## Local Development

**Prerequisites:** Node.js 18+ and npm

```sh
# 1. Clone the repo
git clone git@github.com:Moil-Landingpages/fit-logic.git
cd fit-logic

# 2. Install dependencies
npm install

# 3. Set up environment variables (see below)
cp .env.example .env.local

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Environment Variables

Create a `.env.local` file in the project root with the following:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Resend (email sending)
RESEND_API_KEY=
FROM_EMAIL=

# Google Gemini (AI campaign generation)
GEMINI_API_KEY=

# App URL (used for tracking pixel and unsubscribe links)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Cron job protection
CRON_SECRET=
```

---

## Scripts

```sh
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

---

## Cron Job

The campaign scheduler runs at `/api/cron/schedule` (GET). Configure this as an hourly cron in your deployment platform (e.g. Vercel Cron).

Emails are only sent during the **exact scheduled hour** in the practice's configured timezone — the cron fires hourly but skips outside the scheduled window.

Set `CRON_SECRET` in your environment and pass it as `Authorization: Bearer <CRON_SECRET>` to secure the endpoint.

---

## Email Webhooks

Point your Resend webhook to:

```
POST https://your-domain.com/api/email-webhook
```

Enable the following events: `email.bounced`, `email.complained`

Opens and clicks are tracked internally via pixel and link rewriting — no Resend webhook needed for those.
