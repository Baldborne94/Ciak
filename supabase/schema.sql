-- ════════════════════════════════════════════════════════════════════
--  CineVault — Schema database Supabase
--  Esegui questo file nel SQL Editor del dashboard Supabase.
--  Tutte le tabelle sono protette da Row Level Security: ogni utente
--  vede e modifica SOLO i propri dati.
-- ════════════════════════════════════════════════════════════════════

-- Estensione per generare UUID
create extension if not exists "pgcrypto";

-- ─── Tabella: user_titles ───────────────────────────────────────────
-- Interazioni personali con i titoli del catalogo TMDB.
create table if not exists public.user_titles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  tmdb_id         integer not null,
  media_type      text not null check (media_type in ('movie', 'tv', 'anime', 'cartoon')),
  status          text not null check (status in ('watched', 'to_watch', 'in_progress', 'abandoned')),
  is_favorite     boolean not null default false,
  personal_rating integer check (personal_rating between 1 and 5),
  notes           text,
  watched_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Un utente ha al massimo una riga per ciascun titolo.
  unique (user_id, tmdb_id, media_type)
);

create index if not exists user_titles_user_idx      on public.user_titles (user_id);
create index if not exists user_titles_status_idx    on public.user_titles (user_id, status);
create index if not exists user_titles_favorite_idx  on public.user_titles (user_id) where is_favorite;

-- ─── Tabella: user_preferences ──────────────────────────────────────
-- Preferenze per calibrare le raccomandazioni AI. Una riga per utente.
create table if not exists public.user_preferences (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users (id) on delete cascade,
  preferred_genres    text[] not null default '{}',
  excluded_genres     text[] not null default '{}',
  preferred_languages text[] not null default '{}',
  updated_at          timestamptz not null default now()
);

-- ─── Trigger: aggiorna updated_at automaticamente ───────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_titles_updated on public.user_titles;
create trigger trg_user_titles_updated
  before update on public.user_titles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_user_preferences_updated on public.user_preferences;
create trigger trg_user_preferences_updated
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════
--  Row Level Security
-- ════════════════════════════════════════════════════════════════════
alter table public.user_titles      enable row level security;
alter table public.user_preferences enable row level security;

-- user_titles: l'utente accede solo alle proprie righe.
drop policy if exists "own titles - select" on public.user_titles;
create policy "own titles - select" on public.user_titles
  for select using (auth.uid() = user_id);

drop policy if exists "own titles - insert" on public.user_titles;
create policy "own titles - insert" on public.user_titles
  for insert with check (auth.uid() = user_id);

drop policy if exists "own titles - update" on public.user_titles;
create policy "own titles - update" on public.user_titles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own titles - delete" on public.user_titles;
create policy "own titles - delete" on public.user_titles
  for delete using (auth.uid() = user_id);

-- user_preferences: stessa regola.
drop policy if exists "own prefs - select" on public.user_preferences;
create policy "own prefs - select" on public.user_preferences
  for select using (auth.uid() = user_id);

drop policy if exists "own prefs - insert" on public.user_preferences;
create policy "own prefs - insert" on public.user_preferences
  for insert with check (auth.uid() = user_id);

drop policy if exists "own prefs - update" on public.user_preferences;
create policy "own prefs - update" on public.user_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
