-- SmartCrop schema
-- Run in Supabase → SQL Editor.
--
-- Also create Storage bucket in Dashboard (if not created below):
--   Name: photo-prints
--   Public: yes (or use signed URLs from the server)
--   Allowed MIME: image/jpeg, image/png, image/webp

create extension if not exists "uuid-ossp";

-- 1. PROFILES (Google Auth & Phone Auth)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  phone text unique,
  full_name text,
  avatar_url text,
  language text default 'he' check (language in ('he', 'en')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_profiles_phone on public.profiles (phone);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. PRINT SIZES
create table if not exists public.print_sizes (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  width_cm numeric not null,
  height_cm numeric not null,
  aspect_ratio numeric not null,
  is_default boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

insert into public.print_sizes (name, width_cm, height_cm, aspect_ratio, is_default)
select v.name, v.width_cm, v.height_cm, v.aspect_ratio, v.is_default
from (values
  ('10x15', 10::numeric, 15::numeric, 0.6667::numeric, true),
  ('13x18', 13::numeric, 18::numeric, 0.7222::numeric, false),
  ('20x30', 20::numeric, 30::numeric, 0.6667::numeric, false),
  ('A4', 21::numeric, 29.7::numeric, 0.7071::numeric, false)
) as v(name, width_cm, height_cm, aspect_ratio, is_default)
where not exists (select 1 from public.print_sizes ps where ps.name = v.name);

-- 3. ORDERS
create table if not exists public.orders (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  status text default 'pending' check (status in ('pending', 'processing', 'approved', 'sent_to_print', 'completed')),
  total_photos integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_orders_user_id on public.orders (user_id);

-- 4. PHOTOS
create table if not exists public.photos (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  sender_phone text not null,
  original_url text not null,
  cropped_url text,
  size_id uuid references public.print_sizes(id),
  target_size_name text not null default '10x15',
  crop_data jsonb,
  status text default 'pending' check (status in ('pending', 'approved', 'printed')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_photos_user_id on public.photos (user_id);
create index if not exists idx_photos_phone on public.photos (sender_phone);
create index if not exists idx_photos_order_id on public.photos (order_id);

-- RLS
alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.photos enable row level security;
alter table public.print_sizes enable row level security;

drop policy if exists "Users view own profile" on public.profiles;
create policy "Users view own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Authenticated users view sizes" on public.print_sizes;
create policy "Authenticated users view sizes" on public.print_sizes
  for select to authenticated using (true);

-- Allow anon read of sizes for landing demos (optional)
drop policy if exists "Anyone view sizes" on public.print_sizes;
create policy "Anyone view sizes" on public.print_sizes
  for select using (true);

drop policy if exists "Users view own orders" on public.orders;
create policy "Users view own orders" on public.orders
  for select using (auth.uid() = user_id);

drop policy if exists "Users update own orders" on public.orders;
create policy "Users update own orders" on public.orders
  for update using (auth.uid() = user_id);

drop policy if exists "Users insert own orders" on public.orders;
create policy "Users insert own orders" on public.orders
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users view own photos" on public.photos;
create policy "Users view own photos" on public.photos
  for select using (
    auth.uid() = user_id
    or sender_phone = (select phone from public.profiles where id = auth.uid())
  );

drop policy if exists "Users update own photos" on public.photos;
create policy "Users update own photos" on public.photos
  for update using (auth.uid() = user_id);

drop policy if exists "Users delete own photos" on public.photos;
create policy "Users delete own photos" on public.photos
  for delete using (auth.uid() = user_id);

drop policy if exists "Users insert own photos" on public.photos;
create policy "Users insert own photos" on public.photos
  for insert with check (auth.uid() = user_id);

-- Storage bucket (idempotent)
insert into storage.buckets (id, name, public)
values ('photo-prints', 'photo-prints', true)
on conflict (id) do nothing;

drop policy if exists "Public read photo-prints" on storage.objects;
create policy "Public read photo-prints" on storage.objects
  for select using (bucket_id = 'photo-prints');

drop policy if exists "Auth users read own photo-prints" on storage.objects;
create policy "Auth users read own photo-prints" on storage.objects
  for select to authenticated using (bucket_id = 'photo-prints');

drop policy if exists "Auth users upload photo-prints" on storage.objects;
create policy "Auth users upload photo-prints" on storage.objects
  for insert to authenticated with check (bucket_id = 'photo-prints');

drop policy if exists "Auth users update photo-prints" on storage.objects;
create policy "Auth users update photo-prints" on storage.objects
  for update to authenticated using (bucket_id = 'photo-prints');

-- Note: server uploads use the service role (bypasses RLS). Client simulation uses authenticated policies above.
