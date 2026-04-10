-- Run in Supabase → SQL Editor.
-- Maps to: first name, last name, phone, email, creationDate (creation_date), message.

create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  phone text not null,
  email text not null,
  creation_date timestamptz not null default now(),
  message text not null
);

alter table public.contact_submissions enable row level security;

drop policy if exists "Allow anon insert contact_submissions" on public.contact_submissions;

create policy "Allow anon insert contact_submissions"
  on public.contact_submissions
  for insert
  to anon
  with check (true);

-- If you already had the old table (project_type, locale, created_at), run this once instead of the block above:
-- alter table public.contact_submissions rename column created_at to creation_date;
-- alter table public.contact_submissions add column if not exists phone text;
-- update public.contact_submissions set phone = '-' where phone is null;
-- alter table public.contact_submissions alter column phone set not null;
-- alter table public.contact_submissions drop column if exists project_type;
-- alter table public.contact_submissions drop column if exists locale;
