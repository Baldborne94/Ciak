// I tuoi film restano su Google Drive, nella cartella «Ciak»: qui li si ELENCA e
// li si riproduce in streaming — col lettore di Google o con quello di Ciak, che
// legge il file originale e mostra i sottotitoli — senza scaricarli.
//
// Autenticazione: Google Identity Services (GIS), flusso token per una SPA — il
// Client ID è pubblico (nessun segreto lato client). Gli scope: lettura di tutto
// il Drive (per trovare i film) e scrittura dei SOLI file creati da Ciak
// (`drive.file`): è ciò che serve a salvare accanto al film un sottotitolo
// scaricato, senza poter toccare nient'altro.
// Il token scade dopo ~1h e senza backend non c'è refresh: lo teniamo in
// sessionStorage (solo questa scheda, sparisce alla chiusura) così un
// ricaricamento della pagina non costringe a ricollegarsi ogni volta.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const SCOPE = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
].join(' ')
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const API = 'https://www.googleapis.com/drive/v3/files'
const API_CARICAMENTO = 'https://www.googleapis.com/upload/drive/v3/files'
const CHIAVE_SESSIONE = 'ciak:drive-token'

// La cartella, nella radice di «Il mio Drive», da cui si prendono i film.
export const CARTELLA_CIAK = 'Ciak'
const MIME_CARTELLA = 'application/vnd.google-apps.folder'
// Tetti di sicurezza per la visita delle sottocartelle.
const PROFONDITA_MAX = 4
const CARTELLE_MAX = 200

// La funzione esiste solo se è stato configurato un Client ID: senza, la voce di
// menu e la pagina restano nascoste, così il resto dell'app non cambia.
export function driveConfigurato(): boolean {
  return !!CLIENT_ID
}

export interface DriveVideo {
  id: string
  name: string
  size: number | null
  mimeType: string
  // Nome della sottocartella che lo contiene (es. «Song of the Sea (2014)
  // [1080p]»), null se sta direttamente nella cartella Ciak.
  cartella: string | null
}

export interface ElencoVideo {
  cartellaTrovata: boolean
  video: DriveVideo[]
}

// GIS espone `window.google.accounts.oauth2`. Tipizzato al minimo che serve.
interface TokenResponse {
  access_token?: string
  error?: string
  expires_in?: number
}
interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void
}
interface GoogleOauth2 {
  initTokenClient: (config: {
    client_id: string
    scope: string
    callback: (resp: TokenResponse) => void
  }) => TokenClient
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOauth2 } }
  }
}

let accessToken: string | null = null
let tokenExpiry = 0

// sessionStorage può mancare (test su Node) o lanciare (modalità privata
// restrittive): in quel caso si resta col token solo in memoria.
function salvaToken(): void {
  try {
    if (accessToken) {
      sessionStorage.setItem(CHIAVE_SESSIONE, JSON.stringify({ t: accessToken, e: tokenExpiry }))
    } else {
      sessionStorage.removeItem(CHIAVE_SESSIONE)
    }
  } catch {
    /* nessuna persistenza: pazienza */
  }
}

function leggiToken(): void {
  try {
    const raw = sessionStorage.getItem(CHIAVE_SESSIONE)
    if (!raw) return
    const { t, e } = JSON.parse(raw) as { t?: unknown; e?: unknown }
    if (typeof t === 'string' && typeof e === 'number' && Date.now() < e) {
      accessToken = t
      tokenExpiry = e
    }
  } catch {
    /* token illeggibile o storage assente: si ricollega */
  }
}
leggiToken()

export function driveConnesso(): boolean {
  return !!accessToken && Date.now() < tokenExpiry
}

// Quando scade la sessione Google (ms dall'epoch), 0 se non c'è.
export function scadenzaDrive(): number {
  return driveConnesso() ? tokenExpiry : 0
}

export function driveDisconnetti(): void {
  accessToken = null
  tokenExpiry = 0
  salvaToken()
}

// Carica lo script GIS una sola volta (idempotente: se c'è già, non lo riaggiunge).
function caricaGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const esistente = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
    if (esistente) {
      esistente.addEventListener('load', () => resolve())
      esistente.addEventListener('error', () => reject(new Error('Script Google non caricato')))
      return
    }
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Script Google non caricato'))
    document.head.appendChild(s)
  })
}

// Apre il consenso Google e mette da parte il token. Da chiamare su gesto utente
// (un click): il popup di Google richiede un'interazione.
export async function collegaDrive(): Promise<void> {
  if (!CLIENT_ID) throw new Error('Google Drive non è configurato.')
  await caricaGis()
  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) throw new Error('Google Identity Services non disponibile.')

  const resp = await new Promise<TokenResponse>((resolve) => {
    const client = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: resolve,
    })
    client.requestAccessToken()
  })
  if (resp.error || !resp.access_token) {
    throw new Error(resp.error || 'Accesso a Google Drive non riuscito.')
  }
  accessToken = resp.access_token
  // Margine di sicurezza sotto l'ora dichiarata, per non usare un token già scaduto.
  const secondi = resp.expires_in ?? 3600
  tokenExpiry = Date.now() + Math.max(0, secondi - 120) * 1000
  salvaToken()
}

