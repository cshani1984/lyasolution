-- Run after contact_submissions.sql
-- Purpose: on each new lead insert, call Supabase Edge Function
-- which sends WhatsApp to owner + confirmation email to client.

create extension if not exists pg_net;

create or replace function public.notify_new_lead()
returns trigger
language plpgsql
security definer
as $$
declare
  function_url text;
  service_role_key text;
begin
  -- Set these once in SQL editor (replace placeholders):
  --   alter database postgres set app.settings.supabase_url = 'https://<project-ref>.supabase.co';
  --   alter database postgres set app.settings.service_role_key = '<SERVICE_ROLE_KEY>';
  function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/notify-new-lead';
  service_role_key := current_setting('app.settings.service_role_key', true);

  if function_url is null or service_role_key is null then
    raise warning 'Lead automation is not configured (missing app.settings.supabase_url/service_role_key)';
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'first_name', new.first_name,
      'last_name', new.last_name,
      'phone', new.phone,
      'email', new.email,
      'message', new.message,
      'creation_date', new.creation_date
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_new_lead on public.contact_submissions;

create trigger trg_notify_new_lead
after insert on public.contact_submissions
for each row
execute function public.notify_new_lead();
