// Le liste dei premi: Oscar in tutte le categorie, i festival, i Golden Globe,
// i BAFTA e i David. TMDB non sa nulla dei premi; Wikidata sì, ed è libero
// (CC0), senza chiave, aperto ai browser (CORS) e aggiornato da sé: il
// vincitore di quest'anno compare senza toccare Ciak. Da Wikidata arrivano
// l'anno e l'id di TMDB (proprietà P4947); la card la dà poi TMDB.

export type Premio = string

export interface Categoria {
  id: Premio
  nome: string
  // Come trovare il premio su Wikidata: l'elemento, quando lo si è verificato,
  // altrimenti il titolo della sua voce sulla Wikipedia inglese. Il titolo di
  // una voce è stabile e unico; indovinare a memoria un codice Q no.
  qid?: string
  voce?: string
}

export interface Gruppo {
  id: string
  nome: string
  dove: string
  categorie: Categoria[]
}

const oscar = (id: string, nome: string, voce: string): Categoria => ({ id: `oscar-${id}`, nome, voce: `Academy Award for ${voce}` })

export const GRUPPI: Gruppo[] = [
  {
    id: 'oscar',
    nome: 'Oscar',
    dove: 'Academy Awards',
    categorie: [
      { id: 'oscar', nome: 'Miglior film', qid: 'Q102427' },
      oscar('regia', 'Miglior regia', 'Best Director'),
      oscar('attore', 'Miglior attore', 'Best Actor'),
      oscar('attrice', 'Miglior attrice', 'Best Actress'),
      oscar('attore-np', 'Miglior attore non protagonista', 'Best Supporting Actor'),
      oscar('attrice-np', 'Miglior attrice non protagonista', 'Best Supporting Actress'),
      oscar('sceneggiatura', 'Miglior sceneggiatura originale', 'Best Original Screenplay'),
      oscar('adattamento', 'Miglior sceneggiatura non originale', 'Best Adapted Screenplay'),
      oscar('animazione', 'Miglior film d’animazione', 'Best Animated Feature'),
      oscar('internazionale', 'Miglior film internazionale', 'Best International Feature Film'),
      oscar('documentario', 'Miglior documentario', 'Best Documentary Feature Film'),
      oscar('fotografia', 'Miglior fotografia', 'Best Cinematography'),
      oscar('montaggio', 'Miglior montaggio', 'Best Film Editing'),
      oscar('colonna-sonora', 'Miglior colonna sonora', 'Best Original Score'),
      oscar('scenografia', 'Miglior scenografia', 'Best Production Design'),
      oscar('costumi', 'Migliori costumi', 'Best Costume Design'),
      oscar('trucco', 'Miglior trucco', 'Best Makeup and Hairstyling'),
      oscar('effetti', 'Migliori effetti speciali', 'Best Visual Effects'),
      oscar('sonoro', 'Miglior sonoro', 'Best Sound'),
    ],
  },
  {
    id: 'cannes',
    nome: 'Cannes',
    dove: 'Festival di Cannes',
    categorie: [
      { id: 'palma', nome: 'Palma d’oro', qid: 'Q179808' },
      { id: 'cannes-grand-prix', nome: 'Grand Prix', voce: 'Grand Prix (Cannes Film Festival)' },
      { id: 'cannes-giuria', nome: 'Premio della giuria', voce: 'Jury Prize (Cannes Film Festival)' },
      { id: 'cannes-regia', nome: 'Miglior regia', voce: 'Best Director Award (Cannes Film Festival)' },
      { id: 'cannes-attore', nome: 'Miglior attore', voce: 'Best Actor Award (Cannes Film Festival)' },
      { id: 'cannes-attrice', nome: 'Miglior attrice', voce: 'Best Actress Award (Cannes Film Festival)' },
      { id: 'cannes-sceneggiatura', nome: 'Miglior sceneggiatura', voce: 'Best Screenplay Award (Cannes Film Festival)' },
    ],
  },
  {
    id: 'venezia',
    nome: 'Venezia',
    dove: 'Mostra del cinema di Venezia',
    categorie: [
      { id: 'leone', nome: 'Leone d’oro', qid: 'Q209459' },
      { id: 'venezia-giuria', nome: 'Gran premio della giuria', voce: 'Grand Jury Prize (Venice Film Festival)' },
      { id: 'venezia-regia', nome: 'Leone d’argento per la regia', voce: 'Silver Lion' },
      { id: 'venezia-attore', nome: 'Coppa Volpi per l’attore', voce: 'Volpi Cup for Best Actor' },
      { id: 'venezia-attrice', nome: 'Coppa Volpi per l’attrice', voce: 'Volpi Cup for Best Actress' },
    ],
  },
  {
    id: 'berlino',
    nome: 'Berlino',
    dove: 'Berlinale',
    categorie: [
      { id: 'orso', nome: 'Orso d’oro', qid: 'Q154590' },
      { id: 'berlino-giuria', nome: 'Gran premio della giuria', voce: 'Silver Bear Grand Jury Prize' },
      { id: 'berlino-regia', nome: 'Orso d’argento per la regia', voce: 'Silver Bear for Best Director' },
    ],
  },
  {
    id: 'globe',
    nome: 'Golden Globe',
    dove: 'Golden Globe',
    categorie: [
      { id: 'globe-drammatico', nome: 'Miglior film drammatico', voce: 'Golden Globe Award for Best Motion Picture – Drama' },
      { id: 'globe-commedia', nome: 'Miglior film commedia o musicale', voce: 'Golden Globe Award for Best Motion Picture – Musical or Comedy' },
      { id: 'globe-animazione', nome: 'Miglior film d’animazione', voce: 'Golden Globe Award for Best Animated Feature Film' },
    ],
  },
  {
    id: 'bafta',
    nome: 'BAFTA',
    dove: 'British Academy Film Awards',
    categorie: [{ id: 'bafta-film', nome: 'Miglior film', voce: 'BAFTA Award for Best Film' }],
  },
  {
    id: 'david',
    nome: 'David di Donatello',
    dove: 'David di Donatello',
    categorie: [
      { id: 'david-film', nome: 'Miglior film', voce: 'David di Donatello for Best Film' },
      { id: 'david-regia', nome: 'Miglior regia', voce: 'David di Donatello for Best Director' },
    ],
  },
]

