import type { UserTitle } from './types'

// I filtri delle liste personali («Da vedere», «Visti»…), come quelli della
// ricerca: genere, anno, lingua originale e voto minimo di TMDB. Il genere sta
// già nella riga salvata; anno, lingua e voto arrivano da TMDB dopo (vedi
// ListPage). Senza filtri non si scarta niente; con un filtro su un dato che
// di un titolo non si conosce, quel titolo non passa: non si può dire che vada.

export interface FiltriLista {
  genere: number | null
  anno: string
  lingua: string
  votoMinimo: number
}

export const NESSUN_FILTRO: FiltriLista = { genere: null, anno: '', lingua: '', votoMinimo: 0 }

export interface DatiTitolo {
  anno: string | null
  lingua: string | null
  voto: number | null
}

export const chiaveTitolo = (r: Pick<UserTitle, 'media_type' | 'tmdb_id'>) => `${r.media_type === 'tv' ? 'tv' : 'movie'}-${r.tmdb_id}`

export function filtriAttivi(f: FiltriLista): boolean {
  return f.genere !== null || f.anno !== '' || f.lingua !== '' || f.votoMinimo > 0
}

export function passaFiltri(r: Pick<UserTitle, 'genre_ids'>, dati: DatiTitolo | undefined, f: FiltriLista): boolean {
  if (f.genere !== null && !(r.genre_ids ?? []).includes(f.genere)) return false
  if (f.anno && dati?.anno !== f.anno) return false
  if (f.lingua && dati?.lingua !== f.lingua) return false
  if (f.votoMinimo > 0 && (dati?.voto ?? 0) < f.votoMinimo) return false
  return true
}

// Le scelte che hanno senso per questa lista: solo i generi, gli anni e le
// lingue dei suoi titoli, i più frequenti per primi (gli anni dal più recente).
export function opzioniLista(
  righe: Pick<UserTitle, 'genre_ids' | 'media_type' | 'tmdb_id'>[],
  dati: Map<string, DatiTitolo>,
): { generi: { id: number; quanti: number }[]; anni: string[]; lingue: { codice: string; quanti: number }[] } {
  const generi = new Map<number, number>()
  const anni = new Set<string>()
  const lingue = new Map<string, number>()
  for (const r of righe) {
    for (const g of new Set(r.genre_ids ?? [])) generi.set(g, (generi.get(g) ?? 0) + 1)
    const d = dati.get(chiaveTitolo(r))
    if (d?.anno) anni.add(d.anno)
    if (d?.lingua) lingue.set(d.lingua, (lingue.get(d.lingua) ?? 0) + 1)
  }
  const perQuanti = <K>(m: Map<K, number>) => [...m].sort((a, b) => b[1] - a[1])
  return {
    generi: perQuanti(generi).map(([id, quanti]) => ({ id, quanti })),
    anni: [...anni].sort((a, b) => b.localeCompare(a)),
    lingue: perQuanti(lingue).map(([codice, quanti]) => ({ codice, quanti })),
  }
}
