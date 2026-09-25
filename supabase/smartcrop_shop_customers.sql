-- SmartCrop: shop customers + order metadata for WhatsApp studio flow
-- Run in Supabase → SQL Editor after smartcrop_schema.sql

-- End-customer fields on photos (shop owner = user_id)
alter table public.photos add column if not exists customer_name text;
alter table public.photos add column if not exists copies integer default 1;
alter table public.photos add column if not exists paper_type text;
alter table public.photos add column if not exists caption_text text;
alter table public.photos add column if not exists parsed_summary text;
alter table public.photos add column if not exists parse_confidence numeric;
alter table public.photos add column if not exists hotfolder_path text;

create index if not exists idx_photos_customer_phone
  on public.photos (user_id, sender_phone);

-- CRM-style customer rollup per shop (photo lab account)
create table if not exists public.shop_customers (
  id uuid default uuid_generate_v4() primary key,
  shop_user_id uuid references public.profiles(id) on delete cascade not null,
  phone text not null,
  full_name text,
  last_order_at timestamp with time zone default timezone('utc'::text, now()) not null,
  photo_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (shop_user_id, phone)
);

create index if not exists idx_shop_customers_shop
  on public.shop_customers (shop_user_id);

alter table public.shop_customers enable row level security;

drop policy if exists "Shop owners view own customers" on public.shop_customers;
create policy "Shop owners view own customers" on public.shop_customers
  for select using (auth.uid() = shop_user_id);

drop policy if exists "Shop owners update own customers" on public.shop_customers;
create policy "Shop owners update own customers" on public.shop_customers
  for update using (auth.uid() = shop_user_id);

drop policy if exists "Shop owners insert own customers" on public.shop_customers;
create policy "Shop owners insert own customers" on public.shop_customers
  for insert with check (auth.uid() = shop_user_id);

drop policy if exists "Shop owners delete own customers" on public.shop_customers;
create policy "Shop owners delete own customers" on public.shop_customers
  for delete using (auth.uid() = shop_user_id);
