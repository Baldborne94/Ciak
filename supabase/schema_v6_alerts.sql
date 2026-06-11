-- CineVault — schema v6: avvisi di uscita ("avvisami quando esce")
-- Esegui dopo gli schemi precedenti nel SQL Editor di Supabase.

create table if not exists public.user_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tmdb_id integer not null,
  media_type text not null,
  title text not null,
  poster_path text,
  release_date date,
  notified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);

create index if not exists user_alerts_user_idx on public.user_alerts (user_id);

alter table public.user_alerts enable row level security;

create policy "Gli utenti gestiscono i propri avvisi"
  on public.user_alerts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
