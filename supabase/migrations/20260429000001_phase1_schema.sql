-- Phase 1 schema: lead_sources, last_contacted_at, is_test_contact, test_mode_only.
-- Splitting into one migration per concern would be cleaner, but the items here
-- ship as a single feature gate so they share a file for reviewability.

-- ---------------------------------------------------------------------------
-- A1.3  lead_sources lookup table
-- ---------------------------------------------------------------------------
create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  is_default boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

alter table public.lead_sources enable row level security;

drop policy if exists "lead_sources read"   on public.lead_sources;
drop policy if exists "lead_sources write"  on public.lead_sources;

create policy "lead_sources read"  on public.lead_sources
  for select using (auth.role() = 'authenticated');
create policy "lead_sources write" on public.lead_sources
  for all    using (auth.role() = 'authenticated')
             with check (auth.role() = 'authenticated');

insert into public.lead_sources (label, is_default, sort_order) values
  ('Social media',                  true, 10),
  ('Website',                       true, 20),
  ('Driving by / saw the sign',     true, 30),
  ('Friend or family referral',     true, 40),
  ('Networking event',              true, 50),
  ('ChatGPT / Claude / AI search',  true, 60),
  ('Walk-in',                       true, 70),
  ('Phone call',                    true, 80),
  ('Email',                         true, 90),
  ('Other',                         true, 999)
on conflict (label) do nothing;

-- ---------------------------------------------------------------------------
-- A1.4  patients.last_contacted_at
-- ---------------------------------------------------------------------------
alter table public.patients
  add column if not exists last_contacted_at timestamptz;

-- NULLS FIRST so "never contacted" rows surface to the top of the daily list.
create index if not exists patients_last_contacted_at_idx
  on public.patients (last_contacted_at nulls first);

-- Best-effort backfill from existing send history. Safe to run on first apply
-- because the column was just added; subsequent applies are no-ops.
update public.patients p
set last_contacted_at = sub.max_sent_at
from (
  select cr.patient_id, max(cr.sent_at) as max_sent_at
  from public.campaign_recipients cr
  where cr.sent_at is not null
  group by cr.patient_id
) sub
where p.id = sub.patient_id
  and p.last_contacted_at is null;

-- ---------------------------------------------------------------------------
-- A1.5  patients.is_test_contact + practice_settings.test_mode_only
-- ---------------------------------------------------------------------------
alter table public.patients
  add column if not exists is_test_contact boolean not null default false;

create index if not exists patients_is_test_contact_idx
  on public.patients (is_test_contact)
  where is_test_contact = true;

alter table public.practice_settings
  add column if not exists test_mode_only boolean not null default true;
