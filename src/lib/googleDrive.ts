import type { DiagnosticaVideo } from './lettore'
import { mapLimit } from './mapLimit'
import { analizzaNomeFilm, cartellaRaccolta, filmDaCercare, stagioneDaCartella } from './sottotitoli'
import { cartellaDaChiudere, pianoCestino, type PianoCestino } from './cestinoDrive'
import {
  CHIAVE_ATTESA_DRIVE,
  CHIAVE_ERRORE_DRIVE,
  CHIAVE_PROVATO_DRIVE,
  CHIAVE_RICORDA_DRIVE,
  CHIAVE_TOKEN_DRIVE,
  PERCORSO_RITORNO_DRIVE,
  PREFISSO_STATO_DRIVE,
} from './ritornoDrive'
import { dimenticaSulServer, rinnovaDalServer, urlConsensoDalServer } from './driveServer'

// I tuoi film restano su Google Drive, nella cartella «Ciak»: qui li si ELENCA e
// li si riproduce in streaming — col lettore di Google o con quello di Ciak, che
// legge il file originale e mostra i sottotitoli — senza scaricarli.
//
// Autenticazione: Google Identity Services (GIS), flusso token per una SPA — il
// Client ID è pubblico (nessun segreto lato client). Lo scope è `drive`, tutto
// il Drive: prima bastavano la lettura (per trovare i film) e i soli file
// creati da Ciak (`drive.file`, per salvare un sottotitolo accanto al film),
// ma i video li carica lo script attraverso Drive per desktop, e per cestinare
// quelli (vedi cestinaVideo) serve il permesso sui file degli altri.
// Il token scade dopo ~1h e senza backend non c'è refresh: lo teniamo in
// localStorage, così riaprire l'app entro l'ora non costringe a ricollegarsi;
// scaduto, lo si rinnova da soli con un redirect senza domande (vedi
// `driveAutomatico`).

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const SCOPE = 'https://www.googleapis.com/auth/drive'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const API = 'https://www.googleapis.com/drive/v3/files'
const API_CARICAMENTO = 'https://www.googleapis.com/upload/drive/v3/files'
const CHIAVE_SESSIONE = CHIAVE_TOKEN_DRIVE
// Chi vuole sapere quando il permesso cambia (rinnovato in sottofondo, tolto)
// ascolta questo evento su window.
export const EVENTO_DRIVE = 'ciak:drive-token'

// La cartella, nella radice di «Il mio Drive», da cui si prendono i film.
export const CARTELLA_CIAK = 'Ciak'
const MIME_CARTELLA = 'application/vnd.google-apps.folder'
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
  // [1080p]»), null se sta direttamente nella cartella Ciak o in una
  // cartella di categoria.
  cartella: string | null
  // La cartella di primo livello dentro Ciak (FILM, SERIE TV, ANIME…): è la
  // scheda della videoteca in cui compare. null se sta direttamente in Ciak.
  categoria?: string | null
  // La cartella della serie, quando il file sta in una cartella di stagione
  // («South Park» per South Park/Season 03/01 Rainforest….mp4).
  serie?: string | null
  // Quando è stato caricato su Drive (ISO), per «Aggiunti di recente».
  aggiunto?: string | null
  // L'id della cartella che lo contiene: cancellando una serie intera si
  // lavora per cartella, senza chiedere a Drive dove sta ogni file.
  cartellaId?: string | null
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
    error_callback?: (err: { type?: string }) => void
  }) => TokenClient
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOauth2 } }
  }
}

let accessToken: string | null = null
let tokenExpiry = 0

// localStorage può mancare (test su Node) o lanciare (modalità privata
// restrittive): in quel caso si resta col token solo in memoria.
function salvaToken(): void {
  scriviToken()
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_DRIVE))
}

function scriviToken(): void {
  try {
    if (accessToken) {
      localStorage.setItem(CHIAVE_SESSIONE, JSON.stringify({ t: accessToken, e: tokenExpiry }))
      if (!localStorage.getItem(CHIAVE_RICORDA_DRIVE)) localStorage.setItem(CHIAVE_RICORDA_DRIVE, '{}')
    } else {
      localStorage.removeItem(CHIAVE_SESSIONE)
    }
  } catch {
    /* nessuna persistenza: pazienza */
  }
}

