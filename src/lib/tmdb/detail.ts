import { tmdbFetch } from './client'
import { normalise, countryName, type RawMedia, type RawDetail, type RawEpisode, type RawVideo, type RawProvider } from './raw'
import { patchReadableTitles, fallbackReadableTitle, isReadableTitle } from './titles'
import type { CastMember, Company, CountryProviders, CrewMember, Episode, MediaDetail, MediaItem, Provider, TitleFacts, TmdbType } from '../types'

// "Se ti è piaciuto, guarda anche": TMDB's raw /recommendations feed is noisy
// and genre-agnostic, so we merge it with /similar and re-rank by how much each
// candidate actually overlaps with THIS title — shared genres weigh most, items
// present in both feeds get a bonus, and obscure/low-vote titles are downranked.
function buildRecommendations(raw: RawDetail, type: TmdbType): MediaItem[] {
  const currentGenres = new Set((raw.genres ?? []).map((g) => g.id))
  const recs = raw.recommendations?.results ?? []
  const sims = raw.similar?.results ?? []
  const inRec = new Set(recs.map((r) => r.id))
  const inSim = new Set(sims.map((r) => r.id))

  const byId = new Map<number, RawMedia>()
  for (const r of [...recs, ...sims]) {
    if (r.id !== raw.id && !byId.has(r.id)) byId.set(r.id, r)
  }

  const scored = [...byId.values()].map((r) => {
    const genreOverlap = (r.genre_ids ?? []).filter((g) => currentGenres.has(g)).length
    let score = genreOverlap * 2.5
    if (inRec.has(r.id) && inSim.has(r.id)) score += 3 // corroborated by both feeds
    score += Math.min(r.vote_average ?? 0, 10) * 0.3
    if ((r.vote_count ?? 0) < 20) score -= 2.5 // cut obscure noise
    if (!r.poster_path) score -= 1.5
    return { r, score, genreOverlap }
  })

  const ranked = scored.sort((a, b) => b.score - a.score)
  // Prefer items that share a genre (or are corroborated by both feeds); if that
  // leaves too few, top up with the next best-scored so the row stays full.
  const relevant = ranked.filter((s) => s.genreOverlap > 0 || (inRec.has(s.r.id) && inSim.has(s.r.id)))
  const chosen = relevant.length >= 6 ? relevant : ranked
  return chosen.slice(0, 12).map((s) => normalise(s.r, type))
}

// Versione leggera di getDetail per le statistiche: UNA richiesta invece di
// tre, e senza raccomandazioni, video, provider o traduzioni — roba che pesa
// molto e che alle statistiche non serve. È ciò che rende possibile analizzare
// l'intera collezione invece dei primi duecento titoli.
// Solo gli id dei generi di un titolo: una richiesta sola, senza credits, video
// né provider. Serve a completare i generi mancanti, dove i titoli sono
// centinaia e `getDetail` — che ne fa tre a testa — costerebbe il triplo.
export async function fetchGenreIds(type: TmdbType, id: number): Promise<number[]> {
  const raw = await tmdbFetch<RawDetail>(`/${type}/${id}`)
  return (raw.genres ?? []).map((g) => g.id)
}

export async function fetchTitleFacts(type: TmdbType, id: number): Promise<TitleFacts> {
  const raw = await tmdbFetch<RawDetail>(`/${type}/${id}`, { append_to_response: 'credits' })
  const crew = raw.credits?.crew ?? []
  const directors = crew
    .filter((c) => c.job === 'Director' || c.job === 'Creator')
    .map((c) => c.name)
  const created = (raw.created_by ?? []).map((c) => c.name)
  const date = raw.release_date || raw.first_air_date || ''
  const year = Number(date.slice(0, 4))

  return {
    genres: (raw.genres ?? []).map((g) => g.name),
    // Per le serie il "regista" è chi l'ha creata: senza, tutte le serie
    // sparirebbero dalla classifica dei registi.
    directors: directors.length > 0 ? directors : created,
    cast: (raw.credits?.cast ?? []).slice(0, 5).map((c) => c.name),
    runtime: raw.runtime ?? raw.episode_run_time?.[0] ?? null,
    year: Number.isFinite(year) && year > 1870 ? year : null,
    episodes: raw.number_of_episodes ?? null,
  }
}

