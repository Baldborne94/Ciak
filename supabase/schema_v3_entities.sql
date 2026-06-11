-- CineVault — schema v3: preferiti per persone e studi
-- Esegui dopo schema.sql e schema_v2_achievements.sql nel SQL Editor di Supabase.

-- Salva persone (attori/registi/compositori) e studi tra i preferiti.
create table if not exists public.user_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null check (entity_type in ('person', 'company')),
  entity_id integer not null,            -- id TMDB della persona o dello studio
  name text not null,
  image_path text,                       -- profile_path / logo_path
  subtitle text,                         -- ruolo (es. "Regista") o nota
  created_at timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);

create index if not exists user_entities_user_idx
  on public.user_entities (user_id, entity_type);

-- Row Level Security: ogni utente gestisce solo i propri preferiti.
alter table public.user_entities enable row level security;

create policy "Gli utenti gestiscono le proprie entità preferite"
  on public.user_entities
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
