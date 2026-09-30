-- Ciak — schema v18: i film di Drive collegati all'archivio
-- Esegui dopo gli schemi precedenti nel SQL Editor di Supabase.

-- Un file su Drive («Song.of.the.Sea.2014.1080p.mp4») e la scheda di un titolo
-- su TMDB sono due cose che Ciak non sapeva mettere insieme: il lettore non
-- poteva segnare il film come visto, spuntare l'episodio, né riprendere da
-- dove ci si era fermati. Qui sta il legame, uno per file, insieme al punto
-- della visione — così la ripresa vale anche passando dal tablet al computer.
create table if not exists public.user_streaming (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- L'id del file su Google Drive.
  drive_file_id text not null,
  nome_file text,
  -- Il titolo abbinato. Nulli finché il riconoscimento non trova niente.
  tmdb_id integer,
  media_type text check (media_type in ('movie', 'tv')),
  titolo text,
  poster_path text,
  -- Solo per gli episodi di una serie.
  stagione integer,
  episodio integer,
  -- Scelto a mano: il riconoscimento automatico non lo sovrascrive più.
  abbinato_a_mano boolean not null default false,
  -- Dove ci si è fermati e quanto dura, in secondi.
  posizione real not null default 0,
  durata real,
  -- Secondi davvero guardati: saltare alla fine non vale come «visto».
  secondi_visti real not null default 0,
  visto_il timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, drive_file_id)
);

alter table public.user_streaming enable row level security;

create policy "Ognuno vede e modifica solo i propri film in streaming"
  on public.user_streaming for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- «Prossimo episodio»: gli altri file della stessa serie.
create index if not exists user_streaming_titolo_idx
  on public.user_streaming (user_id, media_type, tmdb_id);

insert into public.schema_version (version) values (18)
on conflict (version) do nothing;
