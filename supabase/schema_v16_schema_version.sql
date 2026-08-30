-- Ciak — schema v16: registro delle versioni dello schema
-- Esegui dopo gli schemi precedenti nel SQL Editor di Supabase.

-- Fino a qui i file SQL si eseguivano a mano senza lasciare traccia: nessuno
-- poteva dire quale versione fosse davvero applicata a un progetto Supabase.
-- È già costato caro — una funzione è finita in produzione prima della tabella
-- che le serviva, e l'app se n'è accorta solo fallendo un salvataggio.
--
-- Questa tabella è il registro: una riga per ogni file SQL applicato. L'app
-- legge la versione più alta all'avvio e avvisa quando il database è indietro
-- rispetto al codice, invece di lasciare che l'utente lo scopra da un errore.
create table if not exists public.schema_version (
  version integer primary key,
  applied_at timestamptz not null default now()
);

alter table public.schema_version enable row level security;

-- Lettura libera: non è un dato personale, ed è ciò che permette all'app di
-- accorgersi del disallineamento anche prima del login. Nessuna policy di
-- scrittura: le righe le aggiungono i file SQL, eseguiti da chi amministra il
-- progetto — dal browser questa tabella è di sola lettura.
create policy "La versione dello schema è leggibile da tutti"
  on public.schema_version for select using (true);

-- Le versioni da 1 a 15 vengono date per applicate: chi arriva a eseguire
-- questo file ha già eseguito i precedenti, sia partendo da zero sia
-- aggiornando un progetto esistente. È l'unico punto in cui si dà qualcosa per
-- scontato; da qui in avanti ogni file registra la propria versione.
insert into public.schema_version (version)
select generazione.v from generate_series(1, 16) as generazione(v)
on conflict (version) do nothing;

-- PROMEMORIA per i prossimi schemi: ogni nuovo file schema_vN_*.sql deve
-- chiudersi con la propria riga, e il codice deve alzare SCHEMA_RICHIESTO in
-- src/lib/schemaVersion.ts:
--
--   insert into public.schema_version (version) values (N)
--   on conflict (version) do nothing;
