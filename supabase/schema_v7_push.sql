-- CineVault — schema v7: notifiche push (Web Push)
-- Esegui dopo gli schemi precedenti nel SQL Editor di Supabase.

-- Subscription push del browser/dispositivo dell'utente.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "Gli utenti gestiscono le proprie subscription push"
  on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Flag separato dall'allerta in-app: traccia se la push è già stata inviata.
alter table public.user_alerts
  add column if not exists push_notified boolean not null default false;
