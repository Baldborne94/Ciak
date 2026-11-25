// Ciak sul NAS: un server solo che fa ciò che prima facevano Vercel e il
// cancello di Supabase.
//
// - serve l'app costruita (`dist/`), con le pagine che ricadono su index.html
//   come faceva la riscrittura di vercel.json;
// - esegue le funzioni di `api/` con la stessa forma di richiesta e risposta di
//   Vercel (`req.query`, `req.body` già letto, `res.status().json()`), così il
//   loro codice non cambia e resta provato dai suoi test;
// - inoltra `/auth/v1/*` e `/rest/v1/*` al login e alle tabelle di Supabase,
//   sulla stessa origine dell'app: niente CORS e niente un secondo indirizzo.
//
// Le chiavi pubbliche (Supabase anon, VAPID) arrivano al browser scritte in
// index.html (`window.__CIAK__`), non dentro il bundle: l'immagine Docker è la
// stessa per ogni NAS, e cambiarle vuol dire riavviare, non ricostruire.

import { createServer, request as richiestaHttp, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { gzipSync } from 'node:zlib'

export type Query = Record<string, string | string[] | undefined>

export interface RichiestaApi {
  method?: string
  url?: string
  query: Query
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

export interface RispostaApi {
  status: (codice: number) => RispostaApi
  json: (corpo: unknown) => void
  send: (corpo: unknown) => void
  end: (corpo?: string) => void
  setHeader: (nome: string, valore: string) => void
}

export type Funzione = (req: RichiestaApi, res: RispostaApi) => unknown

// Ciò che il browser legge da `window.__CIAK__` (vedi src/lib/configurazione).
// Senza `supabaseUrl` il browser usa la sua stessa origine: è il caso del NAS.
export interface ConfigurazioneClient {
  supabaseUrl?: string
  supabaseAnonKey?: string
  vapidPublicKey?: string
  aiDailyLimit?: number
}

export interface OpzioniServer {
  cartella: string
  funzioni: Record<string, Funzione>
  // Dove stanno login e tabelle di Supabase (http://auth:9999, http://rest:3000).
  supabase?: { auth: string; rest: string }
  // Le chiavi che il cancello accetta nell'intestazione `apikey`, come faceva
  // quello di Supabase: senza, chiunque raggiunga il NAS parlerebbe al login.
  chiaviApi?: string[]
  configurazione?: ConfigurazioneClient
  // Il corpo più grande che una funzione accetta: Vercel arriva a 4,5 MB, e
  // «identify» riceve un'immagine in base64.
  limiteCorpo?: number
  registra?: (messaggio: string, errore?: unknown) => void
}

const TIPI: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

// Testo che vale la pena comprimere: le immagini e i caratteri lo sono già.
const COMPRIMIBILI = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt', '.map'])

// Le intestazioni che riguardano la singola connessione e non vanno inoltrate.
const DI_CONNESSIONE = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
])

// Le pagine del login che il browser apre da un link (email di conferma,
// ritorno da un accesso esterno): non portano la chiave, come nel cancello di
// Supabase.
const LOGIN_APERTO = /^\/auth\/v1\/(?:verify|callback|authorize)(?:\/|$)/

export function queryDa(url: URL): Query {
  const query: Query = {}
  for (const [chiave, valore] of url.searchParams) {
    const prima = query[chiave]
    query[chiave] = prima === undefined ? valore : Array.isArray(prima) ? [...prima, valore] : [prima, valore]
  }
  return query
}

// La configurazione per il browser, dentro index.html prima di ogni script.
// `<` diventa <: un valore con «</script>» non chiude il tag.
export function conConfigurazione(html: string, configurazione: ConfigurazioneClient | undefined): string {
  if (!configurazione) return html
  const json = JSON.stringify(configurazione).replace(/</g, '\\u003c')
  const script = `<script>window.__CIAK__=${json}</script>`
  return html.includes('</head>') ? html.replace('</head>', `${script}</head>`) : script + html
}

class CorpoTroppoGrande extends Error {}

function leggiCorpo(req: IncomingMessage, limite: number): Promise<Buffer> {
  return new Promise((risolvi, rifiuta) => {
    const pezzi: Buffer[] = []
    let totale = 0
    req.on('data', (pezzo: Buffer) => {
      totale += pezzo.length
      if (totale > limite) {
        rifiuta(new CorpoTroppoGrande())
        req.destroy()
        return
      }
      pezzi.push(pezzo)
    })
    req.on('end', () => risolvi(Buffer.concat(pezzi)))
    req.on('error', rifiuta)
  })
}

