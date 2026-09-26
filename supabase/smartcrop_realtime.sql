-- Enable live dashboard updates when WhatsApp webhook inserts photos
-- Run in Supabase → SQL Editor (safe to re-run)

do $$
begin
  alter publication supabase_realtime add table public.photos;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'supabase_realtime publication missing — enable Realtime in Dashboard → Database → Replication';
end $$;
