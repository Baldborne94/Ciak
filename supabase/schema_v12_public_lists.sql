-- Ciak — schema v12: liste personali condivisibili
-- Esegui dopo gli schemi precedenti nel SQL Editor di Supabase.

-- Una lista può essere resa pubblica: chiunque abbia il link può vederla
-- (sola lettura). Default: privata.
alter table public.user_lists
  add column if not exists is_public boolean not null default false;

-- Policy aggiuntive di SOLA LETTURA per le liste pubbliche. Si sommano (OR) alle
-- policy esistenti del proprietario: chi possiede la lista mantiene pieno
-- accesso, tutti gli altri possono solo leggere le liste marcate pubbliche.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_lists'
      and policyname = 'Liste pubbliche leggibili da tutti'
  ) then
    create policy "Liste pubbliche leggibili da tutti"
      on public.user_lists
      for select
      using (is_public = true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_list_items'
      and policyname = 'Elementi di liste pubbliche leggibili da tutti'
  ) then
    create policy "Elementi di liste pubbliche leggibili da tutti"
      on public.user_list_items
      for select
      using (
        exists (
          select 1 from public.user_lists l
          where l.id = user_list_items.list_id and l.is_public = true
        )
      );
  end if;
end $$;
