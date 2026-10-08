-- v22: le saghe di TMDB modificate a mano.
--
-- Una saga di TMDB (Transformers, Alien…) si cambia dalla videoteca con
-- «✎ Modifica la saga»: diventa una saga fatta a mano (una lista con
-- come_saga) che ricorda quale collezione di TMDB sostituisce. Così i film
-- tolti tornano sciolti nell'elenco, invece di ricomparire in una seconda
-- cartella «Transformers» rifatta da TMDB.
alter table public.user_lists add column if not exists saga_tmdb integer;

insert into public.schema_version (version) values (22)
on conflict (version) do nothing;
