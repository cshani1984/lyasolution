-- SmartCrop / CropFlow: multi-store routing on a shared Twilio WhatsApp number
-- Run in Supabase → SQL Editor after smartcrop_schema.sql + smartcrop_shop_customers.sql
--
-- Store ≈ profiles row (lab account). store_code is the public routing key (e.g. FLASH101).
-- Customers stay isolated per store via shop_customers (shop_user_id, phone).

-- 1) Store identity on profiles
alter table public.profiles
  add column if not exists store_code text;

alter table public.profiles
  add column if not exists store_name text;

-- Normalize + unique index (case-insensitive)
create unique index if not exists idx_profiles_store_code_unique
  on public.profiles (upper(store_code))
  where store_code is not null and length(trim(store_code)) > 0;

comment on column public.profiles.store_code is
  'Public store code for WhatsApp deep-link + /upload/{code} routing (e.g. FLASH101)';
comment on column public.profiles.store_name is
  'Display name for customer-facing WhatsApp / upload pages (fallback: full_name)';

-- 2) Photo intake source
alter table public.photos
  add column if not exists source text default 'WHATSAPP';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'photos_source_check'
  ) then
    alter table public.photos
      add constraint photos_source_check
      check (source in ('WHATSAPP', 'WEB_UPLOAD'));
  end if;
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_photos_source on public.photos (user_id, source);

comment on column public.photos.source is 'WHATSAPP | WEB_UPLOAD — how the file entered the store';

-- Public store lookup goes through Express GET /api/stores/:code (service role).
-- Do not open profiles SELECT to anon — would leak phone/email.
