# FITLOGIC CRM - Project Blueprint

A comprehensive guide for building another CRM using the same architecture and patterns.

---

## 1. Executive Summary

**Project Type:** Full-stack Healthcare CRM & Marketing Automation Platform
**Built For:** Functional medicine clinics (easily adaptable to other industries)
**Core Value:** Manages contacts, email campaigns, sales pipelines, intake forms, and AI-powered automation

---

## 2. Visual System Architecture

### 2.1 Sales Pipeline (Kanban Board)

**Visual Layout:**
```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Sales Pipeline                                    [+ Add Contact] [New Campaign] │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐  │
│  │ NEW LEAD    │ │ CONTACTED   │ │ QUALIFIED   │ │ PROPOSAL    │ │ WON       │  │
│  │ ▓▓░░░░░░░░░ │ │ ▓▓▓▓░░░░░░░ │ │ ▓▓▓░░░░░░░░ │ │ ▓▓▓▓▓░░░░░░ │ │ ▓▓▓▓▓▓▓░░ │  │
│  │    (12)     │ │    (8)      │ │    (5)      │ │    (3)      │ │   (7)     │  │
│  ├─────────────┤ ├─────────────┤ ├─────────────┤ ├─────────────┤ ├───────────┤  │
│  │ ┌─────────┐ │ │ ┌─────────┐ │ │ ┌─────────┐ │ │ ┌─────────┐ │ │ ┌───────┐ │  │
│  │ │ JD      │ │ │ │ AS      │ │ │ │ MK      │ │ │ │ RT      │ │ │ │ LM    │ │  │
│  │ │ john@...│ │ │ │ amy@... │ │ │ │ mike@.. │ │ │ │ rob@... │ │ │ │ lisa..│ │  │
│  │ │    2d   │ │ │ │    5d   │ │ │ │    1d   │ │ │ │    3d   │ │ │ │   7d  │ │  │
│  │ └─────────┘ │ │ └─────────┘ │ │ └─────────┘ │ │ └─────────┘ │ │ └───────┘ │  │
│  │ ┌─────────┐ │ │ ┌─────────┐ │ │ ┌─────────┐ │ │ + Add more  │ │ │ +3 more │  │
│  │ │ SR      │ │ │ │ TC      │ │ │ │ ━━━━━━━ │ │ │             │ │ │         │  │
│  │ └─────────┘ │ │ └─────────┘ │ │ │ Drop here │ │ │             │ │ │         │  │
│  │    ...      │ │    ...      │ │ └─────────┘ │ │             │ │ │         │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘  │
│                                                                                 │
│  [Drag cards between columns · Scroll to see all stages]                         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Pipeline Stages (with colors):**

| Stage | Key | Label | Color | Dot | Usage |
|-------|-----|-------|-------|-----|-------|
| 1 | `new_lead` | New Lead | Slate bg, slate text | `bg-slate-400` | Initial entry point |
| 2 | `contacted` | Contacted | Blue bg, blue text | `bg-blue-400` | First touch made |
| 3 | `qualified` | Qualified | Violet bg, violet text | `bg-violet-400` | Verified interest |
| 4 | `proposal` | Proposal | Amber bg, amber text | `bg-amber-400` | Sent offer/pricing |
| 5 | `negotiation` | Negotiation | Orange bg, orange text | `bg-orange-500` | Discussing terms |
| 6 | `won` | Won | Emerald bg, emerald text | `bg-emerald-500` | Closed successfully |
| 7 | `lost` | Lost | Red bg, red text | `bg-red-400` | Closed lost |

**Card Component:**
```
┌─────────────────────┐
│ ┌────  ⠿           │  ← Avatar initials + grip handle
│ │ JD               │
│ └────              │
│ John Doe            │  ← Name (truncate)
│ john@example.com    │  ← Email (truncate)
│              2d     │  ← Relative date (Today/1d/5d/2mo)
└─────────────────────┘
```

**Interactions:**
- Drag & drop cards between columns
- Click card → Navigate to contact detail
- Click [+] → Add existing contact to stage
- Click [⛶] → Expand stage in side sheet
- Density bar shows column load (green→amber→red)

---

### 2.2 Integrations Architecture

**System Integration Map:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FITLOGIC CRM                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Next.js App Router                            │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │   Pipeline   │  │  Campaigns   │  │   Settings   │              │   │
│  │  │    (Kanban)  │  │   (Emails)   │  │(Integrations)│              │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │   │
│  │         │                 │                 │                       │   │
│  │         └─────────────────┼─────────────────┘                       │   │
│  │                           ▼                                         │   │
│  │                ┌──────────────────────┐                             │   │
│  │                │   Supabase Client    │                             │   │
│  │                │  (Browser + Server)  │                             │   │
│  │                └──────────┬───────────┘                             │   │
│  └───────────────────────────┼─────────────────────────────────────────┘   │
│                              │                                             │
│                              ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      SUPABASE (PostgreSQL)                         │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐            │   │
│  │  │patients│ │campaign│ │inquiris│ │  faqs  │ │practice│            │   │
│  │  │_status │ │  _seq  │ │        │ │        │ │settings│            │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                             │
│           ┌──────────────────┼──────────────────┐                          │
│           │                  │                  │                          │
│           ▼                  ▼                  ▼                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                      │
│  │   RESEND    │    │    GOOGLE   │    │   GEMINI    │                      │
│  │  (Email)    │◄──►│ (OAuth)     │    │   (AI)      │                      │
│  │             │    │  - Gmail    │    │  - Content  │                      │
│  │  Webhooks   │    │  - Calendar │    │  - Classify │                      │
│  │  Tracking   │    │             │    │             │                      │
│  └─────────────┘    └─────────────┘    └─────────────┘                      │
│         ▲                                                          │
│         │ Webhook callbacks                                        │
│         └──────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────┘
```

