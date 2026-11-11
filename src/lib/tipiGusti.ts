import type { MediaType } from './types'

// «Cosa guardi» nel Profilo: Film, Serie TV, Anime, Cartoni e Film
// d'animazione. Un anime o un cartone salvato dal catalogo ha `media_type`
// `tv` (è ciò che dice TMDB), quindi il tipo si riconosce come nelle card
// (etichettaTipo): animazione (genere 16) e lingua originale. La lingua non è
// nella scheda salvata: arriva da TMDB (getTitleDetails), e finché non c'è
// una serie animata resta fra le Serie TV invece di indovinare.

const ANIMAZIONE = 16

export interface TitoloPerTipo {
  tmdb_id: number
  media_type: MediaType
  genre_ids: number[] | null
}

export function categoriaDelTitolo(t: TitoloPerTipo, lingua: string | null | undefined): string {
  if (t.media_type === 'anime') return 'Anime'
  if (t.media_type === 'cartoon') return 'Cartoni'
  const animato = (t.genre_ids ?? []).includes(ANIMAZIONE)
  if (t.media_type === 'movie') return animato ? 'Film d’animazione' : 'Film'
  if (!animato || lingua === undefined) return 'Serie TV'
  return lingua === 'ja' ? 'Anime' : 'Cartoni'
}

// Le serie animate di cui serve la lingua, con la chiave di getTitleDetails.
export function serieDaRiconoscere(titoli: TitoloPerTipo[]): { tmdbId: number; mediaType: 'tv' }[] {
  return titoli
    .filter((t) => t.media_type === 'tv' && (t.genre_ids ?? []).includes(ANIMAZIONE))
    .map((t) => ({ tmdbId: t.tmdb_id, mediaType: 'tv' as const }))
}

// `lingue` ha le chiavi `tv-<id>`, come getTitleDetails.
export function contaPerTipo(titoli: TitoloPerTipo[], lingue: Map<string, string | null>): { label: string; count: number }[] {
  const conti = new Map<string, number>()
  for (const t of titoli) {
    const chiave = `${t.media_type}-${t.tmdb_id}`
    const tipo = categoriaDelTitolo(t, lingue.has(chiave) ? lingue.get(chiave) : undefined)
    conti.set(tipo, (conti.get(tipo) ?? 0) + 1)
  }
  return [...conti.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}