export const CATEGORIE: Categoria[] = GRUPPI.flatMap((g) => g.categorie)

export function trovaCategoria(id: string | null): { gruppo: Gruppo; categoria: Categoria } {
  for (const gruppo of GRUPPI) {
    const categoria = gruppo.categorie.find((c) => c.id === id)
    if (categoria) return { gruppo, categoria }
  }
  return { gruppo: GRUPPI[0], categoria: GRUPPI[0].categorie[0] }
}

export interface Vincitore {
  // L'elemento di Wikidata: un film compare una volta, anche se ha due id TMDB.
  qid: string
  tmdbId: number
  // L'anno del premio (la cerimonia, per gli Oscar); null se Wikidata non lo dice.
  anno: number | null
  titolo: string
  // Chi l'ha vinto, nei premi a una persona (attori, regia, fotografia…).
  persone: string[]
}

export const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql'

// La stringa dentro una query SPARQL: niente virgolette che la chiudano prima.
const letterale = (s: string) => `"${s.replace(/["\\]/g, '')}"@en`

function trovaPremio(c: Categoria): string {
  if (c.qid) return `VALUES ?premio { wd:${c.qid} }`
  const voce = letterale(c.voce ?? '')
  return `{ ?articolo schema:about ?premio ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ${voce} . }
  UNION { ?premio rdfs:label ${voce} . }`
}