function leggiToken(): void {
  // Prima il token stava nella scheda (sessionStorage): chi aveva collegato
  // Drive prima dell'aggiornamento lo ritrova, e il dispositivo lo ricorda.
  let vecchio: string | null = null
  try {
    vecchio = sessionStorage.getItem(CHIAVE_SESSIONE)
  } catch {
    /* niente sessionStorage: niente da recuperare */
  }
  try {
    const raw = localStorage.getItem(CHIAVE_SESSIONE) ?? vecchio
    if (!raw) return
    const { t, e } = JSON.parse(raw) as { t?: unknown; e?: unknown }
    if (typeof t === 'string' && typeof e === 'number' && Date.now() < e) {
      accessToken = t
      tokenExpiry = e
      if (vecchio) {
        salvaToken()
        sessionStorage.removeItem(CHIAVE_SESSIONE)
      }
    }
  } catch {
    /* token illeggibile o storage assente: si ricollega */
  }
}
leggiToken()

export function driveConnesso(): boolean {
  return !!accessToken && Date.now() < tokenExpiry
}

// Il token, per chi deve parlare con Drive senza passare dal service worker
// (il download in sottofondo). Null se scaduto o assente.
export function tokenDrive(): string | null {
  return driveConnesso() ? accessToken : null
}

// L'URL da cui Drive serve il contenuto di un file.
export function apiDriveMediaUrl(id: string): string {
  return `${API}/${id}?alt=media`
}

// Quando scade la sessione Google (ms dall'epoch), 0 se non c'è.
export function scadenzaDrive(): number {
  return driveConnesso() ? tokenExpiry : 0
}

// `dimentica`: scollegato a mano, quindi niente più rinnovi da soli. Un token
// scaduto o revocato (un 401) invece si dimentica e basta: il rinnovo ci riprova.
export function driveDisconnetti(dimentica = false): void {
  accessToken = null
  tokenExpiry = 0
  salvaToken()
  if (dimentica) {
    // Anche il server smette di rinnovarlo, se no ricollegherebbe da solo.
    void dimenticaSulServer()
    try {
      localStorage.removeItem(CHIAVE_RICORDA_DRIVE)
      // Né il rinnovo né il primo tentativo da soli: si ricollega a mano.
      localStorage.setItem(CHIAVE_PROVATO_DRIVE, '1')
    } catch {
      /* storage assente: non c'era niente da dimenticare */
    }
  }
}

// Un token arrivato da fuori (il server di Ciak, che lo rinnova con il
// refresh token): si tiene come quello del consenso.
export function impostaTokenDrive(token: string, scadenza: number): void {
  accessToken = token
  tokenExpiry = scadenza
  salvaToken()
}

// Lo state di un giro verso Google: casuale, con il nostro prefisso.
function nuovoStato(): string {
  const casuali = crypto.getRandomValues(new Uint8Array(16))
  return PREFISSO_STATO_DRIVE + Array.from(casuali, (b) => b.toString(16).padStart(2, '0')).join('')
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

// L'app installata (icona sulla home, a schermo intero): lì il popup di Google
// non riesce a tornare all'app, e si usa il redirect (vedi `ritornoDrive`).
export function inAppInstallata(): boolean {
  try {
    if ((navigator as Navigator & { standalone?: boolean }).standalone) return true
    return ['standalone', 'fullscreen', 'minimal-ui'].some((m) => window.matchMedia(`(display-mode: ${m})`).matches)
  } catch {
    return false
  }
}

// L'indirizzo del consenso Google per il flusso a redirect: lo stesso permesso
// del popup, che torna in `redirectUri` col token nel frammento. `silenzioso`:
// senza nessuna schermata (`prompt=none`), per rinnovare un permesso già dato;
// l'account evita che, con più account Google sul telefono, Google chieda quale.
export function urlConsensoDrive(
  clientId: string,
  redirectUri: string,
  stato: string,
  silenzioso?: { account: string | null },
): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('response_type', 'token')
  u.searchParams.set('scope', SCOPE)
  u.searchParams.set('include_granted_scopes', 'true')
  u.searchParams.set('state', stato)
  if (silenzioso) {
    u.searchParams.set('prompt', 'none')
    if (silenzioso.account) u.searchParams.set('login_hint', silenzioso.account)
  }
  return u.toString()
}

// L'errore con cui Google è tornato dall'ultimo redirect, una volta sola.
export function erroreRitornoDrive(): string | null {
  try {
    const e = sessionStorage.getItem(CHIAVE_ERRORE_DRIVE)
    if (e) sessionStorage.removeItem(CHIAVE_ERRORE_DRIVE)
    return e
  } catch {
    return null
  }
}

