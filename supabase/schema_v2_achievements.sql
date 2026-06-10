-- CineVault v2 — Sistema Trofei
-- Esegui nel SQL Editor di Supabase DOPO schema.sql

-- Generi TMDB per calcolare i trofei basati sul genere
ALTER TABLE public.user_titles
  ADD COLUMN IF NOT EXISTS genre_ids integer[] NOT NULL DEFAULT '{}';

-- Trofei sbloccati dall'utente
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id          uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id text   NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gli utenti gestiscono i propri trofei"
  ON public.user_achievements FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Profilo utente: badge attivo scelto dall'utente
CREATE TABLE IF NOT EXISTS public.user_profile (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_achievement_id text,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gli utenti gestiscono il proprio profilo"
  ON public.user_profile FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