// Due modi in cui Wikidata registra un premio: sul film (miglior film), o
// sulla persona che l'ha vinto, col film in «per l'opera» (P1686: attori,
// regia, fotografia…). Solo i film con un id TMDB: un titolo a cui su
// Wikidata manca l'id si perde, ed è il prezzo di non mantenere a mano la lista.
export function querySparql(c: Categoria): string {
  return `SELECT ?film ?tmdb ?anno ?titolo ?persona WHERE {
  ${trovaPremio(c)}
  { ?film p:P166 ?st . ?st ps:P166 ?premio . }
  UNION
  { ?chi p:P166 ?st . ?st ps:P166 ?premio . ?st pq:P1686 ?film .
    OPTIONAL { ?chi rdfs:label ?chiIt . FILTER(LANG(?chiIt) = "it") }
    OPTIONAL { ?chi rdfs:label ?chiEn . FILTER(LANG(?chiEn) = "en") }
    BIND(COALESCE(?chiIt, ?chiEn) AS ?persona) }
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

const qidDi = (uri: string | undefined) => uri?.split('/').pop() ?? ''

// Dal più recente al più vecchio; quelli senza anno in fondo.
export function leggiRisposta(json: RispostaSparql): Vincitore[] {
  const visti = new Map<string, Vincitore>()
  for (const b of json.results?.bindings ?? []) {
    const qid = qidDi(b.film?.value)
    const tmdbId = Number(b.tmdb?.value)
    if (!qid || !Number.isInteger(tmdbId) || tmdbId <= 0) continue
    const letto = b.anno?.value ? Number(b.anno.value) : null
    const anno = Number.isFinite(letto) ? letto : null
    const persona = b.persona?.value
    const prima = visti.get(qid)
    if (prima) {
      // Lo stesso film su più righe: due vincitori a pari merito, o il premio
      // ripetuto con due date. Si uniscono i nomi e vale la data più vecchia.
      if (persona && !prima.persone.includes(persona)) prima.persone.push(persona)
      if (anno !== null && (prima.anno === null || anno < prima.anno)) prima.anno = anno
      continue
    }
    visti.set(qid, { qid, tmdbId, anno, titolo: b.titolo?.value ?? '', persone: persona ? [persona] : [] })
  }
  return [...visti.values()].sort((a, b) => (b.anno ?? -Infinity) - (a.anno ?? -Infinity))
}

async function sparql(query: string): Promise<RispostaSparql> {
  const url = `${WIKIDATA_SPARQL}?format=json&query=${encodeURIComponent(query)}`
  const r = await fetch(url, { headers: { Accept: 'application/sparql-results+json' } })
  if (!r.ok) throw new Error(`Wikidata ha risposto ${r.status}`)
  return (await r.json()) as RispostaSparql
}

export async function scaricaVincitori(c: Categoria): Promise<Vincitore[]> {
  return leggiRisposta(await sparql(querySparql(c)))
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
// Una copia senza `persone` è del formato di prima: si rinnova.
export function usaCache(c: CacheVincitori | null, adesso: number, online: boolean): boolean {
  if (!c || !c.vincitori.every((v) => Array.isArray(v.persone))) return false
  return !online || adesso - c.salvato < DURATA_CACHE
}

// --- I premi vinti da un titolo, per la sua scheda ---

export interface PremioVinto {
  premio: string
  anno: number | null
  persone: string[]
  // I premi maggiori (quelli delle liste qui sopra) vanno prima degli altri:
  // Wikidata registra anche decine di premi della critica locale.
  maggiore: boolean
}

// P4947 è l'id TMDB dei film, P4983 quello delle serie.
export function queryPremiDelTitolo(tipo: 'movie' | 'tv', tmdbId: number): string {
  const proprieta = tipo === 'movie' ? 'P4947' : 'P4983'
  return `SELECT ?premio ?premioLabel ?anno ?chiLabel ?voce WHERE {
  ?film wdt:${proprieta} "${Math.trunc(tmdbId)}" .
  { ?film p:P166 ?st . ?st ps:P166 ?premio . }
  UNION
  { ?chi p:P166 ?st . ?st ps:P166 ?premio . ?st pq:P1686 ?film . }
  OPTIONAL { ?st pq:P585 ?data . }
  BIND(YEAR(?data) AS ?anno)
  OPTIONAL { ?articolo schema:about ?premio ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?voce . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". }
}`
}

const QID_MAGGIORI = new Set(CATEGORIE.map((c) => c.qid).filter(Boolean))
const VOCI_MAGGIORI = new Set(CATEGORIE.map((c) => c.voce).filter(Boolean))

export function leggiPremiDelTitolo(json: RispostaSparql): PremioVinto[] {
  const premi = new Map<string, PremioVinto>()
  for (const b of json.results?.bindings ?? []) {
    const qid = qidDi(b.premio?.value)
    const nome = b.premioLabel?.value ?? ''
    // Senza un nome leggibile Wikidata ripete il codice (Q123): non dice nulla.
    if (!qid || !nome || /^Q\d+$/.test(nome)) continue
    const letto = b.anno?.value ? Number(b.anno.value) : null
    const anno = Number.isFinite(letto) ? letto : null
    const chiave = `${qid}-${anno ?? ''}`
    const persona = b.chiLabel?.value
    const maggiore = QID_MAGGIORI.has(qid) || VOCI_MAGGIORI.has(b.voce?.value)
    const prima = premi.get(chiave)
    if (prima) {
      if (persona && !prima.persone.includes(persona)) prima.persone.push(persona)
      prima.maggiore ||= maggiore
      continue
    }
    premi.set(chiave, { premio: nome, anno, persone: persona ? [persona] : [], maggiore })
  }
  return [...premi.values()].sort(
    (a, b) => Number(b.maggiore) - Number(a.maggiore) || (b.anno ?? 0) - (a.anno ?? 0) || a.premio.localeCompare(b.premio),
  )
}

export async function scaricaPremiDelTitolo(tipo: 'movie' | 'tv', tmdbId: number): Promise<PremioVinto[]> {
  return leggiPremiDelTitolo(await sparql(queryPremiDelTitolo(tipo, tmdbId)))
}