export function consensoConRedirect(clientId: string, silenzioso?: { account: string | null }): Promise<never> {
  const stato = nuovoStato()
  const ritorno = window.location.pathname + window.location.search
  sessionStorage.setItem(CHIAVE_ATTESA_DRIVE, JSON.stringify({ stato, ritorno, silenzioso: !!silenzioso }))
  window.location.assign(urlConsensoDrive(clientId, window.location.origin + PERCORSO_RITORNO_DRIVE, stato, silenzioso))
  // La pagina se ne va: chi aspetta resta in attesa fino al ritorno.
  return new Promise<never>(() => {})
}

// Apre il consenso Google e mette da parte il token. Da chiamare su gesto utente
// (un click): il popup di Google richiede un'interazione.
export function clientIdDrive(): string | null {
  return CLIENT_ID ?? null
}

export async function collegaDrive(): Promise<void> {
  if (!CLIENT_ID) throw new Error('Google Drive non è configurato.')
  // Prima il server di Ciak: se tiene il permesso lo rinnova senza chiedere;
  // se c'è ma non ce l'ha, il consenso passa da lui, e da lì in poi non
  // scade più. Senza server, il giro di prima.
  const dalServer = await rinnovaDalServer()
  if (dalServer.stato === 'rinnovato') {
    impostaTokenDrive(dalServer.token, dalServer.scadenza)
    return
  }
  if (dalServer.stato === 'non-collegato') {
    const stato = nuovoStato()
    const ritorno = window.location.pathname + window.location.search
    const url = await urlConsensoDalServer(stato, ritorno)
    if (url) {
      sessionStorage.setItem(CHIAVE_ATTESA_DRIVE, JSON.stringify({ stato, ritorno }))
      window.location.assign(url)
      return new Promise<never>(() => {})
    }
  }
  if (inAppInstallata()) return consensoConRedirect(CLIENT_ID)
  await caricaGis()
  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) throw new Error('Google Identity Services non disponibile.')

  const resp = await new Promise<TokenResponse>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: resolve,
      // Senza, un popup chiuso o bloccato lasciava il pulsante su
      // «Collegamento…» per sempre.
      error_callback: (err) =>
        reject(
          new Error(
            err.type === 'popup_failed_to_open'
              ? 'Il browser ha bloccato la finestra di Google: consenti i popup per Ciak e riprova.'
              : err.type === 'popup_closed'
                ? 'La finestra di Google è stata chiusa prima di finire.'
                : 'Accesso a Google Drive non riuscito.',
          ),
        ),
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

// Il lettore di Ciak mostra solo i video che il browser sa riprodurre: MP4 (e
// i pochi WebM/M4V). Gli MKV, anche quando hanno video e audio compatibili,
// Chrome spesso li scarica senza mai aprirli — si convertono una volta con
// lo script `converti-mkv.bat`, e l'MP4 prende il loro posto. Quelli nascosti
// si contano, così la pagina lo dice invece di farli sparire in silenzio.
const RIPRODUCIBILI = /\.(mp4|m4v|webm)$/i

export function soloRiproducibili(video: DriveVideo[]): { visibili: DriveVideo[]; nascosti: number } {
  const visibili = video.filter((v) => RIPRODUCIBILI.test(v.name))
  return { visibili, nascosti: video.length - visibili.length }
}

// Gli extra dei film: featurette, trailer, interviste, dietro le quinte, scene
// tagliate. Non sono titoli da guardare, e nella videoteca comparivano come
// film a sé («Featurettes», dalla cartella di Paprika). Si contano, come gli
// MKV. Gli «Extras» e gli speciali delle serie restano: sono la stagione 0.
const CARTELLA_EXTRA =
  /^\s*(?:featurettes?|trailers?|interviews?|interviste|behind[ ._-]?the[ ._-]?scenes|dietro le quinte|deleted[ ._-]?scenes|scene tagliate|making[ ._-]?of|samples?)\s*$/i

// Gli scarti delle release, accanto al film: l'anteprima («….Sample.mp4») e il
// promo di pochi MB del gruppo che l'ha fatta («ETRG.mp4»). Nessun film né
// episodio sta sotto i 5 MB; senza misura nota il file resta.
const ANTEPRIMA = /(?:^|[._ -])sample(?:$|[._ -])/i
const MINIMO_BYTE = 5 * 1024 * 1024