export async function getDetail(
  type: TmdbType,
  id: number,
): Promise<MediaDetail> {
  const [raw, enRecs, enSims] = await Promise.all([
    tmdbFetch<RawDetail>(`/${type}/${id}`, {
      append_to_response:
        'credits,recommendations,similar,videos,watch/providers,translations,alternative_titles',
      include_video_language: 'it,en',
    }),
    tmdbFetch<{ results: RawMedia[] }>(`/${type}/${id}/recommendations`, { language: 'en-US' })
      .catch(() => ({ results: [] as RawMedia[] })),
    tmdbFetch<{ results: RawMedia[] }>(`/${type}/${id}/similar`, { language: 'en-US' })
      .catch(() => ({ results: [] as RawMedia[] })),
  ])

  // TMDB può lasciare i titoli stranieri non tradotti in it-IT (es. un film
  // coreano resta in hangul): rimpiazza gli script non leggibili col titolo
  // inglese nelle righe "Se ti è piaciuto, guarda anche".
  const enRecPool = [...enRecs.results, ...enSims.results]
  if (raw.recommendations?.results) patchReadableTitles(raw.recommendations.results, enRecPool)
  if (raw.similar?.results) patchReadableTitles(raw.similar.results, enRecPool)

  const base = normalise(raw, type)

  // Ripiego sull'inglese quando il titolo/trama in italiano non esistono e
  // l'originale è in uno script non leggibile (cirillico, CJK, …): meglio «The
  // Last Ronin» che «Последний Ронин». Le traduzioni arrivano da TMDB stesso.
  const allTranslations = raw.translations?.translations ?? []
  // TMDB può elencare più voci "en" (en-US, en-GB) e lasciarne alcune vuote:
  // cerchiamo la prima che porti davvero un testo, invece di fermarci alla
  // prima in elenco e concludere che l'inglese non esista.
  const englishTitle =
    allTranslations.find((t) => t.iso_639_1 === 'en' && (t.data?.title || t.data?.name))?.data
      ?.title ??
    allTranslations.find((t) => t.iso_639_1 === 'en' && t.data?.name)?.data?.name ??
    null
  const englishOverview =
    allTranslations.find((t) => t.iso_639_1 === 'en' && t.data?.overview?.trim())?.data?.overview ??
    null
  const alternativeTitles =
    raw.alternative_titles?.titles ?? raw.alternative_titles?.results ?? []
  const readableFallback = fallbackReadableTitle(englishTitle, alternativeTitles, allTranslations)
  const title =
    !isReadableTitle(base.title) && !isReadableTitle(base.originalTitle) && readableFallback
      ? readableFallback
      : base.title
  const overview = base.overview?.trim() ? base.overview : englishOverview ?? base.overview
  const cast: CastMember[] = (raw.credits?.cast ?? []).slice(0, 12).map((c) => ({
    id: c.id,
    name: c.name,
    character: c.character ?? '',
    profilePath: c.profile_path ?? null,
  }))

  const crewRaw = raw.credits?.crew ?? []
  const crew: CrewMember[] = crewRaw.map((c) => ({
    id: c.id,
    name: c.name,
    job: c.job ?? '',
    profilePath: c.profile_path ?? null,
  }))

  // Directors for movies; creators for TV
  const directorsRaw: { id: number; name: string }[] =
    type === 'tv'
      ? (raw.created_by ?? []).map((c) => ({ id: c.id, name: c.name }))
      : crewRaw.filter((c) => c.job === 'Director').map((c) => ({ id: c.id, name: c.name }))

  const productionCompanies: Company[] = (raw.production_companies ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    logoPath: c.logo_path ?? null,
  }))

  const recommendations = buildRecommendations(raw, type)

  // Il trailer da mostrare, scelto fra i video che TMDB associa a QUESTO titolo.
  // I video sono contributi degli utenti e capita che qualcuno carichi la chiave
  // sbagliata: non possiamo saperlo con certezza, ma preferire un ufficiale
  // nella lingua giusta riduce le probabilità di pescare una voce raffazzonata.
  const videos = (raw.videos?.results ?? []).filter((v) => v.site === 'YouTube')
  const piuRecente = (a: RawVideo, b: RawVideo) =>
    (b.published_at ?? '').localeCompare(a.published_at ?? '')
  const scegli = (pred: (v: RawVideo) => boolean) =>
    videos.filter(pred).sort(piuRecente)[0]

  const trailer =
    scegli((v) => v.type === 'Trailer' && !!v.official && v.iso_639_1 === 'it') ??
    scegli((v) => v.type === 'Trailer' && !!v.official) ??
    scegli((v) => v.type === 'Trailer') ??
    scegli((v) => v.type === 'Teaser') ??
    videos[0]

  // Where to watch — all countries TMDB has data for, IT first.
  const mapProviders = (list?: RawProvider[]): Provider[] =>
    (list ?? []).map((p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path ?? null }))
  const regions = raw['watch/providers']?.results ?? {}
  const watchProvidersByCountry: CountryProviders[] = Object.entries(regions)
    .map(([code, region]): CountryProviders => ({
      code,
      name: countryName(code),
      providers: {
        link: region.link ?? null,
        flatrate: mapProviders(region.flatrate),
        rent: mapProviders(region.rent),
        buy: mapProviders(region.buy),
      },
    }))
    // Drop countries with no actual streaming/rent/buy options.
    .filter((c) => c.providers.flatrate.length || c.providers.rent.length || c.providers.buy.length)
    .sort((a, b) => {
      if (a.code === 'IT') return -1
      if (b.code === 'IT') return 1
      return a.name.localeCompare(b.name, 'it')
    })
  const watchProviders = watchProvidersByCountry.find((c) => c.code === 'IT')?.providers
    ?? watchProvidersByCountry[0]?.providers
    ?? null

  return {
    ...base,
    title,
    overview,
    // L'endpoint dettaglio espone i generi come oggetti (`genres`), non come
    // `genre_ids` (presente solo in liste/ricerca). Ricaviamo qui gli id, così
    // i titoli salvati conservano i generi — servono al "Profilo di gusto".
    genreIds: (raw.genres ?? []).map((g) => g.id),
    genres: raw.genres ?? [],
    runtime: raw.runtime ?? raw.episode_run_time?.[0] ?? null,
    tagline: raw.tagline ?? null,
    cast,
    crew,
    recommendations,
    originalTitle: raw.original_title ?? raw.original_name ?? null,
    originalLanguage: raw.original_language ?? null,
    status: raw.status ?? null,
    productionCompanies,
    productionCountries: (raw.production_countries ?? []).map((c) => c.name),
    budget: raw.budget ?? null,
    revenue: raw.revenue ?? null,
    homepage: raw.homepage ?? null,
    numberOfSeasons: raw.number_of_seasons ?? null,
    numberOfEpisodes: raw.number_of_episodes ?? null,
    directors: directorsRaw.filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i),
    trailerKey: trailer?.key ?? null,
    watchProviders,
    watchProvidersByCountry,
    collection: raw.belongs_to_collection
      ? {
          id: raw.belongs_to_collection.id,
          name: raw.belongs_to_collection.name,
          posterPath: raw.belongs_to_collection.poster_path ?? null,
        }
      : null,
    seasons: (raw.seasons ?? [])
      .filter((s) => (s.episode_count ?? 0) > 0)
      .map((s) => ({
        id: s.id,
        seasonNumber: s.season_number,
        name: s.name,
        episodeCount: s.episode_count ?? 0,
        airDate: s.air_date ?? null,
        posterPath: s.poster_path ?? null,
        overview: s.overview || null,
      }))
      .sort((a, b) => a.seasonNumber - b.seasonNumber),
  }
}

export async function getSeason(tvId: number, seasonNumber: number): Promise<Episode[]> {
  const raw = await tmdbFetch<{ episodes?: RawEpisode[] }>(`/tv/${tvId}/season/${seasonNumber}`)
  return (raw.episodes ?? []).map((e) => ({
    id: e.id,
    episodeNumber: e.episode_number,
    name: e.name,
    overview: e.overview ?? '',
    airDate: e.air_date ?? null,
    runtime: e.runtime ?? null,
    voteAverage: e.vote_average ?? 0,
    stillPath: e.still_path ?? null,
  }))
}

// ── Discover / browse ─────────────────────────────────────────────────────

// Recommendations for a specific title (used on Dashboard for "Per te").
export async function getRecommendations(
  type: TmdbType,
  id: number,
): Promise<MediaItem[]> {
  try {
    const [data, enData] = await Promise.all([
      tmdbFetch<{ results: RawMedia[] }>(`/${type}/${id}/recommendations`),
      tmdbFetch<{ results: RawMedia[] }>(`/${type}/${id}/recommendations`, { language: 'en-US' }),
    ])
    patchReadableTitles(data.results, enData.results)
    return (data.results ?? []).slice(0, 20).map((r) => normalise(r, type))
  } catch {
    return []
  }
}