**Integration Cards (Settings UI):**

```
┌─────────────────────────────────────────────────────────────────┐
│  Google Workspace                                               │
│  Connect Google Calendar for scheduling and Gmail for sending   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────┐  Google Calendar              ┌──────────┐  ┌────────┐ │
│  │ 🗓️  │  Read calendar availability    │ ✓ Connected│  │Disconnect│ │
│  └─────┘                                   └──────────┘  └────────┘ │
│                                                                  │
│  ┌─────┐  Gmail                          ┌──────────┐  ┌────────┐ │
│  │ 📧  │  Send emails via Gmail          │ ✓ Connected│  │Disconnect│ │
│  └─────┘                                   └──────────┘  └────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Connected Services:**

| Service | Type | Purpose | Auth Method |
|---------|------|---------|-------------|
| **Supabase** | Database | Primary data store, Auth | API Keys |
| **Resend** | Email | Transactional & campaign sending | API Key |
| **Google Calendar** | Calendar | Read availability for scheduling | OAuth 2.0 |
| **Gmail** | Email | Send via user's Gmail account | OAuth 2.0 |
| **Google Gemini** | AI | Content generation, classification | API Key |

---

### 2.3 Email Sequence Flow

**Visual Sequence Builder:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  Email Sequence                                          [+ Add Step]  │
│  3 emails over 11 days                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Timeline Overview:                                                    │
│                                                                         │
│  ┌────┐     ┌────┐      ┌────┐      ┌────┐      ┌────┐    ┌────────┐ │
│  │ 1  │────►│ 3d │─────►│ 2  │─────►│ 5d │─────►│ 3  │───►│  DONE  │ │
│  │ ✉️ │     └────┘      │ ✉️ │      └────┘      │ ✉️ │    │   ✓    │ │
│  └────┘                 └────┘                 └────┘    └────────┘ │
│   Intro                Follow-up #1            Follow-up #2 (Break-up)   │
│   Day 0                Day 3                 Day 8 (3+5)               │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ▓▓▓ Step 1 - Intro (Opening email)    [Edit ✏️] [Preview 👁️]    │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ Subject: Welcome to Fit Logic - Your Health Journey Starts Here   │   │
│  │                                                                 │   │
│  │ [Email body editor with HTML preview...]                        │   │
│  │                                                                 │   │
│  │ ┌─────────────────────────────────────────────────────────────┐ │   │
│  │ │ 💡 Opening email — introduce yourself and value prop.     │ │   │
│  │ │    Keep it under 100 words.                                  │ │   │
│  │ └─────────────────────────────────────────────────────────────┘ │   │
│  │                                                                  │   │
│  │ [✨ AI Improve]  [Save]                                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ⬇️ Wait 3 days                                                        │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ░░░ Step 2 - Follow-up #1             [Edit ✏️] [Preview 👁️]    │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ Subject: Re: Welcome to Fit Logic - Quick question...           │   │
│  │                                                                  │   │
│  │ ┌─────────────────────────────────────────────────────────────┐ │   │
│  │ │ 💡 Follow-up #1 — Reference the first email. Add social     │ │   │
│  │ │    proof or a case study.                                    │ │   │
│  │ └─────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  [+ Add Another Email]                                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Sequence Delay Research-Backed Options:**

| Delay | Label | Description | Best For |
|-------|-------|-------------|----------|
| 2 days | Quick follow-up | Keeps momentum | Hot leads |
| 3 days | Most common | B2B follow-up spacing | Standard (recommended) |
| 4 days | Balanced | Not too eager, not forgotten | Warm leads |
| 5 days | Mid-sequence | Sweet spot for nurturing | Nurture sequences |
| 7 days | One week | Resets attention | Cold re-engagement |
| 10 days | Late-sequence | Avoids fatigue | Long sequences |
| 14 days | Final follow-up | Respectful gap | Break-up email |

**Cold Email Tips by Step:**

| Step | Tip |
|------|-----|
| 1 | Opening email — introduce yourself and value prop. Keep it under 100 words. |
| 2 | Follow-up #1 — Reference the first email. Add social proof or a case study. |
| 3 | Follow-up #2 — Different angle. Share a relevant insight or resource. |
| 4 | Follow-up #3 — Create urgency or share a time-sensitive offer. |
| 5 | Break-up email — Let them know this is your last follow-up. Often gets highest reply rates. |

---

### 2.4 Campaign Flow

**Campaign Lifecycle:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CAMPAIGN LIFECYCLE                               │
└─────────────────────────────────────────────────────────────────────────┘

   ┌─────────┐
   │  DRAFT  │◄────────────────────────────────────────────┐
   │  (✏️)   │                                              │
   └────┬────┘                                              │
        │                                                   │
        │ [Create]                                          │
        ▼                                                   │
   ┌─────────┐     ┌───────────────┐     ┌─────────────┐  │
   │  SETUP  │────►│  RECIPIENTS   │────►│  SCHEDULE   │  │
   │ Configure    │ - All Contacts│     │ - Immediate │  │
   │ - Name       │ - Segment     │     │ - Scheduled │  │
   │ - Subject    │ - CSV Upload  │     │ - Sequence  │  │
   │ - Content    │ - Manual Add  │     │   delays    │  │
   └─────────┘     └───────────────┘     └──────┬──────┘  │
                                                  │         │
                       ┌───────────────────────────┘         │
                       │                                     │
                       ▼                                     │
   ┌────────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐   │
   │  SENDING   │  │ SENT    │  │ OPENED   │  │ CLICKED  │   │
   │  (hourly   │──►│        │──►│         │──►│          │   │
   │   cron)    │  │        │  │         │  │          │   │
   └────────────┘  └─────────┘  └──────────┘  └──────────┘   │
        │                                                  │
        │ [Pause]                                          │
        ▼                                                  │
   ┌────────────┐                                           │
   │  PAUSED    │───────────────────────────────────────────┘
   │            │  [Edit → Resume]
   └────────────┘
        │
        │ [Complete / Cancel]
        ▼
   ┌────────────┐
   │  ARCHIVED  │
   │            │
   └────────────┘
```

