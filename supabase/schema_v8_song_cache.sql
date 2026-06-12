-- Ciak — schema v8: cache delle ricerche "Canzone → film"
-- Esegui dopo gli schemi precedenti nel SQL Editor di Supabase.

create table if not exists public.user_song_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  query_key text not null,         -- query normalizzata (chiave)
  query text not null,             -- query come digitata (per mostrarla)
  results jsonb not null,          -- risultati già risolti (item + nota)
  created_at timestamptz not null default now(),
  unique (user_id, query_key)
);

create index if not exists user_song_cache_user_idx
  on public.user_song_cache (user_id, created_at desc);

alter table public.user_song_cache enable row level security;

create policy "Gli utenti gestiscono la propria cache canzoni"
  on public.user_song_cache
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
