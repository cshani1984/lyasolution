-- SmartCrop: sync auth.users.phone → profiles.phone (fixes WhatsApp studio match)
-- Run once in Supabase → SQL Editor.
-- Your log showed profilesWithPhone = 0 — WhatsApp cannot find the studio until this is set.

-- 1) Copy phone from auth.users onto matching profile rows
update public.profiles p
set phone = case
  when u.phone like '+%' then u.phone
  when u.phone ~ '^[0-9]+$' then '+' || u.phone
  else u.phone
end
from auth.users u
where p.id = u.id
  and u.phone is not null
  and u.phone <> ''
  and (p.phone is null or p.phone = '');

-- 2) If your studio phone is known, force-set it (edit UUID if needed):
-- update public.profiles
-- set phone = '+972509250384'
-- where id = (select id from auth.users where phone like '%509250384%' limit 1);

-- 3) Verify
select id, phone, email, full_name
from public.profiles
where phone is not null
order by phone;