// La condizione «sta in una di queste cartelle» per la query di Drive, a blocchi:
// una query con centinaia di OR supererebbe la lunghezza massima dell'URL.
export function queryInCartelle(idCartelle: string[], condizione: string, blocco = 20): string[] {
  const query: string[] = []
  for (let i = 0; i < idCartelle.length; i += blocco) {
    const genitori = idCartelle
      .slice(i, i + blocco)
      .map((id) => `'${id}' in parents`)
      .join(' or ')
    query.push(`(${genitori}) and ${condizione} and trashed = false`)
  }
  return query
}

// Il titolo da mostrare: il nome della sottocartella se c'è (di solito il film,
// «Song of the Sea (2014) [1080p]»), altrimenti il nome del file senza estensione.
export function titoloVideo(v: Pick<DriveVideo, 'name' | 'cartella'>): string {
  if (v.cartella) return v.cartella
  return v.name.replace(/\.[a-z0-9]{2,4}$/i, '')
}

interface FileGrezzo {
  id: string
  name: string
  size?: string
  mimeType: string
  parents?: string[]
}

// Una richiesta all'API di Drive col token. Un 401 vuol dire token scaduto o
// revocato: lo dimentichiamo, così la pagina torna a proporre il collegamento.
async function richiestaDrive(url: string, init: RequestInit = {}): Promise<Response> {
  if (!driveConnesso() || !accessToken) throw new Error('Google Drive non collegato.')
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  const res = await fetch(url, { ...init, headers })
  if (res.status === 401) {
    driveDisconnetti()
    throw new Error('La sessione Google è scaduta: ricollega Google Drive.')
  }
  if (!res.ok) throw new Error(`Google Drive ha risposto ${res.status}.`)
  return res
}

// Una query a Drive, seguendo le pagine.
async function cercaFile(q: string, campi: string): Promise<FileGrezzo[]> {
  const risultati: FileGrezzo[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      q,
      fields: `nextPageToken, files(${campi})`,
      pageSize: '1000',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await richiestaDrive(`${API}?${params}`)
    const data = (await res.json()) as { files?: FileGrezzo[]; nextPageToken?: string }
    risultati.push(...(data.files ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)
  return risultati
}

// I video dentro la cartella «Ciak» (radice di Il mio Drive) e nelle sue
// sottocartelle. Drive non ha una ricerca ricorsiva: si visitano le cartelle a
// livelli, con un tetto di profondità e di numero per restare leggeri.
export async function elencaVideo(): Promise<ElencoVideo> {
  const radici = await cercaFile(
    `name = '${CARTELLA_CIAK}' and mimeType = '${MIME_CARTELLA}' and 'root' in parents and trashed = false`,
    'id, name',
  )
  if (radici.length === 0) return { cartellaTrovata: false, video: [] }

  const idRadici = new Set(radici.map((r) => r.id))
  const nomiCartelle = new Map<string, string>()
  const tutte: string[] = [...idRadici]
  let livello = [...idRadici]
  for (let profondita = 0; profondita < PROFONDITA_MAX && livello.length > 0; profondita++) {
    const figli: FileGrezzo[] = []
    for (const q of queryInCartelle(livello, `mimeType = '${MIME_CARTELLA}'`)) {
      figli.push(...(await cercaFile(q, 'id, name')))
    }
    livello = []
    for (const f of figli) {
      if (nomiCartelle.has(f.id) || idRadici.has(f.id) || tutte.length >= CARTELLE_MAX) continue
      nomiCartelle.set(f.id, f.name)
      tutte.push(f.id)
      livello.push(f.id)
    }
  }

  const grezzi: FileGrezzo[] = []
  for (const q of queryInCartelle(tutte, "mimeType contains 'video/'")) {
    grezzi.push(...(await cercaFile(q, 'id, name, size, mimeType, parents')))
  }

  const video = grezzi.map((f) => {
    const genitore = f.parents?.[0]
    return {
      id: f.id,
      name: f.name,
      size: f.size ? Number(f.size) : null,
      mimeType: f.mimeType,
      cartella: genitore && !idRadici.has(genitore) ? (nomiCartelle.get(genitore) ?? null) : null,
    }
  })
  video.sort((a, b) => titoloVideo(a).localeCompare(titoloVideo(b), 'it', { numeric: true }))
  return { cartellaTrovata: true, video }
}

// Gli id dei file Drive sono fatti solo di lettere, cifre, «-» e «_»: tutto il
// resto viene rifiutato prima di finire in un URL.
export function idDriveValido(id: string): boolean {
  return /^[\w-]{10,}$/.test(id)
}

// Il lettore di Google: riproduce in streaming dentro un iframe, senza scaricare
// il file. Usa la sessione Google del browser (nessun token nell'URL).
export function anteprimaUrl(id: string): string {
  return `https://drive.google.com/file/d/${id}/preview`
}

// Lo stesso file aperto su Drive (dove si gestiscono anche i sottotitoli).
export function apriSuDriveUrl(id: string): string {
  return `https://drive.google.com/file/d/${id}/view`
}

export interface InfoFile {
  id: string
  name: string
  size: number | null
  mimeType: string
  parents: string[]
}

// Nome, dimensione e cartella di un file: il lettore li chiede da sé, perché
// arrivando da un link o da un ricaricamento non ha l'elenco a disposizione.
export async function infoFile(id: string): Promise<InfoFile> {
  if (!idDriveValido(id)) throw new Error('File non valido.')
  const res = await richiestaDrive(`${API}/${id}?fields=${encodeURIComponent('id, name, size, mimeType, parents')}`)
  const f = (await res.json()) as FileGrezzo
  return {
    id: f.id,
    name: f.name,
    size: f.size ? Number(f.size) : null,
    mimeType: f.mimeType,
    parents: f.parents ?? [],
  }
}

// I file (non le cartelle) che stanno accanto a un video.
export async function fileNellaCartella(idCartella: string): Promise<FileGrezzo[]> {
  if (!idDriveValido(idCartella)) return []
  const [q] = queryInCartelle([idCartella], `mimeType != '${MIME_CARTELLA}'`)
  return cercaFile(q, 'id, name, mimeType')
}

// Il contenuto di un file, tutto o solo un intervallo di byte (per l'hash).
export async function scaricaByte(id: string, intervallo?: [number, number]): Promise<ArrayBuffer> {
  if (!idDriveValido(id)) throw new Error('File non valido.')
  const headers: Record<string, string> = {}
  if (intervallo) headers.Range = `bytes=${intervallo[0]}-${intervallo[1]}`
  const res = await richiestaDrive(`${API}/${id}?alt=media`, { headers })
  return res.arrayBuffer()
}

// Salva un file di testo in una cartella (serve lo scope `drive.file`).
export async function creaFileTesto(idCartella: string, nome: string, testo: string): Promise<string> {
  const confine = `ciak-${Math.random().toString(36).slice(2)}`
  const metadati = { name: nome, parents: [idCartella], mimeType: 'application/x-subrip' }
  const corpo =
    `--${confine}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadati)}\r\n` +
    `--${confine}\r\nContent-Type: application/x-subrip; charset=UTF-8\r\n\r\n${testo}\r\n--${confine}--`
  const res = await richiestaDrive(`${API_CARICAMENTO}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${confine}` },
    body: corpo,
  })
  return ((await res.json()) as { id: string }).id
}

