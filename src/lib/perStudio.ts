import { discoverByCompany, searchCompany } from './tmdb'

// I film di uno studio (Studio Ghibli, Pixar…), come chiavi `movie-<id>`, per
// riempire una saga o una raccolta in un colpo invece di spuntarli uno a uno.
// Il primo studio che TMDB trova col nome; le pagine hanno un tetto, perché
// uno studio enorme (Disney) ne ha centinaia e qui ne servono solo i suoi
// film che sono su Drive.
const MAX_PAGINE = 10

export interface FilmDelloStudio {
  studio: string
  chiavi: Set<string>
}

export async function filmDelloStudio(
  nome: string,
  dipendenze = { searchCompany, discoverByCompany },
): Promise<FilmDelloStudio | null> {
  const [studio] = await dipendenze.searchCompany(nome)
  if (!studio) return null
  const chiavi = new Set<string>()
  let pagine = 1
  for (let pagina = 1; pagina <= Math.min(pagine, MAX_PAGINE); pagina++) {
    const { items, totalPages } = await dipendenze.discoverByCompany(studio.id, pagina)
    pagine = totalPages
    for (const f of items) chiavi.add(`movie-${f.id}`)
  }
  return { studio: studio.name, chiavi }
}
