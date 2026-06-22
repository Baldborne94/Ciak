-- Ciak — schema v10: voti a mezza stella (stile Letterboxd)
-- Esegui dopo gli schemi precedenti nel SQL Editor di Supabase.
--
-- Perché: i cinefili vogliono granularità. Portiamo i voti da interi 1–5 a
-- valori con incrementi di 0.5 (da 0.5 a 5.0).
--
-- IMPORTANTE: i voti esistenti 1–5 restano validi così come sono (1 = 1.0
-- stella), quindi NON serve migrare i dati: cambiano solo tipo colonna e check.

-- ── user_titles.personal_rating ──────────────────────────────────────────────
alter table public.user_titles
  drop constraint if exists user_titles_personal_rating_check;

alter table public.user_titles
  alter column personal_rating type numeric(2, 1) using personal_rating::numeric(2, 1);

alter table public.user_titles
  add constraint user_titles_personal_rating_check
  check (
    personal_rating >= 0.5
    and personal_rating <= 5
    and (personal_rating * 2) = floor(personal_rating * 2)
  );

-- ── user_diary.rating ────────────────────────────────────────────────────────
alter table public.user_diary
  drop constraint if exists user_diary_rating_check;

alter table public.user_diary
  alter column rating type numeric(2, 1) using rating::numeric(2, 1);

alter table public.user_diary
  add constraint user_diary_rating_check
  check (
    rating >= 0.5
    and rating <= 5
    and (rating * 2) = floor(rating * 2)
  );