function scarto(v: Pick<DriveVideo, 'cartella' | 'name' | 'size'>): boolean {
  if (v.cartella && CARTELLA_EXTRA.test(v.cartella)) return true
  if (ANTEPRIMA.test(v.name.replace(/\.[a-z0-9]{2,4}$/i, ''))) return true
  return v.size !== null && v.size < MINIMO_BYTE
}

export function senzaExtra<T extends Pick<DriveVideo, 'cartella' | 'name' | 'size'>>(video: T[]): { visibili: T[]; extra: number } {
  const visibili = video.filter((v) => !scarto(v))
  return { visibili, extra: video.length - visibili.length }
}

// Le schede della videoteca, dalle cartelle di primo livello: nell'ordine in
// cui le si pensa (film, serie, anime, cartoni) e poi le altre in ordine
// alfabetico; «Altro» per i video messi direttamente in Ciak.
const ORDINE_CATEGORIE = ['film', 'serie tv', 'serie', 'anime', 'cartoni', 'cartoni animati']

export function nomeCategoria(cartella: string | null): string {
  if (!cartella) return 'Altro'
  const basso = cartella.trim().toLowerCase()
  if (basso === 'serie tv') return 'Serie TV'
  return basso.charAt(0).toUpperCase() + basso.slice(1)
}

export function schedeCategorie(video: Pick<DriveVideo, 'categoria'>[]): { cartella: string | null; nome: string; quanti: number }[] {
  const conta = new Map<string | null, number>()
  for (const v of video) conta.set(v.categoria ?? null, (conta.get(v.categoria ?? null) ?? 0) + 1)
  const posto = (c: string | null) => {
    if (c === null) return 1000
    const i = ORDINE_CATEGORIE.indexOf(c.trim().toLowerCase())
    return i === -1 ? 100 : i
  }
  return [...conta.entries()]
    .map(([cartella, quanti]) => ({ cartella, nome: nomeCategoria(cartella), quanti }))
    .sort((a, b) => posto(a.cartella) - posto(b.cartella) || a.nome.localeCompare(b.nome, 'it'))
}

// Il titolo da mostrare: il nome della sottocartella se c'è (di solito il film,
// «Song of the Sea (2014) [1080p]»), altrimenti il nome del file senza
// estensione. Per un episodio, la serie con stagione ed episodio: senza, tutti
// gli episodi di una cartella avrebbero lo stesso nome.
export function titoloVideo(v: Pick<DriveVideo, 'name' | 'cartella' | 'serie'>): string {
  const nome = filmDaCercare(v.name, v.cartella, v.serie ?? null)
  const episodio = nome.stagione !== undefined && nome.episodio !== undefined ? `S${nome.stagione}E${nome.episodio}` : null
  if (v.serie && stagioneDaCartella(v.cartella)) {
    // Il nome della serie ripulito: «South Park Season 1 to 26 Mp4 1080p» è
    // una raccolta, la serie è «South Park». L'anno resta: distingue i remake.
    const serie = analizzaNomeFilm(v.serie)
    return `${serie.anno !== undefined ? `${serie.titolo} (${serie.anno})` : serie.titolo} · ${episodio ?? v.cartella}`
  }
  // Il nome di un pacchetto («Transformers Complete Movie Collection») è
  // uguale per tutti i film che contiene: vale quello letto dal file.
  if (v.cartella && cartellaRaccolta(v.cartella) && !episodio) {
    return nome.anno !== undefined ? `${nome.titolo} (${nome.anno})` : nome.titolo
  }
  if (v.cartella) return episodio ? `${v.cartella} · ${episodio}` : v.cartella
  return v.name.replace(/\.[a-z0-9]{2,4}$/i, '')
}

