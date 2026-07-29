// Costruttori di dati TMDB "grezzi" (forma dell'API, non del nostro MediaItem):
// i mock li servono così come arriverebbero dalla rete, quindi i test esercitano
// anche la normalizzazione in src/lib/tmdb.ts.

export interface RawMedia {
  id: number
  media_type?: string
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  release_date?: string
  first_air_date?: string
  vote_average?: number
  vote_count?: number
  popularity?: number
  genre_ids?: number[]
  original_language?: string
}

export function movie(id: number, title: string, over: Partial<RawMedia> = {}): RawMedia {
  return {
    id,
    media_type: 'movie',
    title,
    original_title: title,
    overview: `Trama di ${title}.`,
    poster_path: `/poster-${id}.jpg`,
    release_date: '2020-05-01',
    vote_average: 7.5,
    vote_count: 1000,
    popularity: 100,
    genre_ids: [27],
    original_language: 'en',
    ...over,
  }
}

export function tv(id: number, name: string, over: Partial<RawMedia> = {}): RawMedia {
  return {
    id,
    media_type: 'tv',
    name,
    original_name: name,
    overview: `Trama di ${name}.`,
    poster_path: `/poster-${id}.jpg`,
    first_air_date: '2019-04-06',
    vote_average: 8,
    vote_count: 500,
    popularity: 80,
    genre_ids: [16],
    original_language: 'ja',
    ...over,
  }
}

// Una pagina di catalogo deterministica: "<Etichetta> 1..N" con numerazione
// continua fra le pagine, così un test può verificare che "Carica altri"
// ACCODI senza rimescolare. L'etichetta distingue le tre liste sfogliabili
// (Anime / Cartone / Pervertito) che possono convivere sulla stessa schermata.
export function browsePage(label: string, page: number, perPage = 6): RawMedia[] {
  const start = (page - 1) * perPage + 1
  const idBase = label === 'Cartone' ? 2000 : label === 'Pervertito' ? 3000 : 1000
  return Array.from({ length: perPage }, (_, i) =>
    tv(idBase + start + i, `${label} ${start + i}`, {
      vote_count: 10_000 - (start + i) * 10,
      first_air_date: `20${String(10 + ((start + i) % 15)).padStart(2, '0')}-01-01`,
      vote_average: 5 + ((start + i) % 5),
    }),
  )
}

export const animePage = (page: number, perPage = 6) => browsePage('Anime', page, perPage)

// Quale catalogo sta chiedendo la pagina, in base ai parametri di discover:
// i tre BrowseList differiscono per lingua originale e keyword.
export function labelForDiscover(params: URLSearchParams): string {
  if (params.get('with_keywords')) return 'Pervertito'
  return params.get('with_original_language') === 'ja' ? 'Anime' : 'Cartone'
}

export function movieDetail(id: number, title: string, over: Record<string, unknown> = {}) {
  return {
    id,
    title,
    original_title: title,
    overview: `Trama di ${title}.`,
    poster_path: `/poster-${id}.jpg`,
    backdrop_path: `/backdrop-${id}.jpg`,
    release_date: '2020-05-01',
    vote_average: 7.5,
    runtime: 118,
    tagline: 'Una tagline',
    status: 'Released',
    genres: [{ id: 27, name: 'Horror' }],
    original_language: 'en',
    credits: {
      cast: [{ id: 501, name: 'Attrice Uno', character: 'Protagonista', profile_path: null, order: 0 }],
      crew: [{ id: 601, name: 'Regista Uno', job: 'Director', profile_path: null }],
    },
    recommendations: { results: [] },
    similar: { results: [] },
    videos: { results: [] },
    'watch/providers': { results: {} },
    translations: { translations: [] },
    production_companies: [],
    production_countries: [],
    ...over,
  }
}

export function personDetail(id: number, name: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name,
    profile_path: `/person-${id}.jpg`,
    known_for_department: 'Directing',
    biography: `Biografia di ${name}.`,
    birthday: '1970-03-15',
    place_of_birth: 'Roma, Italia',
    ...over,
  }
}

export function collectionDetail(id: number, over: Record<string, unknown> = {}) {
  return {
    id,
    name: `Saga ${id}`,
    overview: 'Una saga di prova.',
    poster_path: `/saga-${id}.jpg`,
    backdrop_path: null,
    parts: [movie(9001, 'Capitolo Uno'), movie(9002, 'Capitolo Due')],
    ...over,
  }
}

export const TV_GENRES = [
  { id: 16, name: 'Animazione' },
  { id: 35, name: 'Commedia' },
  { id: 18, name: 'Dramma' },
]

export const MOVIE_GENRES = [
  { id: 27, name: 'Horror' },
  { id: 28, name: 'Azione' },
  { id: 35, name: 'Commedia' },
]
