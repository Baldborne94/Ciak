// I tempi di sigla e titoli di coda di un episodio, da TheIntroDB: un archivio
// pubblico e gratuito, scritto da chi guarda, con gli episodi indicizzati per
// id TMDB, stagione ed episodio (gli stessi che Ciak salva per ogni file).
//
// Passa dal server per due ragioni: il browser non deve dipendere dalle regole
// CORS di un servizio altrui, e la cache della CDN serve le richieste ripetute
// (un episodio non cambia sigla) senza disturbare TheIntroDB a ogni apertura.
// Non è un proxy aperto: accetta tre numeri e chiama un solo indirizzo.

const BASE = 'https://api.theintrodb.org/v3/media'

export interface Episodio {
  tmdbId: number
  stagione: number
  episodio: number
}

export interface SigleEpisodio {
  inizio: { da: number; a: number } | null // sigla iniziale, in secondi
  finale: { da: number } | null // da qui in poi titoli di coda
}

type Query = Record<string, string | string[] | undefined>

function numero(v: string | string[] | undefined): number | null {
  const s = Array.isArray(v) ? v[0] : v
  return s !== undefined && /^\d{1,7}$/.test(s) ? Number(s) : null
}

export function leggiEpisodio(query: Query): Episodio | null {
  const tmdbId = numero(query.tmdb_id)
  const stagione = numero(query.season)
  const episodio = numero(query.episode)
  if (tmdbId === null || stagione === null || episodio === null) return null
  return { tmdbId, stagione, episodio }
}

export function urlTheIntroDb({ tmdbId, stagione, episodio }: Episodio): string {
  return `${BASE}?tmdb_id=${tmdbId}&season=${stagione}&episode=${episodio}`
}

// Ci si presenta per nome, come fanno i client ufficiali di TheIntroDB
// («theintrodb-jellyfin-plugin/…»): col nome generico di Node la risposta era
// 403, da robot sconosciuto. La chiave (THEINTRODB_API_KEY su Vercel, senza
// prefisso VITE_) è facoltativa: serve se il nome da solo non bastasse.
export function intestazioni(chiave: string | undefined): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'Ciak/1.0 (videoteca personale; +https://github.com/Baldborne94/Ciak)',
  }
  if (chiave?.trim()) h.Authorization = `Bearer ${chiave.trim()}`
  return h
}

type Segmento = { start_ms?: unknown; end_ms?: unknown }
const ms = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
const segmenti = (v: unknown): Segmento[] => (Array.isArray(v) ? v.filter((s): s is Segmento => !!s && typeof s === 'object') : [])

// Come le leggono i client di TheIntroDB: un inizio nullo è l'inizio
// dell'episodio, una fine nulla dei titoli di coda è la fine dell'episodio, e
// un segmento lungo zero vuol dire «qui non c'è».
export function normalizzaSigle(dati: unknown): SigleEpisodio {
  const d = (dati && typeof dati === 'object' ? dati : {}) as Record<string, unknown>
  let inizio: SigleEpisodio['inizio'] = null
  for (const s of segmenti(d.intro)) {
    const a = ms(s.end_ms)
    if (!a) continue
    inizio = { da: (ms(s.start_ms) ?? 0) / 1000, a: a / 1000 }
    break
  }
  let finale: SigleEpisodio['finale'] = null
  for (const s of segmenti(d.credits)) {
    const da = ms(s.start_ms)
    if (!da) continue
    finale = { da: da / 1000 }
    break
  }
  return { inizio, finale }
}

// Una sigla non cambia: un giorno di CDN, e una settimana di copia vecchia
// se TheIntroDB non risponde.
export const CACHE = 'public, s-maxage=86400, stale-while-revalidate=604800'

interface Req {
  method?: string
  query?: Query
}
interface Res {
  status: (code: number) => Res
  json: (body: unknown) => void
  setHeader: (nome: string, valore: string) => void
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Metodo non consentito. Usa GET.' })
    return
  }
  const episodio = leggiEpisodio(req.query ?? {})
  if (!episodio) {
    res.status(400).json({ error: 'Servono tmdb_id, season ed episode, numerici.' })
    return
  }
  try {
    const risposta = await fetch(urlTheIntroDb(episodio), { headers: intestazioni(process.env.THEINTRODB_API_KEY) })
    // Un episodio che TheIntroDB non conosce non è un errore: non si salta niente.
    if (risposta.status === 404) {
      res.setHeader('Cache-Control', CACHE)
      res.status(200).json({ inizio: null, finale: null })
      return
    }
    if (!risposta.ok) {
      // Il perché lo dice TheIntroDB nel corpo: senza, un 403 non si capisce.
      const perche = (await risposta.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 200)
      res.status(502).json({ error: `TheIntroDB ha risposto ${risposta.status}.${perche ? ` ${perche}` : ''}` })
      return
    }
    res.setHeader('Cache-Control', CACHE)
    res.status(200).json(normalizzaSigle(await risposta.json()))
  } catch (e) {
    res.status(502).json({ error: `TheIntroDB irraggiungibile: ${(e as Error).message}` })
  }
}
