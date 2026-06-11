-- CineVault — schema v5: tracking episodi visti
-- Esegui dopo gli schemi precedenti nel SQL Editor di Supabase.

-- Una riga = un episodio segnato come visto.
create table if not exists public.user_episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tv_id integer not null,            -- id TMDB della serie
  season_number integer not null,
  episode_number integer not null,
  watched_at timestamptz not null default now(),
  unique (user_id, tv_id, season_number, episode_number)
);

create index if not exists user_episodes_user_tv_idx
  on public.user_episodes (user_id, tv_id);

alter table public.user_episodes enable row level security;

create policy "Gli utenti gestiscono i propri episodi visti"
  on public.user_episodes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
