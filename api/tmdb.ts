// Proxy verso TMDB. Esiste per un motivo solo: togliere la chiave dal browser.
//
// Finora il client chiamava TMDB direttamente con VITE_TMDB_API_KEY, che
// finisce nel bundle: chiunque aprisse gli strumenti da sviluppatore poteva
// copiarla e consumare la quota altrui, per sempre e da qualsiasi sito. Ora la
// chiave sta qui, in una variabile senza prefisso VITE_, e il browser chiede a
// noi.
//
// NON è un proxy aperto: i percorsi passano da una lista di quelli che l'app
// usa davvero. Senza, questa funzione diventerebbe un modo gratuito per
// interrogare TMDB (o peggio, per farsi inoltrare richieste altrove) a spese
// del nostro progetto.

const BASE = 'https://api.themoviedb.org/3'

// Solo ciò che src/lib/tmdb.ts chiede davvero. Aggiungere una riga qui è il
// passo obbligato quando si usa un endpoint TMDB nuovo.
const CONSENTITI: RegExp[] = [
  /^\/trending\/(all|movie|tv)\/(day|week)$/,
  /^\/search\/(multi|movie|tv|person|company|collection|keyword)$/,
  /^\/genre\/(movie|tv)\/list$/,
  /^\/discover\/(movie|tv)$/,
  /^\/(movie|tv)\/\d+$/,
  /^\/(movie|tv)\/\d+\/(recommendations|similar|videos|credits|alternative_titles|keywords|external_ids|images)$/,
  /^\/(movie|tv)\/\d+\/watch\/providers$/,
  /^\/tv\/\d+\/season\/\d+$/,
  /^\/person\/\d+$/,
  /^\/person\/\d+\/combined_credits$/,
  /^\/company\/\d+$/,
  /^\/collection\/\d+$/,
  // Serve alle Impostazioni per dire se il catalogo è configurato davvero.
  /^\/configuration$/,
]

export function percorsoConsentito(percorso: string): boolean {
  // Un percorso che porta con sé query o frammento potrebbe far dire alla
  // regex una cosa e all'URL finale un'altra: si rifiuta prima di guardarlo.
  if (percorso.includes('?') || percorso.includes('#')) return false
  // `//evil.com/x` passato a `new URL(BASE + percorso)` diventa
  // `https://evil.com/x`: il proxy inoltrerebbe altrove, con la nostra chiave
  // in coda. Le regex qui sotto lo escludono già (dopo la barra vogliono una
  // parola), ma il caso è troppo brutto per affidarlo a una lettura attenta.
  if (percorso.startsWith('//') || percorso.includes('..')) return false
  return CONSENTITI.some((r) => r.test(percorso))
}

// I parametri che il client può scegliere. `api_key` non è fra questi: la
// mette il server, e una eventuale copia in arrivo viene ignorata.
export function urlTmdb(
  percorso: string,
  parametri: Record<string, string>,
  chiave: string,
): string {
  const url = new URL(`${BASE}${percorso}`)
  for (const [nome, valore] of Object.entries(parametri)) {
    if (nome === 'api_key' || nome === 'path') continue
    url.searchParams.set(nome, valore)
  }
  if (!url.searchParams.has('language')) url.searchParams.set('language', 'it-IT')
  url.searchParams.set('api_key', chiave)
  return url.toString()
}

// Un film del 1999 non cambia: la cache della CDN serve le richieste ripetute
// senza nemmeno svegliare questa funzione. È ciò che rende il proxy sostenibile
// — senza, analizzare una collezione intera significherebbe una invocazione per
// titolo, ogni volta.
export const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400'

interface ApiRequest {
  method?: string
  query?: Record<string, string | string[] | undefined>
  url?: string
  headers?: Record<string, string | string[] | undefined>
}
interface ApiResponse {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
  setHeader: (nome: string, valore: string) => void
}

function primo(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

// Il browser fa richieste same-origin, che di norma non portano `Origin`.
// Quando invece c'è ed è di un altro sito, la richiesta viene da una pagina
// che non è la nostra: è un freno agli usi disinvolti, non una serratura
// (l'intestazione si falsifica con una riga di curl). La serratura vera è che
// la chiave non lascia più il server e si può revocare.
function origineEstranea(req: ApiRequest): boolean {
  const origin = primo(req.headers?.origin)
  if (!origin) return false
  const host = primo(req.headers?.host)
  if (!host) return false
  try {
    return new URL(origin).host !== host
  } catch {
    return true
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Metodo non consentito. Usa GET.' })
    return
  }

  const chiave = process.env.TMDB_API_KEY
  if (!chiave) {
    res.status(503).json({ error: 'Catalogo non configurato (manca TMDB_API_KEY lato server).' })
    return
  }

  if (origineEstranea(req)) {
    res.status(403).json({ error: 'Origine non consentita.' })
    return
  }

  const parametri: Record<string, string> = {}
  for (const [nome, valore] of Object.entries(req.query ?? {})) {
    const v = primo(valore)
    if (v !== undefined) parametri[nome] = v
  }

  const percorso = parametri.path ?? ''
  if (!percorsoConsentito(percorso)) {
    res.status(400).json({ error: `Percorso TMDB non consentito: ${percorso || '(vuoto)'}` })
    return
  }

  try {
    const risposta = await fetch(urlTmdb(percorso, parametri, chiave))
    const corpo = await risposta.json()
    if (!risposta.ok) {
      // Si propaga il codice di TMDB (404 su un id inesistente, 429 se la
      // quota è finita) invece di appiattire tutto su un 500 che non aiuta.
      res.status(risposta.status).json({ error: `Errore TMDB (${risposta.status}).` })
      return
    }
    res.setHeader('Cache-Control', CACHE)
    res.status(200).json(corpo)
  } catch (e) {
    res.status(502).json({ error: `Catalogo irraggiungibile: ${(e as Error).message}` })
  }
}
