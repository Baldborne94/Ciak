-- Ciak — schema v14: "Da rivedere" (rewatch)
-- Esegui dopo gli schemi precedenti nel SQL Editor di Supabase.

-- Permette di rimettere un film GIÀ VISTO nella watchlist "Da vedere" senza
-- perderne lo stato "Visto". Lo stato resta singolo; questo è un flag a parte.
alter table public.user_titles
  add column if not exists rewatch boolean not null default false;

-- Indice per filtrare in fretta i titoli marcati per la rivisione.
create index if not exists user_titles_rewatch_idx
  on public.user_titles (user_id) where rewatch;
