alter table public.segments
add column if not exists manual_contact_ids uuid[] not null default '{}'::uuid[];
