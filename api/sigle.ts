// I tempi di sigla e titoli di coda di un episodio, da TheIntroDB: un archivio
// pubblico e gratuito, scritto da chi guarda, con gli episodi indicizzati per
// id TMDB, stagione ed episodio (gli stessi che Ciak salva per ogni file).
//
// È la riserva: il browser chiede prima a TheIntroDB direttamente, perché la
// protezione anti-bot di TheIntroDB (una pagina HTML di blocco, 403) respinge
// le richieste che arrivano dai server di Vercel. Qui si passa se il browser
// non può (regole CORS), con la cache della CDN. Non è un proxy aperto:
// accetta tre numeri e chiama un solo indirizzo.

import { normalizzaSigle, urlTheIntroDb, type Episodio } from '../src/lib/theIntroDb'

// Riesportate per chi le provava da qui.
export { normalizzaSigle, urlTheIntroDb }

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


// Ci si presenta per nome, come i client ufficiali di TheIntroDB
// («theintrodb-jellyfin-plugin/…»). Da Vercel non è bastato: la protezione
// anti-bot risponde comunque 403. La chiave (THEINTRODB_API_KEY, senza
// prefisso VITE_) è facoltativa, se un giorno servisse.
export function intestazioni(chiave: string | undefined): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'Ciak/1.0 (videoteca personale; +https://github.com/Baldborne94/Ciak)',
  }
  if (chiave?.trim()) h.Authorization = `Bearer ${chiave.trim()}`
  return h
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
      // Il perché lo dice il corpo: un JSON di TheIntroDB, o una pagina HTML
      // della protezione anti-bot, che riassunta in una riga non si leggerebbe.
      const corpo = (await risposta.text().catch(() => '')).replace(/\s+/g, ' ').trim()
      const perche = corpo.startsWith('<') ? 'Pagina di blocco della protezione anti-bot.' : corpo.slice(0, 200)
      res.status(502).json({ error: `TheIntroDB ha risposto ${risposta.status}.${perche ? ` ${perche}` : ''}` })
      return
    }
    res.setHeader('Cache-Control', CACHE)
    res.status(200).json(normalizzaSigle(await risposta.json()))
  } catch (e) {
    res.status(502).json({ error: `TheIntroDB irraggiungibile: ${(e as Error).message}` })
  }
}