**Campaign Detail Page Layout:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back to Campaigns    Campaign Name              [Edit] [Pause/Play] │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Status: ACTIVE ●    Type: SEQUENCE    Sent: 45/100   Open: 23%  │   │
│  │ [Progress bar ██████████████░░░░░░░░░░ 45%]                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  [Overview] [Recipients] [Sequence] [Analytics] [Activity Log]          │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Sequence Flow (3 emails):                                      │   │
│  │                                                                 │   │
│  │  START ──► Day 0 ──► Email 1 (Intro) ──► +3d ──► Email 2       │   │
│  │          "Welcome..."     85% open rate                         │   │
│  │                              │                                  │   │
│  │                              ▼                                  │   │
│  │                           +5d ──► Email 3 (Close) ──► DONE       │   │
│  │                            "Final..."    45% open               │   │
│  │                                                                 │   │
│  │  Total span: 8 days                                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Recipients (100):                                              │   │
│  │  ┌────────────┬────────────────┬──────────┬────────────┐        │   │
│  │  │ Name       │ Email          │ Status   │ Actions    │        │   │
│  │  ├────────────┼────────────────┼──────────┼────────────┤        │   │
│  │  │ John Doe   │ john@...       │ opened   │ [Resend]   │        │   │
│  │  │ Jane Smith │ jane@...       │ sent     │ [View]     │        │   │
│  │  │ Bob Wilson │ bob@...        │ clicked  │ [Resend]   │        │   │
│  │  └────────────┴────────────────┴──────────┴────────────┘        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Campaign Status Badge Colors:**

