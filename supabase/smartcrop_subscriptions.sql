-- SmartCrop: subscription tier + Generative AI monthly quota
-- Run in Supabase → SQL Editor after smartcrop_schema.sql

alter table public.profiles
  add column if not exists subscription_tier text default 'basic'
    check (subscription_tier in ('demo', 'basic', 'pro'));

alter table public.profiles
  add column if not exists generative_ai_used_this_month integer default 0;

alter table public.profiles
  add column if not exists generative_ai_period_ym text;

-- Optional: mark photos that used generative fill
alter table public.photos
  add column if not exists generative_fill_url text;

alter table public.photos
  add column if not exists recommend_generative_fill boolean default false;

comment on column public.profiles.subscription_tier is 'demo | basic | pro';
comment on column public.profiles.generative_ai_used_this_month is 'Clipdrop Uncrop calls in generative_ai_period_ym';
