// Quale sottotitolo mostrare. Si parte spenti: il video si guarda pulito, e le
// battute compaiono solo se le si sceglie dal CC. La scelta (una lingua, o
// «nessuno») resta da un episodio all'altro e fra un film e l'altro: chi
// guarda in inglese coi sottotitoli italiani non deve risceglierli ogni volta.
//
// Si ricorda la lingua, non la posizione nell'elenco: in un episodio
// l'italiano è la prima traccia, nel successivo (italiano mancante) la prima
// sarebbe l'inglese.

const CHIAVE = 'ciak:sottotitoli'
const SENZA_LINGUA = 'und'

export interface TracciaConLingua {
  lingua: string | null
}

export function linguaTraccia(t: TracciaConLingua): string {
  return t.lingua ?? SENZA_LINGUA
}

// null: nessun sottotitolo.
export function leggiLinguaSottotitoli(): string | null {
  try {
    return localStorage.getItem(CHIAVE) || null
  } catch {
    return null
  }
}

export function salvaLinguaSottotitoli(lingua: string | null): void {
  try {
    localStorage.setItem(CHIAVE, lingua ?? '')
  } catch {
    /* storage negato: alla prossima apertura si riparte spenti */
  }
}

// L'indice della traccia da mostrare (-1: nessuna). `preferito` è la traccia
// toccata proprio ora: con due sottotitoli nella stessa lingua vince quella,
// non la prima. Una lingua che in questo video manca vuol dire spenti, non
// un'altra lingua a caso.
export function indiceSottotitolo(tracce: TracciaConLingua[], lingua: string | null, preferito: number | null = null): number {
  if (lingua === null) return -1
  if (preferito !== null && tracce[preferito] && linguaTraccia(tracce[preferito]) === lingua) return preferito
  return tracce.findIndex((t) => linguaTraccia(t) === lingua)
}