| Status | Badge Style | Meaning |
|--------|-------------|---------|
| `draft` | Gray outline | Being created |
| `scheduled` | Blue filled | Will send at scheduled time |
| `active` | Green filled | Currently sending |
| `paused` | Amber filled | Temporarily stopped |
| `completed` | Gray filled | All emails sent |
| `archived` | Muted | Inactive/hidden |

**Recipient Status Colors:**

| Status | Badge Style |
|--------|-------------|
| `pending` | Muted gray |
| `sent` | Primary blue |
| `delivered` | Green filled |
| `opened` | Teal filled |
| `clicked` | Blue filled |
| `bounced` | Red filled |
| `failed` | Destructive red |
| `skipped` | Muted gray |

---

## 3. Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Framework** | Next.js 14 (App Router) | Full-stack React framework |
| **Language** | TypeScript | Type-safe development |
| **UI Library** | React 18 | Component-based UI |
| **Styling** | Tailwind CSS + shadcn/ui | Utility-first CSS + pre-built components |
| **Database** | Supabase (PostgreSQL) | Backend-as-a-Service with Auth |
| **State Management** | TanStack Query v5 | Server state caching and synchronization |
| **Forms** | React Hook Form + Zod | Form handling and validation |
| **Email** | Resend (or SendGrid) | Transactional and marketing email |
| **AI** | Google Gemini API | Content generation and classification |
| **Charts** | Recharts | Data visualization |
| **Icons** | Lucide React | Consistent iconography |
| **Font** | Space Grotesk (headings), DM Sans (body) | Typography |

---

## 4. Project Structure

