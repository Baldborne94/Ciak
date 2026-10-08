-- v21: le saghe fatte a mano.
--
-- Una delle «Mie liste» segnata come saga non è più un riquadro fra le
-- raccolte: nella videoteca diventa una cartella che raccoglie i suoi film,
-- come le saghe di TMDB (Transformers, Alien…), per i film che su TMDB una
-- saga non ce l'hanno. Si crea dallo Streaming con «＋ Crea una saga».
alter table public.user_lists add column if not exists come_saga boolean not null default false;

insert into public.schema_version (version) values (21)
on conflict (version) do nothing;
