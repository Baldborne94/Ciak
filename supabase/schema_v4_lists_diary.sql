-- CineVault — schema v4: liste personali tematiche + diario di visione
-- Esegui dopo gli schemi precedenti nel SQL Editor di Supabase.

-- ── Liste personali tematiche ───────────────────────────────────────────────
create table if not exists public.user_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.user_lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  tmdb_id integer not null,
  media_type text not null,
  title text not null,
  poster_path text,
  added_at timestamptz not null default now(),
  unique (list_id, tmdb_id, media_type)
);

create index if not exists user_lists_user_idx on public.user_lists (user_id);
create index if not exists user_list_items_list_idx on public.user_list_items (list_id);

-- ── Diario di visione ───────────────────────────────────────────────────────
create table if not exists public.user_diary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tmdb_id integer not null,
  media_type text not null,
  title text not null,
  poster_path text,
  watched_on date not null default current_date,
  rating integer check (rating between 1 and 5),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists user_diary_user_idx on public.user_diary (user_id, watched_on desc);

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.user_lists enable row level security;
alter table public.user_list_items enable row level security;
alter table public.user_diary enable row level security;

create policy "Gli utenti gestiscono le proprie liste"
  on public.user_lists for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Gli utenti gestiscono gli elementi delle proprie liste"
  on public.user_list_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Gli utenti gestiscono il proprio diario"
  on public.user_diary for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