```
project-root/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout with Providers
│   ├── providers.tsx            # QueryClient, AuthProvider, Toaster
│   ├── globals.css              # Global styles + Tailwind
│   ├── login/                   # Public login page
│   ├── (protected)/             # Auth-gated route group
│   │   ├── layout.tsx           # Session check + redirect
│   │   ├── page.tsx             # Dashboard (kanban pipeline)
│   │   ├── patients/            # Contact management
│   │   ├── campaigns/           # Email campaigns
│   │   ├── analytics/           # Dashboard charts
│   │   ├── settings/            # Practice configuration
│   │   ├── inbox/               # Inquiry management
│   │   ├── intake/              # Form builder
│   │   ├── referrals/           # Referral tracking
│   │   └── faqs/                # Knowledge base
│   └── api/                     # Server-side API routes
│       ├── process-campaign-queue/
│       ├── email-webhook/
│       ├── track-email/
│       ├── classify-inquiry/
│       ├── generate-campaign/
│       └── ...
├── src/
│   ├── page-components/         # Full page logic
│   ├── components/              # Shared components
│   │   └── ui/                  # shadcn primitives
│   ├── contexts/                # React contexts
│   │   └── AuthContext.tsx      # Supabase auth state
│   ├── hooks/                   # Custom React hooks
│   ├── integrations/            # Third-party integrations
│   │   └── supabase/            # Client + types
│   └── lib/                     # Utilities
│       ├── queryKeys.ts         # Centralized query keys
│       ├── supabase.ts          # Client factories
│       ├── types.ts             # Shared TypeScript types
│       └── utils.ts             # Helper functions
├── supabase/
│   └── migrations/              # Database migrations
├── components.json              # shadcn/ui configuration
├── tailwind.config.js           # Tailwind + custom theme
└── .env.example                 # Environment variables template
```

---

## 5. Database Schema

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `patients` | Contacts/prospects | id, email, name, phone, company, pipeline_stage, lead_source, deal_value, created_at |
| `practice_settings` | Singleton config | id, practice_name, timezone, business_hours, email_provider, google_tokens |
| `staff` | Team members | id, name, email, role, is_active |
| `campaigns` | Email campaigns | id, name, subject, content, status, scheduled_at, segment_id |
| `campaign_sequences` | Multi-step sequences | id, campaign_id, step_order, delay_hours, subject, content |
| `campaign_recipients` | Campaign distribution | id, campaign_id, patient_id, status, sent_at, opened_at, clicked_at |
| `campaign_send_log` | Per-send tracking | id, recipient_id, sent_at, opened, clicked, bounced |
| `email_suppressions` | Bounce/complaint list | email, reason, created_at |
| `segments` | Contact segmentation | id, name, rules (JSON), manual_contact_ids |
| `inquiries` | Support tickets | id, patient_id, subject, message, category, status, gmail_thread_id |
| `intake_forms` | Dynamic forms | id, title, fields (JSON), is_active |
| `intake_submissions` | Form responses | id, form_id, patient_id, data (JSON) |
| `faqs` | Knowledge base | id, question, answer, category, ai_generated |
| `referrals` | Referral tracking | id, referrer_id, referral_code, converted_at |
| `audit_log` | HIPAA compliance | table_name, record_id, action, old_data, new_data, user_id |

### Security

- **RLS (Row Level Security)** enabled on all tables
- `auth.role() = 'authenticated'` policy for authenticated access
- `intake_submissions` allows public INSERT for embedded forms
- Service role key for API routes (bypasses RLS)

---

## 6. Key Features to Implement

### 6.1 Sales Pipeline (Kanban Board)
- **Stages:** Lead → Qualified → Proposal → Negotiation → Closed Won/Lost
- **Drag-and-drop** card movement between stages
- **Stage expand/collapse** for focus
- **Quick-add** contact from any stage
- **Deal value** tracking per contact

### 6.2 Contact Management
- **CRUD operations** with modal dialogs
- **CSV import/export** (papaparse for parsing)
- **Bulk actions** (delete, change stage, add to campaign)
- **Filtering** by stage, source, status, search text
- **Pagination** for large datasets
- **Profile detail** sheet with full history

### 6.3 Email Campaigns
- **Single campaigns:** One-time broadcast emails
- **Sequences:** Multi-step drip campaigns with delays
- **AI generation:** Google Gemini for content creation
- **Segment targeting:** Rule-based or manual contact selection
- **Scheduling:** Send immediately or schedule for later
- **Personalization:** {{first_name}}, {{company}} variables
- **Unsubscribe** handling

