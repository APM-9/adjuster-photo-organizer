-- Cloud sync setup for the field adjuster app.
-- Run once: Supabase dashboard > SQL Editor > New query > paste all > Run.
-- Safe to run again.

-- Claims: one row per claim. `data` holds the whole claim (rooms, notes,
-- damage lines) as the app stores it.
create table if not exists public.claims (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Photos: labels and links here; the image files live in the `photos`
-- storage bucket under <user id>/<photo id>/.
create table if not exists public.photos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  claim_id text,
  meta jsonb,
  blob_rev integer not null default 1,
  has_original boolean not null default false,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists claims_user_updated on public.claims (user_id, updated_at);
create index if not exists photos_user_updated on public.photos (user_id, updated_at);

-- The server sets updated_at, so devices with wrong clocks still sync.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists claims_touch on public.claims;
create trigger claims_touch before insert or update on public.claims
  for each row execute function public.touch_updated_at();
drop trigger if exists photos_touch on public.photos;
create trigger photos_touch before insert or update on public.photos
  for each row execute function public.touch_updated_at();

-- Row-level security: each signed-in adjuster sees only their own rows.
alter table public.claims enable row level security;
alter table public.photos enable row level security;

drop policy if exists "own claims" on public.claims;
create policy "own claims" on public.claims for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own photos" on public.photos;
create policy "own photos" on public.photos for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Private storage bucket. Files are only reachable by their owner.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "own photo files: read" on storage.objects;
create policy "own photo files: read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own photo files: add" on storage.objects;
create policy "own photo files: add" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own photo files: replace" on storage.objects;
create policy "own photo files: replace" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own photo files: delete" on storage.objects;
create policy "own photo files: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
