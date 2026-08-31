import { tmdbFetch } from './client'
import { normalise, type RawPerson, type RawCredit } from './raw'
import { patchReadableTitles } from './titles'
import type { MediaItem, Person, PersonDetail } from '../types'

export async function resolvePeople(names: string[]): Promise<Person[]> {
  const found = await Promise.all(
    names.map((n) => searchPerson(n).then((r) => r[0] ?? null).catch(() => null)),
  )
  return found.filter((p): p is Person => p !== null)
}

// ── People (actors / directors) ────────────────────────────────────────────

export async function searchPerson(query: string): Promise<Person[]> {
  if (!query.trim()) return []
  const data = await tmdbFetch<{ results: RawPerson[] }>('/search/person', {
    query,
    include_adult: 'false',
  })
  return data.results
    .slice()
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .map((p) => ({
    id: p.id,
    name: p.name,
    profilePath: p.profile_path ?? null,
    department: p.known_for_department ?? null,
    knownFor: (p.known_for ?? [])
      .map((m) => m.title ?? m.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ') || null,
  }))
}

// Genres that aren't real filmography: documentaries about the person,
// concerts, "making of", talk shows, news, reality.
const NON_FILMOGRAPHY_GENRES = new Set([99, 10402, 10767, 10763, 10764])

// Billing order threshold (TMDB's cast "order", 0 = top-billed) below which we
// consider someone "cast principale" — used to only surface upcoming titles
// from a followed actor when they're actually a lead, not a cameo/minor role.
const MAIN_CAST_ORDER_MAX = 9

function mainCastKeys(cast: RawCredit[]): Set<string> {
  const keys = new Set<string>()
  for (const c of cast) {
    if (c.media_type !== 'movie' && c.media_type !== 'tv') continue
    if (typeof c.order === 'number' && c.order <= MAIN_CAST_ORDER_MAX) {
      keys.add(`${c.media_type}-${c.id}`)
    }
  }
  return keys
}

// Keep only the credits relevant to the person's primary role.
function dedupeAndClean(pool: RawCredit[]): MediaItem[] {
  const byKey = new Map<string, RawCredit>()
  for (const m of pool) {
    if (m.media_type !== 'movie' && m.media_type !== 'tv') continue
    if (!m.poster_path) continue
    if ((m.genre_ids ?? []).some((g) => NON_FILMOGRAPHY_GENRES.has(g))) continue
    if ((m.vote_count ?? 0) < 10) continue // drop obscure entries
    const key = `${m.media_type}-${m.id}`
    const existing = byKey.get(key)
    if (!existing || (m.popularity ?? 0) > (existing.popularity ?? 0)) {
      byKey.set(key, m)
    }
  }
  return [...byKey.values()]
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .map((m) => normalise(m))
}

export async function getPersonDetail(id: number): Promise<PersonDetail> {
  const [raw, enCredits] = await Promise.all([
    tmdbFetch<
      RawPerson & { combined_credits?: { cast?: RawCredit[]; crew?: RawCredit[] } }
    >(`/person/${id}`, { append_to_response: 'combined_credits' }),
    tmdbFetch<{ cast?: RawCredit[]; crew?: RawCredit[] }>(`/person/${id}/combined_credits`, {
      language: 'en-US',
    }).catch(() => ({ cast: [] as RawCredit[], crew: [] as RawCredit[] })),
  ])

  const dept = raw.known_for_department ?? 'Acting'
  const cast = raw.combined_credits?.cast ?? []
  const crew = raw.combined_credits?.crew ?? []

  // Ripiego sull'inglese per i titoli che TMDB non traduce in italiano (script
  // non leggibili): la filmografia mostra così un nome leggibile invece del raw.
  const enCreditPool = [...(enCredits.cast ?? []), ...(enCredits.crew ?? [])]
  patchReadableTitles(cast, enCreditPool)
  patchReadableTitles(crew, enCreditPool)

  // Actors → where they acted (cast). Others → crew work in their department
  // (director → directed, composer → scored, writer → wrote).
  const pool =
    dept === 'Acting' ? cast : crew.filter((m) => m.department === dept)

  // Fallback to everything if the role-specific pool is empty.
  let uniqueCredits = dedupeAndClean(pool)
  if (uniqueCredits.length === 0) {
    uniqueCredits = dedupeAndClean([...cast, ...crew])
  }

  return {
    id: raw.id,
    name: raw.name,
    profilePath: raw.profile_path ?? null,
    department: raw.known_for_department ?? null,
    knownFor: raw.known_for_department ?? null,
    biography: raw.biography || null,
    birthday: raw.birthday ?? null,
    placeOfBirth: raw.place_of_birth ?? null,
    credits: uniqueCredits,
    // "mediaType-id" keys (billing order ≤ MAIN_CAST_ORDER_MAX in the acting
    // credits) — lets callers show only titles where this person is a lead.
    mainCastKeys: [...mainCastKeys(cast)],
  }
}

// ── Collections / sagas ────────────────────────────────────────────────────