// Come Vercel: il JSON arriva già letto, il resto come testo.
function corpoDa(byte: Buffer, tipo: string | undefined): unknown {
  if (byte.length === 0) return undefined
  const testo = byte.toString('utf8')
  if (tipo?.includes('application/json')) return JSON.parse(testo)
  if (tipo?.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(testo))
  return testo
}

function inviaJson(res: ServerResponse, codice: number, corpo: unknown): void {
  if (res.headersSent) return void res.end()
  res.statusCode = codice
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(corpo))
}

function rispostaApi(res: ServerResponse): RispostaApi & { finita: () => boolean } {
  let finita = false
  const r: RispostaApi & { finita: () => boolean } = {
    status(codice) {
      res.statusCode = codice
      return r
    },
    setHeader(nome, valore) {
      if (!res.headersSent) res.setHeader(nome, valore)
    },
    json(corpo) {
      finita = true
      if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(corpo))
    },
    send(corpo) {
      if (typeof corpo === 'object' && corpo !== null && !Buffer.isBuffer(corpo)) return r.json(corpo)
      finita = true
      res.end(corpo === undefined ? undefined : Buffer.isBuffer(corpo) ? corpo : String(corpo))
    },
    end(corpo) {
      finita = true
      res.end(corpo)
    },
    finita: () => finita,
  }
  return r
}

