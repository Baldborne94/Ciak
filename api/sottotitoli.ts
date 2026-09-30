// Sottotitoli da OpenSubtitles per il lettore di Ciak, quando nella cartella del
// film su Drive non ce ne sono. Lato server perché la chiave API (e le
// credenziali dell'account, che alzano il tetto di download) non devono finire
// nel bundle del browser.
//
// Due azioni: «cerca» (elenco di candidati, non consuma download) e «scarica»
// (un file, che conta nel tetto giornaliero di OpenSubtitles).
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const API_KEY = process.env.OPENSUBTITLES_API_KEY ?? ''
const USERNAME = process.env.OPENSUBTITLES_USERNAME ?? ''
const PASSWORD = process.env.OPENSUBTITLES_PASSWORD ?? ''
const BASE = 'https://api.opensubtitles.com/api/v1'
// OpenSubtitles rifiuta le richieste senza un User-Agent che dica chi è l'app.
const USER_AGENT = 'Ciak v1.0'
const LINGUE = ['it', 'en']
const MAX_CANDIDATI = 10
const MAX_BYTE_SOTTOTITOLO = 2_000_000

interface Req {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  body?: unknown
}
interface Res {
  status: (code: number) => Res
  json: (body: unknown) => void
}

export interface Ricerca {
  query: string
  anno?: number
  stagione?: number
  episodio?: number
  hash?: string
}

export interface Candidato {
  fileId: number
  lingua: string
  nome: string
  download: number
  hash: boolean
}

interface RisultatoGrezzo {
  attributes?: {
    language?: string
    download_count?: number
    moviehash_match?: boolean
    machine_translated?: boolean
    ai_translated?: boolean
    release?: string
    files?: { file_id?: number; file_name?: string }[]
  }
}

// Solo ciò che arriva dal browser e ha una forma sensata: il resto si scarta
// invece di finire nella richiesta a OpenSubtitles.
export function leggiRicerca(body: unknown): Ricerca | null {
  const b = (body ?? {}) as Record<string, unknown>
  const query = typeof b.query === 'string' ? b.query.trim().slice(0, 200) : ''
  if (!query) return null
  const intero = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined
  const hash = typeof b.hash === 'string' && /^[0-9a-f]{16}$/.test(b.hash) ? b.hash : undefined
  return {
    query,
    anno: intero(b.anno, 1880, 2100),
    stagione: intero(b.stagione, 0, 200),
    episodio: intero(b.episodio, 0, 5000),
    hash,
  }
}

// I parametri in ordine alfabetico e in minuscolo: OpenSubtitles altrimenti
// risponde con un redirect, e ogni redirect è una richiesta in più.
export function parametriRicerca(r: Ricerca, { conHash = true, conAnno = true } = {}): string {
  const p: Record<string, string> = { languages: LINGUE.slice().sort().join(','), query: r.query.toLowerCase() }
  if (conHash && r.hash) p.moviehash = r.hash
  if (r.stagione !== undefined && r.episodio !== undefined) {
    p.season_number = String(r.stagione)
    p.episode_number = String(r.episodio)
    p.type = 'episode'
  } else {
    p.type = 'movie'
    if (conAnno && r.anno !== undefined) p.year = String(r.anno)
  }
  return new URLSearchParams(Object.entries(p).sort(([a], [b]) => a.localeCompare(b))).toString()
}

// Prima quelli sincronizzati su questo file (hash), poi l'italiano, poi le
// traduzioni fatte da persone, poi i più scaricati: un buon indizio di qualità.
export function ordinaCandidati(dati: RisultatoGrezzo[]): Candidato[] {
  const candidati: (Candidato & { automatico: boolean })[] = []
  for (const d of dati) {
    const a = d.attributes
    const f = a?.files?.[0]
    if (!a || !f?.file_id || !a.language || !LINGUE.includes(a.language)) continue
    candidati.push({
      fileId: f.file_id,
      lingua: a.language,
      nome: f.file_name ?? a.release ?? '',
      download: a.download_count ?? 0,
      hash: !!a.moviehash_match,
      automatico: !!(a.machine_translated || a.ai_translated),
    })
  }
  candidati.sort(
    (x, y) =>
      Number(y.hash) - Number(x.hash) ||
      LINGUE.indexOf(x.lingua) - LINGUE.indexOf(y.lingua) ||
      Number(x.automatico) - Number(y.automatico) ||
      y.download - x.download,
  )
  return candidati
    .slice(0, MAX_CANDIDATI)
    .map(({ fileId, lingua, nome, download, hash }) => ({ fileId, lingua, nome, download, hash }))
}

function intestazioni(extra: Record<string, string> = {}): Record<string, string> {
  return { 'Api-Key': API_KEY, 'User-Agent': USER_AGENT, Accept: 'application/json', ...extra }
}

