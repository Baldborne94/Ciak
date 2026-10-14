-- v23: via il permesso permanente di Google Drive.
--
-- Ciak non usa più Google Drive: la videoteca sta sul disco. La tabella della
-- v19 teneva però ancora il «refresh token» di Google, con cui si legge tutto
-- il Drive dell'utente e che Google considera valido finché non lo si revoca.
-- Senza codice che lo usi è solo un rischio: si cancella, righe comprese.
-- (Il permesso va tolto anche da Google: myaccount.google.com/permissions.)
drop table if exists public.drive_tokens;

insert into public.schema_version (version) values (23)
on conflict (version) do nothing;