// Sposta nel cestino un file creato da Ciak (un sottotitolo scartato).
export async function cestinaFile(id: string): Promise<void> {
  if (!idDriveValido(id)) return
  await richiestaDrive(`${API}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
}

// ── Il lettore di Ciak ──────────────────────────────────────────────────────
// Un <video> non sa mandare l'intestazione Authorization, e Drive non accetta
// più il token nell'URL. Il service worker (public/sw.js) fa da tramite: il
// video chiede /drive-video/{id} alla nostra origine, il worker si fa dare il
// token da questa pagina con un messaggio e gira la richiesta a Drive. Così il
// token non finisce mai in un URL.

export function flussoVideoUrl(id: string): string {
  return `/drive-video/${id}`
}

// Senza un service worker che controlla la pagina (primo caricamento, sviluppo,
// browser senza supporto) /drive-video/ non porta da nessuna parte: si usa il
// lettore di Drive.
export function lettoreCiakDisponibile(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller
}

// Avvisa quando il lettore di Ciak diventa usabile. Se la scheda non è ancora
// controllata dal worker (Ctrl+F5, primo caricamento dopo un aggiornamento) gli
// si chiede di prenderla: prima si restava sul lettore di Drive senza un perché.
export function attendiLettoreCiak(pronto: () => void): () => void {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined
  if (!sw) return () => {}
  if (sw.controller) {
    pronto()
    return () => {}
  }
  const suCambio = () => {
    if (sw.controller) pronto()
  }
  sw.addEventListener('controllerchange', suCambio)
  // `ready` aspetta un worker attivo; senza registrazione (sviluppo) non si risolve mai.
  void sw.ready.then((reg) => reg.active?.postMessage({ tipo: 'ciak:prendi-controllo' }))
  return () => sw.removeEventListener('controllerchange', suCambio)
}

// Chrome ferma un service worker che resta 30 secondi senza eventi, e con lui
// si chiude la richiesta a Drive da cui arriva il film: il video si blocca con
// «errore di rete». Finché il film va, un messaggio ogni 20 secondi lo tiene
// sveglio (ogni evento azzera l'attesa).
export function tieniSveglioIlLettore(): () => void {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined
  if (!sw) return () => {}
  const timer = setInterval(() => sw.controller?.postMessage({ tipo: 'ciak:tieni-vivo' }), 20_000)
  return () => clearInterval(timer)
}

if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', (evento: MessageEvent) => {
    if ((evento.data as { tipo?: string } | null)?.tipo !== 'ciak:drive-token') return
    evento.ports[0]?.postMessage({ token: driveConnesso() ? accessToken : null })
  })
  // I messaggi del worker restano in coda finché la pagina non li accetta.
  navigator.serviceWorker.startMessages?.()
}
