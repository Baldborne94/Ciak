-- Ciak — schema v15: trailer scelto dall'utente
-- Esegui dopo gli schemi precedenti nel SQL Editor di Supabase.

-- I video su TMDB sono contributi degli utenti e ogni tanto sono sbagliati (è
-- capitato un trailer di Reacher sulla scheda di un altro film). Qui l'utente
-- può indicare il video giusto per un titolo: vince su quello di TMDB.
--
-- Tabella a sé e non una colonna di user_titles, perché si può voler correggere
-- il trailer di un film che non si ha in collezione — senza doverlo aggiungere.
create table if not exists public.user_trailers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_id integer not null,
  -- 'movie' | 'tv': gli id TMDB sono unici solo dentro un tipo, quindi la
  -- chiave naturale è la coppia, mai il solo numero.
  media_type text not null,
  youtube_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);

alter table public.user_trailers enable row level security;

create policy "Gli utenti gestiscono i propri trailer"
  on public.user_trailers for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- La lettura tipica è "questo titolo ha un trailer mio?": una riga per utente e
-- titolo, servita dall'indice della unique qui sopra.
