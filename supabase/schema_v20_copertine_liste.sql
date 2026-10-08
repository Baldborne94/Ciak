-- v20: la copertina delle liste, che nella videoteca sono le raccolte.
--
-- Una raccolta («Studio Ghibli», «Natale») si presenta con un'immagine grande,
-- come le collezioni di TMDB. La sceglie l'utente fra le immagini dei titoli
-- della lista (il percorso TMDB, «/abc.jpg») o incolla il link di
-- un'immagine (https://…). Vuota: Ciak compone da sé un mosaico di locandine.
-- Le policy di user_lists coprono già la colonna: la cambia solo il
-- proprietario della lista.
alter table public.user_lists add column if not exists copertina text;

insert into public.schema_version (version) values (20)
on conflict (version) do nothing;
