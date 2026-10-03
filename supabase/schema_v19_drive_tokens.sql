-- Ciak — schema v19: il permesso permanente di Google Drive
-- Esegui dopo gli schemi precedenti nel SQL Editor di Supabase.

-- Il permesso di Google per leggere Drive dura un'ora, e il browser da solo
-- può solo tornare da Google a chiederne un altro: un redirect a ogni
-- apertura, che a volte finisce col pulsante «Collega Google Drive». Qui sta
-- il «refresh token» che Google dà al server di Ciak (api/drive-callback):
-- con quello il server rinnova il permesso quando serve (api/drive-token),
-- senza che si veda niente.
create table if not exists public.drive_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

-- Nessuna policy, apposta: ci legge e ci scrive solo il server di Ciak con la
-- chiave service_role. Il refresh token non deve mai arrivare nel browser,
-- nemmeno a chi ne è il proprietario: con quello si legge tutto il suo Drive.
alter table public.drive_tokens enable row level security;

insert into public.schema_version (version) values (19)
on conflict (version) do nothing;