export function creaServer(opzioni: OpzioniServer): Server {
  const cartella = resolve(opzioni.cartella)
  const limite = opzioni.limiteCorpo ?? 5 * 1024 * 1024
  const registra = opzioni.registra ?? ((m: string, e?: unknown) => console.error(m, e ?? ''))
  // I file della build non cambiano finché il container vive: index.html con
  // la configurazione e le versioni compresse si preparano una volta sola.
  const preparati = new Map<string, { byte: Buffer; gz?: Buffer }>()

  async function funzione(nome: string, req: IncomingMessage, res: ServerResponse, url: URL) {
    const gestore = Object.hasOwn(opzioni.funzioni, nome) ? opzioni.funzioni[nome] : undefined
    if (!gestore) return inviaJson(res, 404, { error: `Funzione sconosciuta: ${nome}` })
    let body: unknown
    try {
      body = corpoDa(await leggiCorpo(req, limite), req.headers['content-type'])
    } catch (e) {
      if (e instanceof CorpoTroppoGrande) return inviaJson(res, 413, { error: 'Richiesta troppo grande.' })
      return inviaJson(res, 400, { error: 'Corpo della richiesta non leggibile (JSON non valido?).' })
    }
    const risposta = rispostaApi(res)
    try {
      await gestore({ method: req.method, url: req.url, query: queryDa(url), headers: req.headers, body }, risposta)
      if (!risposta.finita()) inviaJson(res, 500, { error: `La funzione ${nome} non ha risposto.` })
    } catch (e) {
      registra(`Funzione ${nome} fallita:`, e)
      inviaJson(res, 500, { error: `Errore interno della funzione ${nome}.` })
    }
  }

  function inoltra(destinazione: string, percorso: string, aperto: boolean, req: IncomingMessage, res: ServerResponse) {
    const chiave = req.headers['apikey'] ?? new URL(req.url ?? '/', 'http://x').searchParams.get('apikey') ?? undefined
    const chiavi = opzioni.chiaviApi ?? []
    if (chiavi.length > 0 && !aperto && !chiavi.includes(String(chiave))) {
      return inviaJson(res, 401, { message: 'Chiave API mancante o non valida.' })
    }
    const base = new URL(destinazione)
    const intestazioni: Record<string, string | string[]> = {}
    for (const [nome, valore] of Object.entries(req.headers)) {
      if (valore !== undefined && !DI_CONNESSIONE.has(nome)) intestazioni[nome] = valore
    }
    intestazioni['x-forwarded-host'] = req.headers.host ?? ''
    intestazioni['x-forwarded-proto'] = String(req.headers['x-forwarded-proto'] ?? 'https')
    intestazioni['x-forwarded-for'] = req.socket.remoteAddress ?? ''
    const uscita = richiestaHttp(
      {
        protocol: base.protocol,
        hostname: base.hostname,
        port: base.port,
        method: req.method,
        path: base.pathname.replace(/\/$/, '') + percorso,
        headers: intestazioni,
      },
      (risposta) => {
        const sue: Record<string, string | string[]> = {}
        for (const [nome, valore] of Object.entries(risposta.headers)) {
          if (valore !== undefined && !DI_CONNESSIONE.has(nome)) sue[nome] = valore
        }
        res.writeHead(risposta.statusCode ?? 502, sue)
        risposta.pipe(res)
      },
    )
    uscita.on('error', (e) => {
      registra(`Supabase non risponde (${destinazione}):`, e)
      inviaJson(res, 502, { message: 'Il database di Ciak non risponde: è avviato sul NAS?' })
    })
    req.pipe(uscita)
  }

  async function file(percorso: string, req: IncomingMessage, res: ServerResponse) {
    let relativo: string
    try {
      relativo = decodeURIComponent(percorso)
    } catch {
      relativo = '/'
    }
    let assoluto = resolve(cartella, `.${relativo}`)
    // Un «../» non esce dalla cartella dell'app.
    if (assoluto !== cartella && !assoluto.startsWith(cartella + sep)) assoluto = cartella
    let trovato = false
    try {
      trovato = (await stat(assoluto)).isFile()
    } catch {
      /* non c'è: si ricade sull'app */
    }
    // Una pagina dell'app («/film/123») è index.html, come la riscrittura di
    // vercel.json: è il router del browser a sapere cosa mostrare.
    if (!trovato) assoluto = resolve(cartella, 'index.html')
    const estensione = extname(assoluto)
    const html = estensione === '.html'

    let pronto = preparati.get(assoluto)
    if (!pronto) {
      let byte: Buffer
      try {
        byte = await readFile(assoluto)
      } catch {
        return inviaJson(res, 404, { error: 'App non costruita: manca dist/index.html.' })
      }
      if (html) byte = Buffer.from(conConfigurazione(byte.toString('utf8'), opzioni.configurazione))
      pronto = { byte, gz: COMPRIMIBILI.has(estensione) && byte.length > 1024 ? gzipSync(byte) : undefined }
      preparati.set(assoluto, pronto)
    }

    res.statusCode = 200
    res.setHeader('Content-Type', TIPI[estensione] ?? 'application/octet-stream')
    // I file in /assets/ hanno l'impronta nel nome: non cambiano mai. Il resto
    // (index.html, sw.js, manifest, versione.json) va sempre richiesto, o
    // l'app aperta non vedrebbe mai la versione nuova.
    res.setHeader('Cache-Control', relativo.startsWith('/assets/') && trovato ? 'public, max-age=31536000, immutable' : 'no-cache')
    if (pronto.gz) res.setHeader('Vary', 'Accept-Encoding')
    const gzip = pronto.gz && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))
    const corpo = gzip ? pronto.gz! : pronto.byte
    if (gzip) res.setHeader('Content-Encoding', 'gzip')
    res.setHeader('Content-Length', String(corpo.length))
    res.end(req.method === 'HEAD' ? undefined : corpo)
  }

  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://ciak')
    const percorso = url.pathname
    const dopoQuery = (req.url ?? '/').slice(percorso.length)

    if (opzioni.supabase && percorso.startsWith('/auth/v1/')) {
      return inoltra(opzioni.supabase.auth, percorso.slice('/auth/v1'.length) + dopoQuery, LOGIN_APERTO.test(percorso), req, res)
    }
    if (opzioni.supabase && percorso.startsWith('/rest/v1/')) {
      return inoltra(opzioni.supabase.rest, percorso.slice('/rest/v1'.length) + dopoQuery, false, req, res)
    }
    const api = /^\/api\/([\w-]+)\/?$/.exec(percorso)
    if (api) return void funzione(api[1], req, res, url)
    if (percorso.startsWith('/api/')) return inviaJson(res, 404, { error: 'Funzione sconosciuta.' })
    if (req.method !== 'GET' && req.method !== 'HEAD') return inviaJson(res, 405, { error: 'Metodo non consentito.' })
    void file(percorso, req, res).catch((e) => {
      registra(`File ${percorso} non servito:`, e)
      inviaJson(res, 500, { error: 'Errore interno.' })
    })
  })
}

// Quanto manca alla prossima esecuzione quotidiana alle `ora`:00 UTC: il cron
// di Vercel per gli avvisi delle uscite («0 9 * * *»).
export function msAllaProssima(adesso: Date, ora: number): number {
  const prossima = new Date(Date.UTC(adesso.getUTCFullYear(), adesso.getUTCMonth(), adesso.getUTCDate(), ora))
  if (prossima.getTime() <= adesso.getTime()) prossima.setUTCDate(prossima.getUTCDate() + 1)
  return prossima.getTime() - adesso.getTime()
}