### 6.4 Email Infrastructure
- **Tracking pixel** for open tracking (`/api/track-email`)
- **Link rewriting** for click tracking
- **Webhook handling** for bounces and complaints
- **Suppression list** (auto-exclude bounced emails)
- **Rate limiting** and daily send caps

### 6.5 Inbox/Inquiry Management
- **Gmail sync** via OAuth
- **AI classification** (scheduling, health, billing, urgent, general)
- **Auto-response** for FAQ matches
- **Assignment** to staff members
- **Status tracking** (pending, assigned, resolved, escalated)

### 6.6 Analytics Dashboard
- **Pipeline funnel:** Stage conversion rates
- **Email engagement:** Opens, clicks, bounces over time
- **Inquiry trends:** Volume by category and status
- **Revenue metrics:** Deal value by stage

### 6.7 Settings & Configuration
- **Practice profile:** Name, timezone, business hours
- **Staff management:** Add/remove team members
- **Email provider:** Resend/SendGrid API key setup
- **Google OAuth:** Gmail integration
- **Security:** API key storage with optional Vault encryption

---

## 7. Implementation Patterns

### 7.1 Data Fetching Pattern (TanStack Query)

```typescript
// src/lib/queryKeys.ts
export const QK = {
  patients: ['patients'],
  patient: (id: string) => ['patients', id],
  campaigns: ['campaigns'],
  campaignRecipients: (id: string) => ['campaigns', id, 'recipients'],
  // ... more keys
};

// Usage in component
const { data: contacts = [], isLoading } = useQuery({
  queryKey: QK.patients,
  queryFn: async () => {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
});

// Mutation with cache invalidation
const mutation = useMutation({
  mutationFn: async (newPatient) => {
    const { data, error } = await supabase.from('patients').insert(newPatient);
    if (error) throw error;
    return data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: QK.patients });
  },
});
```

### 7.2 Form Pattern (React Hook Form + Zod)

```typescript
const formSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email'),
  company: z.string().optional(),
});

const form = useForm<z.infer<typeof formSchema>>({
  resolver: zodResolver(formSchema),
  defaultValues: { name: '', email: '', company: '' },
});

// In JSX
<form onSubmit={form.handleSubmit(onSubmit)}>
  <Input {...form.register('name')} />
  {form.formState.errors.name && (
    <p className="text-red-500">{form.formState.errors.name.message}</p>
  )}
</form>
```

### 7.3 Supabase Client Pattern

```typescript
// src/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr';

// Browser client (for components)
export const browserClient = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Server client factory (for API routes)
export const serverClient = () => createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // Bypasses RLS
);
```

### 7.4 Route Protection Pattern

```typescript
// app/(protected)/layout.tsx
'use client';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ProtectedLayout({ children }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) {
      router.push('/login');
    }
  }, [session, loading, router]);

  if (loading) return <div>Loading...</div>;
  if (!session) return null;

  return children;
}
```

---

## 8. Environment Variables

### Frontend (exposed to browser)
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Server-side only
```env
# Supabase
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Email
RESEND_API_KEY=re_xxxxxxxx
FROM_EMAIL=noreply@yourdomain.com

# AI
GEMINI_API_KEY=your-google-ai-key

# Security
CRON_SECRET=random-string-for-cron-protection

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

---

## 9. API Routes to Build

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/process-campaign-queue` | POST | Send queued emails respecting business hours |
| `/api/email-webhook` | POST | Receive Resend/SendGrid events (bounce, complaint) |
| `/api/track-email` | GET | Serve 1x1 pixel for open tracking |
| `/api/track-email` | GET (with `?redirect=`) | Handle click tracking + redirect |
| `/api/campaign-unsubscribe` | GET | One-click unsubscribe |
| `/api/generate-campaign` | POST | AI-generate email content |
| `/api/classify-inquiry` | POST | AI classify + auto-respond to inquiries |
| `/api/generate-faq-answer` | POST | AI generate FAQ answers |
| `/api/google-oauth-callback` | GET | Exchange OAuth code for tokens |
| `/api/cron/schedule` | GET (protected) | Hourly campaign scheduler |

