-- SmartCrop: allow authenticated client simulation (run in Supabase SQL Editor)
-- Adds insert on photos + storage upload for signed-in users.

drop policy if exists "Users insert own photos" on public.photos;
create policy "Users insert own photos" on public.photos
  for insert with check (auth.uid() = user_id);

drop policy if exists "Auth users upload photo-prints" on storage.objects;
create policy "Auth users upload photo-prints" on storage.objects
  for insert to authenticated with check (bucket_id = 'photo-prints');

drop policy if exists "Auth users update photo-prints" on storage.objects;
create policy "Auth users update photo-prints" on storage.objects
  for update to authenticated using (bucket_id = 'photo-prints');
