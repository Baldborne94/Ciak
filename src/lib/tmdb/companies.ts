import { tmdbFetch } from './client'
import { normalise, type RawCompany, type RawMedia } from './raw'
import { patchReadableTitles, isReadableTitle } from './titles'
import type { Company, MediaItem } from '../types'

// Resolve a curated list of names to real TMDB entities (with logos/photos),
// taking the top match for each. Used for the idle "famous" previews.
export async function resolveStudios(names: string[]): Promise<Company[]> {
  const found = await Promise.all(
    names.map((n) => searchCompany(n).then((r) => r[0] ?? null).catch(() => null)),
  )
  return found.filter((c): c is Company => c !== null)
}

export async function searchCompany(query: string): Promise<Company[]> {
  if (!query.trim()) return []
  const data = await tmdbFetch<{ results: RawCompany[] }>('/search/company', {
    query,
  })
  const studi = data.results.map((c) => ({
    id: c.id,
    name: c.name,
    logoPath: c.logo_path ?? null,
  }))
  // Solo gli omonimi si contano: per tutti gli altri il nome basta.
  const daContare = studi.filter((c) => studi.some((o) => o.id !== c.id && stessoNome(o.name, c.name)))
  const film = new Map(await Promise.all(daContare.map(async (c) => [c.id, await quantiFilmDelloStudio(c.id)] as const)))
  return ordinaOmonimi(studi, film)
}

const stessoNome = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// TMDB ha più studi con lo stesso nome e lo stesso logo: «A24» è quello vero
// con 148 film e anche un doppione con uno solo, che la ricerca dava per
// primo. Fra omonimi va prima chi ha più film, e il numero si mostra, perché
// altrimenti due schede identiche non si distinguono.
export function ordinaOmonimi(studi: Company[], film: Map<number, number>): Company[] {
  const contati = studi.map((c) => (film.has(c.id) ? { ...c, film: film.get(c.id) } : c))
  const fatti = new Set<number>()
  const out: Company[] = []
  for (const c of contati) {
    if (fatti.has(c.id)) continue
    // Il gruppo prende il posto del primo che compare.
    const gruppo = contati.filter((o) => stessoNome(o.name, c.name)).sort((a, b) => (b.film ?? 0) - (a.film ?? 0))
    for (const o of gruppo) {
      fatti.add(o.id)
      out.push(o)
    }
  }
  return out
}

const filmContati = new Map<number, Promise<number>>()

// Quanti film ha uno studio: il totale della prima pagina di /discover. Una
// volta per visita: gli omonimi tornano a ogni ricerca dello stesso nome.
export function quantiFilmDelloStudio(id: number): Promise<number> {
  let n = filmContati.get(id)
  if (!n) {
    n = tmdbFetch<{ total_results?: number }>('/discover/movie', { with_companies: String(id), page: '1' }).then((d) => d.total_results ?? 0)
    // Un errore non resta in memoria: la prossima volta si riprova.
    n.catch(() => filmContati.delete(id))
    filmContati.set(id, n)
  }
  return n
}

// L'omonimo con più film di uno studio aperto, se ce n'è uno: chi arriva al
// doppione (da un titolo che lo cita, da un preferito) trova la strada per
// quello vero. null se questo è già il più grande.
export async function studioOmonimoPiuGrande(studio: Company): Promise<Company | null> {
  const omonimi = (await searchCompany(studio.name)).filter((c) => stessoNome(c.name, studio.name))
  const primo = omonimi[0]
  if (!primo || primo.id === studio.id) return null
  const questo = omonimi.find((c) => c.id === studio.id)?.film ?? (await quantiFilmDelloStudio(studio.id))
  return (primo.film ?? 0) > questo ? primo : null
}

// Un nome di compagnia leggibile: TMDB non traduce i nomi degli studi e non
// espone un `original_name`, quindi per un nome in uno script non latino l'unica
// fonte di una versione latina sono i nomi alternativi/internazionali. Solo per
// i nomi NON leggibili — nessuna chiamata extra per gli studi "occidentali"; se
// non ne esiste uno leggibile resta il nome originale. Best-effort.
export async function readableCompanyName(id: number, name: string): Promise<string> {
  if (isReadableTitle(name)) return name
  try {
    const alt = await tmdbFetch<{ results?: { name: string }[] }>(
      `/company/${id}/alternative_names`,
    )
    return (alt.results ?? []).map((r) => r.name).find((n) => isReadableTitle(n)) ?? name
  } catch {
    return name
  }
}

export async function getCompany(id: number): Promise<Company> {
  const raw = await tmdbFetch<RawCompany>(`/company/${id}`)
  return { id: raw.id, name: await readableCompanyName(id, raw.name), logoPath: raw.logo_path ?? null }
}

export async function discoverByCompany(
  companyId: number,
  page = 1,
): Promise<{ items: MediaItem[]; totalPages: number }> {
  const params = {
    with_companies: String(companyId),
    sort_by: 'popularity.desc',
    page: String(page),
  }
  const [data, enData] = await Promise.all([
    tmdbFetch<{ results: RawMedia[]; total_pages: number }>('/discover/movie', params),
    tmdbFetch<{ results: RawMedia[] }>('/discover/movie', { ...params, language: 'en-US' }),
  ])
  patchReadableTitles(data.results, enData.results)
  return {
    items: data.results.map((r) => normalise(r, 'movie')),
    totalPages: data.total_pages,
  }
}