---

## 10. Setup Instructions

### 10.1 Initialize Project

```bash
# 1. Create Next.js project with shadcn
echo "my-app" | npx shadcn@latest init --yes --template next --base-color slate

# 2. Install shadcn components
npx shadcn add button card dialog input label select table tabs toast badge avatar dropdown-menu
npx shadcn add accordion alert-dialog checkbox collapsible context-menu
npx shadcn add hover-card menubar navigation-menu popover progress
npx shadcn add radio-group scroll-area separator slider switch toggle toggle-group tooltip

# 3. Install additional dependencies
npm install @supabase/supabase-js @tanstack/react-query @hookform/resolvers zod react-hook-form
npm install recharts lucide-react date-fns papaparse dompurify
npm install @google/generative-ai next-themes sonner
npm install embla-carousel-react react-day-picker input-otp vaul
npm install clsx tailwind-merge class-variance-authority
npm install cmdk react-resizable-panels

# 4. Install dev dependencies
npm install -D @types/papaparse @types/dompurify @tailwindcss/typography
```

### 10.2 Configure Tailwind

Update `tailwind.config.js` with:
- Custom colors (sidebar, category badges, status groups)
- Custom fonts (Space Grotesk, DM Sans)
- Custom animations (accordion, pulse-glow, slide-in)

### 10.3 Set Up Supabase

1. Create project at [supabase.com](https://supabase.com)
2. Run migrations from `supabase/migrations/` folder
3. Enable RLS on all tables
4. Set up authentication (disable signup if managing users manually)
5. Copy connection details to `.env.local`

### 10.4 Configure Email Provider

1. Sign up at [resend.com](https://resend.com) or [sendgrid.com](https://sendgrid.com)
2. Verify sender domain
3. Add API key to environment variables
4. Configure webhook URL in provider dashboard

---

## 11. Deployment

### Vercel (Recommended)

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Deploy
vercel --prod
```

**Configuration:**
- Set all environment variables in Vercel dashboard
- Configure cron job: `0 * * * *` (hourly) hitting `/api/cron/schedule`
- Add `CRON_SECRET` to secure cron endpoint

### Other Platforms

- **Railway:** Good for full-stack with database
- **Render:** Simple deployment option
- **AWS/GCP:** For enterprise scale

---

## 12. Development Workflow

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Run linting
npm run lint

# Type check
npx tsc --noEmit
```

---

## 13. Key Design Decisions

1. **shadcn/ui over Material/Mantine:** Headless, customizable, no runtime CSS-in-JS
2. **Supabase over Firebase:** PostgreSQL, better query capabilities, HIPAA-friendly
3. **TanStack Query over Redux:** Server-state focused, caching, background refetching
4. **App Router over Pages Router:** Server components, nested layouts, improved caching
5. **Service role in API routes:** Bypasses RLS for server-side operations
6. **Query key constants:** Prevents cache invalidation bugs
7. **Protected route group:** Clean auth gating without HOCs

---

## 14. Extension Points

To adapt this CRM for another industry:

1. **Rename `patients` table** to `contacts` or `leads`
2. **Customize pipeline stages** in `lib/types.ts`
3. **Add industry-specific fields** to contact table
4. **Modify AI prompts** for industry context
5. **Adjust categories** for inquiry classification
6. **Customize intake form fields** for industry needs
7. **Add integrations** (Slack, Zoom, Calendly, etc.)

---

## 15. Security Checklist

- [ ] RLS enabled on all tables
- [ ] Service role key never exposed to browser
- [ ] API routes validate input with Zod
- [ ] Cron endpoints protected with secret
- [ ] Email API keys stored encrypted (Vault)
- [ ] Audit logging for sensitive operations
- [ ] HIPAA compliance features (if healthcare)
- [ ] Rate limiting on public endpoints
- [ ] Input sanitization (DOMPurify for HTML)

---

*This blueprint was created from the FITLOGIC CRM codebase. Use it as a reference for building similar CRM systems.*
