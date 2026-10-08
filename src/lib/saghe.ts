import type { Collection } from './types'
import type { Raccolta } from './raccolte'

// Le saghe della videoteca: i film di una stessa collezione di TMDB (Alien,
// Harry Potter, Il Signore degli Anelli…) in una cartella con la locandina
// della saga, invece che sparsi nell'elenco in ordine alfabetico. E le saghe
// fatte a mano: una delle «Mie liste» segnata come saga, per i film che su
// TMDB una saga non ce l'hanno.

// TMDB in inglese chiama le collezioni «Alien Collection»: la parola non dice
// niente, la cartella è già una raccolta.
export function nomeSaga(nome: string): string {
  return nome.replace(/\s+Collection$/i, '').trim() || nome
}

export interface SagaVideoteca {
  chiave: string // `saga-<id TMDB>` o `lista-<id lista>`
  name: string
  posterPath: string | null
  // Solo per le saghe fatte a mano: la lista che le tiene.
  listaId?: string
  copertina?: string | null
}

export function daCollezione(c: Collection): SagaVideoteca {
  return { chiave: `saga-${c.id}`, name: c.name, posterPath: c.posterPath }
}

export interface GruppoSaga {
  chiave: string
  saga: SagaVideoteca
  ids: string[] // i file, in ordine di uscita
}

// La saga di ogni film: quella di TMDB, ma una saga fatta a mano vince, perché
// il film va dove l'hai messo tu. Una saga di TMDB modificata a mano non c'è
// più: i film che le hai tolto restano sciolti, invece di rifare una seconda
// cartella col suo nome.
export function unisciSaghe(tmdb: Map<string, Collection | null>, liste: Raccolta[]): Map<string, SagaVideoteca | null> {
  const sostituite = new Set(liste.filter((l) => l.comeSaga && l.sagaTmdb != null).map((l) => l.sagaTmdb))
  const saghe = new Map<string, SagaVideoteca | null>(
    [...tmdb].map(([k, c]) => [k, c && !sostituite.has(c.id) ? daCollezione(c) : null]),
  )
  for (const l of liste) {
    if (!l.comeSaga) continue
    const saga: SagaVideoteca = { chiave: `lista-${l.id}`, name: l.nome, posterPath: null, listaId: l.id, copertina: l.copertina }
    for (const k of l.chiavi) saghe.set(k, saga)
  }
  return saghe
}

// `chiave` è `${mediaType}-${id}` del titolo abbinato, null se non lo è;
// `saghe` dice a quale saga appartiene (null: a nessuna). Una saga di TMDB
// diventa una cartella con almeno due file: per un film solo sarebbe un clic
// in più per niente. Una fatta a mano anche con uno: l'hai voluta tu.
export function raggruppaSaghe(
  film: { id: string; chiave: string | null; anno: string | null }[],
  saghe: Map<string, SagaVideoteca | null>,
): { saghe: GruppoSaga[]; sciolti: string[] } {
  const perSaga = new Map<string, { saga: SagaVideoteca; film: typeof film }>()
  for (const f of film) {
    const saga = f.chiave ? saghe.get(f.chiave) : null
    if (!saga) continue
    const g = perSaga.get(saga.chiave) ?? { saga, film: [] }
    g.film.push(f)
    perSaga.set(saga.chiave, g)
  }
  const gruppi: GruppoSaga[] = []
  const raccolti = new Set<string>()
  for (const { saga, film: suoi } of perSaga.values()) {
    if (suoi.length < (saga.listaId ? 1 : 2)) continue
    // Ordinamento stabile: due versioni dello stesso film restano nell'ordine
    // in cui sono arrivate.
    const ordinati = [...suoi].sort((a, b) => (a.anno ?? '9999').localeCompare(b.anno ?? '9999'))
    for (const f of ordinati) raccolti.add(f.id)
    gruppi.push({ chiave: saga.chiave, saga, ids: ordinati.map((f) => f.id) })
  }
  return { saghe: gruppi, sciolti: film.filter((f) => !raccolti.has(f.id)).map((f) => f.id) }
}
