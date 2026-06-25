-- Ciak — schema v13: watchlist "Da vedere" condivisibile
-- Esegui dopo gli schemi precedenti nel SQL Editor di Supabase.

-- Opt-in per la condivisione della watchlist: di default privata. Quando true,
-- chiunque abbia il link può vedere (sola lettura) i titoli "to_watch".
alter table public.user_profile
  add column if not exists watchlist_public boolean not null default false;

-- Lettura pubblica della watchlist tramite funzione SECURITY DEFINER: aggira la
-- RLS in modo controllato, restituendo SOLO i titoli "to_watch" e SOLO se il
-- proprietario ha attivato la condivisione. Espone i campi minimi (niente voti,
-- note o stato di altri titoli).
create or replace function public.get_public_watchlist(target uuid)
returns table (tmdb_id integer, media_type text, title text, poster_path text)
language sql
security definer
set search_path = public
as $$
  select t.tmdb_id, t.media_type, t.title, t.poster_path
  from public.user_titles t
  join public.user_profile p on p.user_id = t.user_id
  where t.user_id = target
    and t.status = 'to_watch'
    and p.watchlist_public = true
  order by t.updated_at desc
$$;

-- Anche i visitatori non autenticati possono chiamarla (gating dentro la query).
grant execute on function public.get_public_watchlist(uuid) to anon, authenticated;
