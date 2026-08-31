-- Ciak — schema v17: diario degli errori del browser
-- Esegui dopo gli schemi precedenti nel SQL Editor di Supabase.

-- Finora gli errori "best effort" finivano in console.error: cioè nella console
-- del browser dell'utente, che nessuno apre mai. Un fallimento ripetuto si
-- presentava come un dato che sparisce — è successo davvero con le statistiche,
-- scoperte sbagliate solo perché un regista aveva quattro film invece di otto.
--
-- Qui gli errori restano scritti, e le Impostazioni li mostrano.
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  -- Solo per chi ha fatto l'accesso. Una tabella su cui può scrivere chiunque
  -- è un bersaglio, e chi può agire su questi errori è comunque il titolare
  -- dell'archivio. Il prezzo dichiarato: gli errori di un visitatore non
  -- autenticato (una lista condivisa, la guida) non vengono registrati.
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Dove è successo: la stessa etichetta che logFailure scrive in console.
  contesto text not null,
  messaggio text not null,
  -- Stack o dettaglio, troncato dal client: serve a capire, non ad archiviare.
  dettaglio text,
  percorso text,
  agente text,
  created_at timestamptz not null default now()
);

alter table public.client_errors enable row level security;

create policy "Ognuno scrive e legge solo i propri errori"
  on public.client_errors for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- La lettura tipica è «gli ultimi errori, i più recenti in cima».
create index if not exists client_errors_recenti_idx
  on public.client_errors (user_id, created_at desc);

insert into public.schema_version (version) values (17)
on conflict (version) do nothing;
