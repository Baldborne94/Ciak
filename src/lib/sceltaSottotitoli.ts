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

// ── Quanto sono grandi ──────────────────────────────────────────────────────
// La misura di base segue l'altezza del video (vedi SottotitoliVideo): più
// piccoli nel riquadro della pagina, più grandi a schermo intero. Questa è la
// correzione scelta da chi guarda, una per tutti i video.

export const DIMENSIONI_SOTTOTITOLI = [
  { nome: 'Piccoli', scala: 0.8 },
  { nome: 'Medi', scala: 1 },
  { nome: 'Grandi', scala: 1.25 },
  { nome: 'Molto grandi', scala: 1.5 },
] as const

const CHIAVE_DIMENSIONE = 'ciak:sottotitoli-dimensione'
const DIMENSIONE_BASE = 1

export function leggiDimensioneSottotitoli(): number {
  try {
    const i = Number(localStorage.getItem(CHIAVE_DIMENSIONE) ?? DIMENSIONE_BASE)
    return Number.isInteger(i) && i >= 0 && i < DIMENSIONI_SOTTOTITOLI.length ? i : DIMENSIONE_BASE
  } catch {
    return DIMENSIONE_BASE
  }
}

export function salvaDimensioneSottotitoli(indice: number): void {
  try {
    localStorage.setItem(CHIAVE_DIMENSIONE, String(indice))
  } catch {
    /* storage negato: alla prossima apertura tornano medi */
  }
}
