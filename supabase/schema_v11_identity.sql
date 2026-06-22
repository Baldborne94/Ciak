-- Ciak v11 — Identità Cinefila
-- Esegui nel SQL Editor di Supabase DOPO schema_v2_achievements.sql.
--
-- L'identità (nickname, avatar DiceBear, tema) viene calcolata dai gusti
-- dell'utente e salvata qui, sulla stessa riga del profilo. Sostituisce
-- concettualmente i vecchi "trofei equipaggiati": l'app guarda cosa guardi e
-- ti propone tema + avatar + nickname adatti al tuo stile.

ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS nickname     text,
  ADD COLUMN IF NOT EXISTS avatar_style text,
  ADD COLUMN IF NOT EXISTS avatar_seed  text,
  ADD COLUMN IF NOT EXISTS theme        text;
