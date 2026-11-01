// Le liste dei premi (Oscar, Palma d'oro, Leone d'oro, Orso d'oro). TMDB non
// sa nulla dei premi; Wikidata sì, ed è libero (CC0), senza chiave, aperto ai
// browser (CORS) e aggiornato da sé: il vincitore di quest'anno compare senza
// toccare Ciak. Da Wikidata arrivano l'anno e l'id di TMDB (proprietà P4947);
// la locandina e il resto li dà poi TMDB, come ovunque nell'app.

export type Premio = 'oscar' | 'palma' | 'leone' | 'orso'

export const PREMI: { id: Premio; nome: string; dove: string; qid: string }[] = [
  { id: 'oscar', nome: 'Oscar al miglior film', dove: 'Academy Awards', qid: 'Q102427' },
  { id: 'palma', nome: 'Palma d’oro', dove: 'Festival di Cannes', qid: 'Q179808' },
  { id: 'leone', nome: 'Leone d’oro', dove: 'Mostra del cinema di Venezia', qid: 'Q209459' },
  { id: 'orso', nome: 'Orso d’oro', dove: 'Berlinale', qid: 'Q154590' },
]

export interface Vincitore {
  // L'elemento di Wikidata: un film vince una volta, anche se ha due id TMDB.
  qid: string
  tmdbId: number
  // L'anno del premio (la cerimonia, per gli Oscar); null se Wikidata non lo dice.
  anno: number | null
  titolo: string
}

export const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql'

// Solo i film con un id TMDB: il premio è anche registrato sui produttori, che
// sono persone e non hanno una scheda da aprire. Un film a cui su Wikidata
// manca l'id si perde, ed è il prezzo di non mantenere a mano la lista.
export function querySparql(qid: string): string {
  return `SELECT ?film ?tmdb ?anno ?titolo WHERE {
  ?film p:P166 ?st .
  ?st ps:P166 wd:${qid} .
  ?film wdt:P4947 ?tmdb .
  OPTIONAL { ?st pq:P585 ?data . }
  BIND(YEAR(?data) AS ?anno)
  OPTIONAL { ?film rdfs:label ?it . FILTER(LANG(?it) = "it") }
  OPTIONAL { ?film rdfs:label ?en . FILTER(LANG(?en) = "en") }
  BIND(COALESCE(?it, ?en, "") AS ?titolo)
}`
}

interface RispostaSparql {
  results?: { bindings?: Record<string, { value: string } | undefined>[] }
}

// Dal più recente al più vecchio; quelli senza anno in fondo.
export function leggiRisposta(json: RispostaSparql): Vincitore[] {
  const visti = new Map<string, Vincitore>()
  for (const b of json.results?.bindings ?? []) {
    const qid = b.film?.value.split('/').pop() ?? ''
    const tmdbId = Number(b.tmdb?.value)
    if (!qid || !Number.isInteger(tmdbId) || tmdbId <= 0) continue
    const anno = b.anno?.value ? Number(b.anno.value) : null
    const prima = visti.get(qid)
    // Lo stesso film su più righe (due date, due id): vale la data più vecchia,
    // che è quella del premio; le altre sono di solito ripetizioni.
    if (prima && (prima.anno === null || anno === null || prima.anno <= anno)) continue
    visti.set(qid, { qid, tmdbId, anno: Number.isFinite(anno) ? anno : null, titolo: b.titolo?.value ?? '' })
  }
  return [...visti.values()].sort((a, b) => (b.anno ?? -Infinity) - (a.anno ?? -Infinity))
}

export async function scaricaVincitori(qid: string): Promise<Vincitore[]> {
  const url = `${WIKIDATA_SPARQL}?format=json&query=${encodeURIComponent(querySparql(qid))}`
  const r = await fetch(url, { headers: { Accept: 'application/sparql-results+json' } })
  if (!r.ok) throw new Error(`Wikidata ha risposto ${r.status}`)
  return leggiRisposta((await r.json()) as RispostaSparql)
}

// Una settimana: i premi cambiano una volta l'anno, e Wikidata chiede di non
// interrogarlo a ogni visita.
export const DURATA_CACHE = 7 * 24 * 3600 * 1000

export interface CacheVincitori {
  salvato: number
  vincitori: Vincitore[]
}

// Cosa fare con la copia salvata: usarla, o chiedere a Wikidata. Senza rete
// si usa anche se vecchia (e se manca, si chiede comunque e si vedrà l'errore).
export function usaCache(c: CacheVincitori | null, adesso: number, online: boolean): boolean {
  if (!c) return false
  return !online || adesso - c.salvato < DURATA_CACHE
}
