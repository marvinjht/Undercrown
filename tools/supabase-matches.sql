-- Undercrown match database. Paste this into Supabase: SQL Editor -> New query -> Run.
-- The game (with its public key) can only ADD rows. Reading, changing and deleting stay with you in the dashboard.

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  version text,
  room_code text,
  players int,
  bots int,
  champion text,
  data jsonb not null,
  constraint matches_size check (pg_column_size(data) < 500000)
);

alter table public.matches enable row level security;

drop policy if exists "game can add matches" on public.matches;
create policy "game can add matches" on public.matches
  for insert to anon with check (true);

grant insert on public.matches to anon;
