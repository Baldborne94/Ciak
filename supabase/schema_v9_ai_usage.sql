-- Ciak — schema v9: limite giornaliero di usi AI lato server
-- Esegui dopo gli schemi precedenti nel SQL Editor di Supabase.
--
-- Perché: il limite client (localStorage) si aggira svuotando la cache e non
-- protegge dalle chiamate dirette agli endpoint /api/*. Qui il conteggio vive
-- su DB e viene incrementato in modo atomico SOLO dal server (service role),
-- così i crediti Anthropic sono davvero protetti.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

-- L'utente può LEGGERE il proprio contatore (per mostrare "usi rimasti oggi").
-- Nessuna policy di insert/update/delete: solo il service role (che bypassa la
-- RLS) può scrivere, tramite la funzione qui sotto.
drop policy if exists "Leggi il proprio uso AI" on public.ai_usage;
create policy "Leggi il proprio uso AI"
  on public.ai_usage
  for select
  using (auth.uid() = user_id);

-- Prenota in modo atomico un uso AI per oggi (UTC).
-- Ritorna il nuovo conteggio se consentito, oppure -1 se il limite è raggiunto.
create or replace function public.consume_ai_credit(p_user_id uuid, p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_count int;
begin
  insert into public.ai_usage (user_id, day, count)
  values (p_user_id, v_today, 0)
  on conflict (user_id, day) do nothing;

  select count into v_count
  from public.ai_usage
  where user_id = p_user_id and day = v_today
  for update;

  if v_count >= p_limit then
    return -1;
  end if;

  update public.ai_usage
  set count = count + 1
  where user_id = p_user_id and day = v_today
  returning count into v_count;

  return v_count;
end;
$$;
