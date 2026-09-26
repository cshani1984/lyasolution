-- SmartCrop: expanded print sizes + optional metadata
-- Run in Supabase SQL Editor after smartcrop_schema.sql

alter table public.print_sizes
  add column if not exists category text;

alter table public.print_sizes
  add column if not exists description text;

alter table public.print_sizes
  add column if not exists code text;

-- Seed / upsert catalog (names stay short for WhatsApp + hotfolder compatibility)
insert into public.print_sizes (name, width_cm, height_cm, aspect_ratio, is_default, category, description, code)
select v.name, v.width_cm, v.height_cm, v.aspect_ratio, v.is_default, v.category, v.description, v.code
from (values
  ('10x15', 10::numeric, 15::numeric, (10::numeric / 15), true, 'standard', 'הגודל הקלאסי והפופולרי ביותר', '10x15'),
  ('13x18', 13::numeric, 18::numeric, (13::numeric / 18), false, 'standard', 'מתאים למסגרות אלבום בינוניות', '13x18'),
  ('15x21', 15::numeric, 21::numeric, (15::numeric / 21), false, 'standard', 'גודל מבוקש למזכרות מאירועים', '15x21'),
  ('20x30', 20::numeric, 30::numeric, (20::numeric / 30), false, 'large', 'הגדלה רגילה למסגרות קיר', '20x30'),
  ('A4', 21::numeric, 29.7::numeric, (21::numeric / 29.7), false, 'large', 'דף מדפסת / תעודות ופוסטרים', 'A4'),
  ('Passport', 3.5::numeric, 4.5::numeric, (3.5::numeric / 4.5), false, 'passport', 'תמונת פספורט רשמית', 'Passport'),
  ('10x10', 10::numeric, 10::numeric, 1::numeric, false, 'square', 'תמונת אינסטגרם / קנבס מרובע', '10x10')
) as v(name, width_cm, height_cm, aspect_ratio, is_default, category, description, code)
where not exists (select 1 from public.print_sizes ps where ps.name = v.name);

-- Refresh aspect ratios from cm when present
update public.print_sizes
set aspect_ratio = width_cm / nullif(height_cm, 0)
where width_cm is not null and height_cm is not null;

update public.print_sizes ps
set
  category = coalesce(ps.category, v.category),
  description = coalesce(ps.description, v.description),
  code = coalesce(ps.code, v.code)
from (values
  ('10x15', 'standard', 'הגודל הקלאסי והפופולרי ביותר', '10x15'),
  ('13x18', 'standard', 'מתאים למסגרות אלבום בינוניות', '13x18'),
  ('15x21', 'standard', 'גודל מבוקש למזכרות מאירועים', '15x21'),
  ('20x30', 'large', 'הגדלה רגילה למסגרות קיר', '20x30'),
  ('A4', 'large', 'דף מדפסת / תעודות ופוסטרים', 'A4'),
  ('Passport', 'passport', 'תמונת פספורט רשמית', 'Passport'),
  ('10x10', 'square', 'תמונת אינסטגרם / קנבס מרובע', '10x10')
) as v(name, category, description, code)
where ps.name = v.name;
