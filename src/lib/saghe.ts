import type { Collection } from './types'

// Le saghe della videoteca: i film di una stessa collezione di TMDB (Alien,
// Harry Potter, Il Signore degli Anelli…) in una cartella con la locandina
// della saga, invece che sparsi nell'elenco in ordine alfabetico.

// TMDB in inglese chiama le collezioni «Alien Collection»: la parola non dice
// niente, la cartella è già una raccolta.
export function nomeSaga(nome: string): string {
  return nome.replace(/\s+Collection$/i, '').trim() || nome
}

export interface GruppoSaga {
  chiave: string // `saga-<id>`, distinta dalle chiavi delle serie
  saga: Collection
  ids: string[] // i file, in ordine di uscita
}

// `chiave` è `${mediaType}-${id}` del titolo abbinato, null se non lo è;
// `saghe` dice a quale collezione appartiene (null: a nessuna). Solo le saghe
// con almeno due file diventano cartelle: una cartella per un film solo è un
// clic in più per niente.
export function raggruppaSaghe(
  film: { id: string; chiave: string | null; anno: string | null }[],
  saghe: Map<string, Collection | null>,
): { saghe: GruppoSaga[]; sciolti: string[] } {
  const perSaga = new Map<number, { saga: Collection; film: typeof film }>()
  for (const f of film) {
    const saga = f.chiave ? saghe.get(f.chiave) : null
    if (!saga) continue
    const g = perSaga.get(saga.id) ?? { saga, film: [] }
    g.film.push(f)
    perSaga.set(saga.id, g)
  }
  const gruppi: GruppoSaga[] = []
  const raccolti = new Set<string>()
  for (const { saga, film: suoi } of perSaga.values()) {
    if (suoi.length < 2) continue
    // Ordinamento stabile: due versioni dello stesso film restano nell'ordine
    // in cui sono arrivate.
    const ordinati = [...suoi].sort((a, b) => (a.anno ?? '9999').localeCompare(b.anno ?? '9999'))
    for (const f of ordinati) raccolti.add(f.id)
    gruppi.push({ chiave: `saga-${saga.id}`, saga, ids: ordinati.map((f) => f.id) })
  }
  return { saghe: gruppi, sciolti: film.filter((f) => !raccolti.has(f.id)).map((f) => f.id) }
}
