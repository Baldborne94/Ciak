-- CineVault — schema Supabase
-- Solo i dati PERSONALI vengono salvati qui. Il catalogo resta su TMDB (live).
-- Esegui questo script nel SQL Editor di Supabase.

-- ── Tabella user_titles ─────────────────────────────────────────────────────
-- Traccia le interazioni personali con ogni titolo.
create table if not exists public.user_titles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie', 'tv', 'anime', 'cartoon')),
  title text not null,
  poster_path text,
  status text not null check (status in ('watched', 'to_watch', 'in_progress', 'abandoned')),
  is_favorite boolean not null default false,
  personal_rating integer check (personal_rating between 1 and 5),
  notes text,
  watched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un utente ha al massimo una riga per titolo.
  unique (user_id, tmdb_id, media_type)
);

create index if not exists user_titles_user_id_idx on public.user_titles (user_id);
create index if not exists user_titles_status_idx on public.user_titles (user_id, status);
create index if not exists user_titles_favorite_idx
  on public.user_titles (user_id) where is_favorite;

-- ── Tabella user_preferences ────────────────────────────────────────────────
-- Calibra le raccomandazioni AI.
create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  preferred_genres text[] not null default '{}',
  excluded_genres text[] not null default '{}',
  preferred_languages text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- ── Trigger updated_at ──────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_titles_set_updated_at on public.user_titles;
create trigger user_titles_set_updated_at
  before update on public.user_titles
  for each row execute function public.set_updated_at();

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Ogni utente vede e modifica SOLO i propri dati.
alter table public.user_titles enable row level security;
alter table public.user_preferences enable row level security;

create policy "Gli utenti gestiscono i propri titoli"
  on public.user_titles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Gli utenti gestiscono le proprie preferenze"
  on public.user_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