interface FileGrezzo {
  id: string
  name: string
  size?: string
  mimeType: string
  parents?: string[]
  createdTime?: string
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

// L'account Google del permesso: serve a rinnovarlo da soli senza che Google
// chieda quale account usare.
export async function accountDrive(): Promise<string | null> {
  const res = await richiestaDrive('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)')
  return ((await res.json()) as { user?: { emailAddress?: string } }).user?.emailAddress ?? null
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
// livelli, fino in fondo. C'erano un tetto di 4 livelli e di 200 cartelle, ma
// con una cartella per stagione la videoteca lo superava presto, e i video
// oltre sparivano dall'elenco senza dirlo. Le richieste restano poche (venti
// cartelle per richiesta), e Drive non ha cicli: una cartella non può stare
// dentro sé stessa, e ognuna si visita una volta sola.
// Quante richieste a Drive insieme: abbastanza da non aspettarle in fila,
// poche abbastanza da non farsi rispondere 429.
const PARALLELE = 6

export async function elencaVideo(): Promise<ElencoVideo> {
  const radici = await cercaFile(
    `name = '${CARTELLA_CIAK}' and mimeType = '${MIME_CARTELLA}' and 'root' in parents and trashed = false`,
    'id, name',
  )
  if (radici.length === 0) return { cartellaTrovata: false, video: [] }

  const idRadici = new Set(radici.map((r) => r.id))
  const nomiCartelle = new Map<string, string>()
  const genitoreDi = new Map<string, string>()
  // La categoria di ogni cartella: il nome della sua antenata di primo livello.
  const categoriaDi = new Map<string, string>()
  // Le cartelle di primo livello: sono categorie, non film.
  const cartelleCategoria = new Set<string>()
  const tutte: string[] = [...idRadici]
  let livello = [...idRadici]
  for (let profondita = 0; livello.length > 0; profondita++) {
    // Le query di un livello sono indipendenti: in parallelo, a scaglioni.
    // Una dopo l'altra, con una cartella per stagione, erano decine di
    // richieste in fila e secondi di schermata vuota.
    const figli = (await mapLimit(queryInCartelle(livello, `mimeType = '${MIME_CARTELLA}'`), PARALLELE, (q) => cercaFile(q, 'id, name, parents'))).flat()
    livello = []
    for (const f of figli) {
      if (nomiCartelle.has(f.id) || idRadici.has(f.id)) continue
      nomiCartelle.set(f.id, f.name)
      const genitore = f.parents?.[0]
      if (genitore) genitoreDi.set(f.id, genitore)
      const categoria = profondita === 0 ? f.name : genitore ? categoriaDi.get(genitore) : undefined
      if (categoria) categoriaDi.set(f.id, categoria)
      if (profondita === 0) cartelleCategoria.add(f.id)
      tutte.push(f.id)
      livello.push(f.id)
    }
  }

  const grezzi = (
    await mapLimit(queryInCartelle(tutte, "mimeType contains 'video/'"), PARALLELE, (q) => cercaFile(q, 'id, name, size, mimeType, parents, createdTime'))
  ).flat()

  const video = grezzi.map((f) => {
    const genitore = f.parents?.[0]
    // Né la cartella Ciak né una di categoria (FILM, ANIME…) sono il titolo del film.
    const titoloDaCartella = !!genitore && !idRadici.has(genitore) && !cartelleCategoria.has(genitore)
    // Una cartella di stagione dice solo il numero: la serie è quella sopra,
    // purché non sia Ciak né una categoria.
    const nonno = titoloDaCartella && stagioneDaCartella(nomiCartelle.get(genitore as string)) !== null ? genitoreDi.get(genitore as string) : undefined
    const serie = nonno && !idRadici.has(nonno) && !cartelleCategoria.has(nonno) ? (nomiCartelle.get(nonno) ?? null) : null
    return {
      id: f.id,
      name: f.name,
      size: f.size ? Number(f.size) : null,
      mimeType: f.mimeType,
      cartella: titoloDaCartella ? (nomiCartelle.get(genitore as string) ?? null) : null,
      serie,
      categoria: genitore ? (categoriaDi.get(genitore) ?? null) : null,
      aggiunto: f.createdTime ?? null,
      cartellaId: genitore ?? null,
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

// Salva un file di testo in una cartella.
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

// Sposta nel cestino un file (un sottotitolo scartato, un video da cancellare).
export async function cestinaFile(id: string): Promise<void> {
  if (!idDriveValido(id)) return
  await richiestaDrive(`${API}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
}

// Quante sottocartelle ha una cartella: per sapere se, tolto il video, resta vuota.
async function sottocartelleDi(idCartella: string): Promise<number> {
  const [q] = queryInCartelle([idCartella], `mimeType = '${MIME_CARTELLA}'`)
  return (await cercaFile(q, 'id')).length
}

// Cancella un video da Ciak: nel cestino di Drive, con i suoi sottotitoli e,
// se la cartella dedicata resta vuota, con la cartella (vedi pianoCestino).
// Dal cestino Google lo recupera per trenta giorni; qui non si cancella per
// sempre niente. Risponde con quello che ha cestinato.
export async function cestinaVideo(id: string): Promise<PianoCestino> {
  const video = await infoFile(id)
  const idCartella = video.parents[0]
  const cartella = idCartella ? await infoFile(idCartella) : null
  const [vicini, sottocartelle] = cartella ? await Promise.all([fileNellaCartella(cartella.id), sottocartelleDi(cartella.id)]) : [[], 0]
  const idSopra = cartella?.parents[0]
  const nomeCartellaSopra = idSopra ? (await infoFile(idSopra)).name : null
  // L'id è quello chiesto, già controllato da infoFile: si cestina quello.
  const piano = pianoCestino({ video: { id, name: video.name }, cartella, vicini, sottocartelle, nomeCartellaSopra, radice: CARTELLA_CIAK })
  if (piano.cartella) await cestinaFile(piano.cartella)
  for (const f of piano.file) await cestinaFile(f)
  return piano
}

// Cancella da Ciak una serie o una saga intera: i video nel cestino di Drive,
// coi sottotitoli. Si lavora per cartella: una stagione che resta vuota va nel
// cestino in una richiesta sola (non una per episodio: South Park sono 300
// file), e poi la cartella della serie, se è rimasta vuota anche lei. Dal
// cestino Google recupera tutto per trenta giorni.
export async function cestinaGruppo(video: Pick<DriveVideo, 'id' | 'name' | 'cartellaId'>[]): Promise<void> {
  const perCartella = new Map<string, { id: string; name: string }[]>()
  for (const v of video) {
    const idCartella = v.cartellaId ?? (await infoFile(v.id)).parents[0] ?? ''
    perCartella.set(idCartella, [...(perCartella.get(idCartella) ?? []), { id: v.id, name: v.name }])
  }
  const sopraSvuotate = new Set<string>()
  for (const [idCartella, suoi] of perCartella) {
    if (!idCartella) {
      for (const v of suoi) await cestinaFile(v.id)
      continue
    }
    const cartella = await infoFile(idCartella)
    const [vicini, sottocartelle] = await Promise.all([fileNellaCartella(idCartella), sottocartelleDi(idCartella)])
    const idSopra = cartella.parents[0]
    const nomeCartellaSopra = idSopra ? (await infoFile(idSopra)).name : null
    const piano = pianoCestino({ video: suoi, cartella, vicini, sottocartelle, nomeCartellaSopra, radice: CARTELLA_CIAK })
    if (piano.cartella) {
      await cestinaFile(piano.cartella)
      if (idSopra) sopraSvuotate.add(idSopra)
    }
    for (const f of piano.file) await cestinaFile(f)
  }
  for (const idSopra of sopraSvuotate) {
    const sopra = await infoFile(idSopra)
    const nomeSopra = sopra.parents[0] ? (await infoFile(sopra.parents[0])).name : null
    const [file, sottocartelle] = await Promise.all([fileNellaCartella(idSopra), sottocartelleDi(idSopra)])
    if (cartellaDaChiudere({ nome: sopra.name, nomeSopra, file: file.length, sottocartelle, radice: CARTELLA_CIAK })) await cestinaFile(idSopra)
  }
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

// La versione del service worker che controlla la scheda; null se non risponde
// (worker vecchio, che non conosce la domanda, o assente).
export function versioneWorker(attesaMs = 2000): Promise<string | null> {
  const controller = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : undefined
  if (!controller) return Promise.resolve(null)
  return new Promise((resolve) => {
    const canale = new MessageChannel()
    const scadenza = setTimeout(() => resolve(null), attesaMs)
    canale.port1.onmessage = (e) => {
      clearTimeout(scadenza)
      resolve(typeof e.data?.versione === 'string' ? e.data.versione : null)
    }
    try {
      controller.postMessage({ tipo: 'ciak:versione' }, [canale.port2])
    } catch {
      clearTimeout(scadenza)
      resolve(null)
    }
  })
}

// Riceve dal service worker cosa ha risposto Drive a ogni pezzo di film.
export function ascoltaDiagnostica(cb: (d: DiagnosticaVideo) => void): () => void {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined
  if (!sw) return () => {}
  const suMessaggio = (evento: MessageEvent) => {
    const dati = evento.data as ({ tipo?: string } & DiagnosticaVideo) | null
    if (dati?.tipo === 'ciak:diagnostica') cb(dati)
  }
  sw.addEventListener('message', suMessaggio)
  return () => sw.removeEventListener('message', suMessaggio)
}

if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', (evento: MessageEvent) => {
    if ((evento.data as { tipo?: string } | null)?.tipo !== 'ciak:drive-token') return
    evento.ports[0]?.postMessage({ token: driveConnesso() ? accessToken : null })
  })
  // I messaggi del worker restano in coda finché la pagina non li accetta.
  navigator.serviceWorker.startMessages?.()
}