async function cerca(query: string): Promise<RisultatoGrezzo[]> {
  const res = await fetch(`${BASE}/subtitles?${query}`, { headers: intestazioni() })
  if (!res.ok) throw new Error(`OpenSubtitles ha risposto ${res.status} alla ricerca.`)
  return ((await res.json()) as { data?: RisultatoGrezzo[] }).data ?? []
}

// Il login dell'account alza il tetto di download rispetto alla sola chiave.
// Il token vale un giorno: lo si tiene finché la funzione resta calda.
let sessione: { token: string; base: string; scade: number } | null = null
async function accedi(): Promise<{ token: string; base: string } | null> {
  if (!USERNAME || !PASSWORD) return null
  if (sessione && Date.now() < sessione.scade) return sessione
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: intestazioni({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`Accesso a OpenSubtitles non riuscito (${res.status}).`)
  const data = (await res.json()) as { token?: string; base_url?: string }
  if (!data.token) throw new Error('OpenSubtitles non ha restituito un token.')
  const base = data.base_url ? `https://${data.base_url.replace(/^https?:\/\//, '')}/api/v1` : BASE
  sessione = { token: data.token, base, scade: Date.now() + 12 * 3600_000 }
  return sessione
}

function decodifica(byte: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(byte)
  } catch {
    return new TextDecoder('windows-1252').decode(byte)
  }
}

async function scarica(fileId: number): Promise<{ testo: string; rimasti: number | null }> {
  const login = await accedi()
  const res = await fetch(`${login?.base ?? BASE}/download`, {
    method: 'POST',
    headers: intestazioni({
      'Content-Type': 'application/json',
      ...(login ? { Authorization: `Bearer ${login.token}` } : {}),
    }),
    body: JSON.stringify({ file_id: fileId }),
  })
  const data = (await res.json().catch(() => ({}))) as { link?: string; remaining?: number; message?: string }
  if (res.status === 406 || res.status === 429) {
    const e = new Error('Download di sottotitoli esauriti per oggi su OpenSubtitles: riprova domani.')
    ;(e as Error & { status?: number }).status = 429
    throw e
  }
  if (!res.ok || !data.link) throw new Error(data.message ?? `OpenSubtitles ha risposto ${res.status} al download.`)
  const file = await fetch(data.link)
  if (!file.ok) throw new Error(`Il file dei sottotitoli non si scarica (${file.status}).`)
  const byte = await file.arrayBuffer()
  if (byte.byteLength > MAX_BYTE_SOTTOTITOLO) throw new Error('Il file dei sottotitoli è troppo grande.')
  return { testo: decodifica(byte), rimasti: typeof data.remaining === 'number' ? data.remaining : null }
}

// Solo chi ha fatto l'accesso a Ciak: l'endpoint consuma un tetto di download
// che è dell'account, non una risorsa da offrire a chiunque trovi l'URL.
async function utenteValido(req: Req): Promise<boolean> {
  if (!SUPABASE_URL || !ANON_KEY) return false
  const raw = req.headers?.authorization ?? req.headers?.Authorization
  const value = Array.isArray(raw) ? raw[0] : raw
  const token = value ? (/^Bearer\s+(.+)$/i.exec(value)?.[1] ?? null) : null
  if (!token) return false
  const supa = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await supa.auth.getUser(token)
  return !error && !!data?.user
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito.' })
  if (!API_KEY) {
    return res.status(503).json({ error: 'La ricerca dei sottotitoli online non è configurata.', nonConfigurato: true })
  }
  try {
    if (!(await utenteValido(req))) return res.status(401).json({ error: 'Accedi per cercare i sottotitoli.' })

    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Record<string, unknown> | null
    if (body?.azione === 'cerca') {
      const ricerca = leggiRicerca(body)
      if (!ricerca) return res.status(400).json({ error: 'Manca il titolo da cercare.' })
      let dati = await cerca(parametriRicerca(ricerca))
      // Hash e anno restringono molto: se non trovano niente, si riprova col
      // solo titolo, che è meglio di nessun sottotitolo.
      if (dati.length === 0 && (ricerca.hash || ricerca.anno !== undefined)) {
        dati = await cerca(parametriRicerca(ricerca, { conHash: false, conAnno: false }))
      }
      return res.status(200).json({ candidati: ordinaCandidati(dati) })
    }
    if (body?.azione === 'scarica') {
      const fileId = body.fileId
      if (typeof fileId !== 'number' || !Number.isInteger(fileId) || fileId <= 0) {
        return res.status(400).json({ error: 'Sottotitolo non valido.' })
      }
      return res.status(200).json(await scarica(fileId))
    }
    return res.status(400).json({ error: 'Azione sconosciuta.' })
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 502
    return res.status(status).json({ error: (err as Error).message })
  }
}
