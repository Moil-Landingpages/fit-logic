-- Phase 2 schema: interactions log, practice links, pipeline_stage_changed_at,
-- and seed segments for Megan's tag taxonomy.

-- ---------------------------------------------------------------------------
-- A2.1  interactions table
-- ---------------------------------------------------------------------------
create table if not exists public.interactions (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients(id) on delete cascade,
  type             text not null check (type in ('call', 'walk_in', 'email', 'note')),
  occurred_at      timestamptz not null default now(),
  author_staff_id  uuid references public.staff(id),
  body             text,
  created_at       timestamptz not null default now()
);

create index if not exists interactions_patient_occurred_idx
  on public.interactions (patient_id, occurred_at desc);
create index if not exists interactions_type_occurred_idx
  on public.interactions (type, occurred_at desc);

alter table public.interactions enable row level security;

drop policy if exists "interactions read"  on public.interactions;
drop policy if exists "interactions write" on public.interactions;

create policy "interactions read"  on public.interactions
  for select using (auth.role() = 'authenticated');
create policy "interactions write" on public.interactions
  for all    using (auth.role() = 'authenticated')
             with check (auth.role() = 'authenticated');

-- Logged interactions also count as "last contacted" so the daily list stays
-- accurate even when the contact was reached by phone or in-person.
create or replace function public.bump_patient_last_contacted_from_interaction()
returns trigger
language plpgsql
as $$
begin
  update public.patients
     set last_contacted_at = greatest(coalesce(last_contacted_at, 'epoch'::timestamptz), new.occurred_at)
   where id = new.patient_id;
  return new;
end;
$$;

drop trigger if exists trg_interactions_last_contacted on public.interactions;
create trigger trg_interactions_last_contacted
  after insert on public.interactions
  for each row execute function public.bump_patient_last_contacted_from_interaction();

-- ---------------------------------------------------------------------------
-- A2.2  pipeline_stage_changed_at + auto-bump trigger
-- ---------------------------------------------------------------------------
alter table public.patients
  add column if not exists pipeline_stage_changed_at timestamptz;

-- Backfill so existing rows have something better than NULL for the
-- "average days to close" calculation. created_at is the safest fallback
-- since it predates any stage transition.
update public.patients
   set pipeline_stage_changed_at = created_at
 where pipeline_stage_changed_at is null;

create or replace function public.bump_pipeline_stage_changed_at()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'UPDATE' and new.pipeline_stage is distinct from old.pipeline_stage) then
    new.pipeline_stage_changed_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_patients_pipeline_stage_changed on public.patients;
create trigger trg_patients_pipeline_stage_changed
  before update on public.patients
  for each row execute function public.bump_pipeline_stage_changed_at();

-- ---------------------------------------------------------------------------
-- A2.5  practice_links (saved CTA destination URLs for the AI Campaign Creator)
-- ---------------------------------------------------------------------------
create table if not exists public.practice_links (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  url         text not null,
  is_default  boolean not null default false,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now()
);

alter table public.practice_links enable row level security;

drop policy if exists "practice_links read"  on public.practice_links;
drop policy if exists "practice_links write" on public.practice_links;

create policy "practice_links read"  on public.practice_links
  for select using (auth.role() = 'authenticated');
create policy "practice_links write" on public.practice_links
  for all    using (auth.role() = 'authenticated')
             with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- A2.3  seed default segments for Megan's tag taxonomy
-- ---------------------------------------------------------------------------
-- The segments table already exists from earlier migrations with columns
-- (id, name, ...). We only insert if a segment with the same name doesn't
-- already exist, since users may have created their own segments.
insert into public.segments (name)
select v.name from (values
    ('Cold lead'),
    ('Active patient'),
    ('Inactive patient'),
    ('Previous client'),
    ('IC only'),
    ('Massage only'),
    ('Mens hormone'),
    ('Womens hormone'),
    ('Gut health'),
    ('Perimenopause')
  ) as v(name)
where not exists (
  select 1 from public.segments s where lower(s.name) = lower(v.name)
);
