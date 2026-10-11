import { CARTELLA_CIAK, titoloVideo, type DriveVideo } from './googleDrive'
import { stagioneDaCartella } from './sottotitoli'

// Il server di casa: Jellyfin, sul PC a cui è attaccato il disco coi film.
// Ciak gli chiede l'elenco dei video e li riproduce da lì, come fa con Drive:
// la videoteca, il riconoscimento dei titoli, il diario e il punto di ripresa
// non cambiano, perché un video di Jellyfin è un «file» con un id suo
// (`jf-<id di Jellyfin>`) come quelli di Drive.
//
// Ciak è servito in HTTPS e il browser non lascia una pagina HTTPS parlare con
// un server in HTTP: il server va raggiunto in HTTPS, di solito attraverso
// Tailscale («tailscale serve»), che dà un indirizzo https://…ts.net valido sia
// in casa sia fuori.

export const PREFISSO_JELLYFIN = 'jf-'
const CHIAVE = 'ciak:jellyfin'
const CHIAVE_DISPOSITIVO = 'ciak:jellyfin-dispositivo'
export const EVENTO_JELLYFIN = 'ciak:jellyfin-cambiato'

export interface ConfigJellyfin {
  url: string // senza «/» finale
  token: string
  userId: string
  utente: string
}

export function eJellyfin(fileId: string): boolean {
  return fileId.startsWith(PREFISSO_JELLYFIN)
}

// L'id di Jellyfin dentro quello di Ciak: 32 cifre esadecimali.
export function idJellyfin(fileId: string): string | null {
  const id = fileId.slice(PREFISSO_JELLYFIN.length)
  return eJellyfin(fileId) && /^[0-9a-f]{32}$/i.test(id) ? id : null
}

export function leggiJellyfin(): ConfigJellyfin | null {
  try {
    const c = JSON.parse(localStorage.getItem(CHIAVE) ?? 'null') as Partial<ConfigJellyfin> | null
    return c && c.url && c.token && c.userId ? { url: c.url, token: c.token, userId: c.userId, utente: c.utente ?? '' } : null
  } catch {
    return null
  }
}

export function jellyfinCollegato(): boolean {
  return leggiJellyfin() !== null
}

function avvisa() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_JELLYFIN))
}

export function scollegaJellyfin(): void {
  // Il token si toglie anche dal server, se risponde: scollegare un tablet
  // perso deve valere davvero.
  const config = leggiJellyfin()
  if (config) {
    fetch(`${config.url}/Sessions/Logout`, { method: 'POST', headers: { Authorization: intestazione(config.token) }, keepalive: true }).catch(() => {
      /* server spento: il token resta là, si toglie da Dispositivi */
    })
  }
  try {
    localStorage.removeItem(CHIAVE)
  } catch {
    /* storage negato: non c'era niente da togliere */
  }
  avvisa()
}

// Jellyfin vuole sapere chi gli parla: un dispositivo con un id che resta.
function idDispositivo(): string {
  try {
    let id = localStorage.getItem(CHIAVE_DISPOSITIVO)
    if (!id) {
      id = `ciak-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
      localStorage.setItem(CHIAVE_DISPOSITIVO, id)
    }
    return id
  } catch {
    return 'ciak'
  }
}

function intestazione(token?: string): string {
  const parti = [`Client="Ciak"`, `Device="Ciak"`, `DeviceId="${idDispositivo()}"`, `Version="1.0"`]
  if (token) parti.push(`Token="${token}"`)
  return `MediaBrowser ${parti.join(', ')}`
}

// L'indirizzo come lo scrive una persona («casa.tail1234.ts.net», con o senza
// https, con la barra in fondo): quello che serve a Ciak, o un errore che
// spiega cosa non va.
export function normalizzaIndirizzo(testo: string, paginaHttps: boolean): string {
  let url = testo.trim().replace(/\/+$/, '')
  if (!url) throw new Error('Scrivi l’indirizzo del server.')
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  let analizzato: URL
  try {
    analizzato = new URL(url)
  } catch {
    throw new Error('Questo non sembra un indirizzo: deve essere qualcosa come https://pc-di-casa.tuarete.ts.net')
  }
  if (paginaHttps && analizzato.protocol === 'http:') {
    throw new Error(
      'Il browser non lascia Ciak (in HTTPS) parlare con un server in HTTP. Rendi Jellyfin raggiungibile in HTTPS con Tailscale («tailscale serve»): l’indirizzo diventa https://…ts.net.',
    )
  }
  return `${analizzato.origin}${analizzato.pathname.replace(/\/+$/, '')}`
}

export class ErroreJellyfin extends Error {
  // Il token non vale più (password cambiata, dispositivo tolto dal server).
  sessione = false
}

async function richiesta<T>(percorso: string, init: RequestInit = {}, config = leggiJellyfin()): Promise<T> {
  if (!config) throw new ErroreJellyfin('Il server di casa non è collegato.')
  let res: Response
  try {
    res = await fetch(`${config.url}${percorso}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: intestazione(config.token) },
    })
  } catch {
    throw new ErroreJellyfin(
      'Il server di casa non risponde: il PC è acceso, con Jellyfin aperto? Fuori casa serve anche Tailscale acceso su questo dispositivo.',
    )
  }
  if (res.status === 401) {
    const e = new ErroreJellyfin('Il server di casa non riconosce più questo dispositivo: ricollegalo.')
    e.sessione = true
    throw e
  }
  if (!res.ok) throw new ErroreJellyfin(`Il server di casa ha risposto con un errore (HTTP ${res.status}).`)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// Utente e password si scrivono una volta per dispositivo: a Ciak resta solo
// il token che Jellyfin gli dà, che si toglie dal server quando si vuole.
export async function collegaJellyfin(indirizzo: string, utente: string, password: string): Promise<ConfigJellyfin> {
  const url = normalizzaIndirizzo(indirizzo, typeof location !== 'undefined' && location.protocol === 'https:')
  let res: Response
  try {
    res = await fetch(`${url}/Users/AuthenticateByName`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: intestazione() },
      body: JSON.stringify({ Username: utente, Pw: password }),
    })
  } catch {
    throw new ErroreJellyfin(
      'Non riesco a raggiungere il server. Controlla l’indirizzo, che il PC sia acceso con Jellyfin aperto e, se non sei a casa, che Tailscale sia acceso anche qui.',
    )
  }
  if (res.status === 401) throw new ErroreJellyfin('Utente o password sbagliati.')
  if (!res.ok) throw new ErroreJellyfin(`Il server ha risposto con un errore (HTTP ${res.status}).`)
  const dati = (await res.json()) as { AccessToken?: string; User?: { Id?: string; Name?: string } }
  if (!dati.AccessToken || !dati.User?.Id) throw new ErroreJellyfin('Il server non ha dato l’accesso: è davvero Jellyfin?')
  const config: ConfigJellyfin = { url, token: dati.AccessToken, userId: dati.User.Id, utente: dati.User.Name ?? utente }
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(config))
  } catch {
    throw new ErroreJellyfin('Il browser non lascia salvare il collegamento (spazio pieno o navigazione privata).')
  }
  avvisa()
  return config
}

// ── L'elenco ────────────────────────────────────────────────────────────────

export interface LibreriaGrezza {
  Name: string
  Locations?: string[]
}

export interface ElementoGrezzo {
  Id: string
  Type: string
  Name?: string
  Path?: string
  DateCreated?: string
}

const parti = (percorso: string) => percorso.split(/[\\/]+/).filter(Boolean)
const uguale = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0

// Un video di Jellyfin come un file della videoteca di Ciak. Le cartelle sono
// quelle del disco, uguali a quelle che c'erano su Drive: la categoria (FILM,
// SERIE TV…) è la cartella della libreria, o la prima sotto «Ciak» se la
// libreria è la cartella Ciak intera; poi la cartella del film o della
// stagione, e sopra la stagione la serie.
export function videoDaJellyfin(elementi: ElementoGrezzo[], librerie: LibreriaGrezza[]): DriveVideo[] {
  const radici = librerie.flatMap((l) => (l.Locations ?? []).map((p) => parti(p)))
  const video: DriveVideo[] = []
  for (const e of elementi) {
    if (!e.Path || !/^[0-9a-f]{32}$/i.test(e.Id)) continue
    const tutto = parti(e.Path)
    const nome = tutto[tutto.length - 1]
    // La radice più lunga che lo contiene: librerie una dentro l'altra.
    const radice = radici
      .filter((r) => r.length < tutto.length && r.every((p, i) => uguale(p, tutto[i])))
      .sort((a, b) => b.length - a.length)[0]
    let cartelle = radice ? tutto.slice(radice.length, -1) : tutto.slice(-2, -1)
    // Il nome come sta nel percorso del file: la libreria può averlo scritto
    // con le maiuscole diverse.
    let categoria: string | null = radice ? tutto[radice.length - 1] : null
    if (categoria && uguale(categoria, CARTELLA_CIAK)) {
      categoria = cartelle[0] ?? null
      cartelle = cartelle.slice(1)
    }
    const cartella = cartelle.length > 0 ? cartelle[cartelle.length - 1] : null
    const sopra = cartelle.length > 1 ? cartelle[cartelle.length - 2] : null
    const estensione = /\.([a-z0-9]+)$/i.exec(nome)?.[1]?.toLowerCase() ?? 'mp4'
    video.push({
      id: `${PREFISSO_JELLYFIN}${e.Id.toLowerCase()}`,
      name: nome,
      size: null,
      mimeType: `video/${estensione}`,
      cartella,
      serie: cartella && stagioneDaCartella(cartella) !== null ? sopra : null,
      categoria,
      aggiunto: e.DateCreated ?? null,
      cartellaId: null,
    })
  }
  return video
}

export async function elencaVideoJellyfin(): Promise<DriveVideo[]> {
  const config = leggiJellyfin()
  if (!config) return []
  // Le librerie le può leggere solo un amministratore: senza, le cartelle si
  // ricavano dal solo percorso del file.
  const librerie = await richiesta<LibreriaGrezza[]>('/Library/VirtualFolders', {}, config).catch((e: unknown) => {
    if (e instanceof ErroreJellyfin && e.sessione) throw e
    return [] as LibreriaGrezza[]
  })
  const { Items } = await richiesta<{ Items: ElementoGrezzo[] }>(
    `/Items?userId=${config.userId}&Recursive=true&IncludeItemTypes=Movie,Episode,Video&Fields=Path,DateCreated&EnableImages=false&EnableUserData=false`,
    {},
    config,
  )
  return videoDaJellyfin(Items ?? [], librerie)
}

// ── Il lettore ──────────────────────────────────────────────────────────────

export interface TracciaAudioJellyfin {
  indice: number // l'Index di Jellyfin, da passare come AudioStreamIndex
  lingua: string | null
  titolo: string
  codec: string
  esterno: boolean // un file accanto al video (Film.audio-2.m4a), non dentro
}

export interface SottotitoloJellyfin {
  indice: number
  lingua: string | null
  titolo: string
  esterno: boolean
}

export interface InfoJellyfin {
  nome: string
  // Le cartelle del file, come quelle di Drive: per cercare i sottotitoli
  // online e per il titolo quando il video non è ancora riconosciuto.
  cartella: string | null
  serie: string | null
  dimensione: number | null
  sorgente: string // l'id della MediaSource
  contenitore: string
  video: { codec: string; profondita: number | null } | null
  audio: TracciaAudioJellyfin[]
  sottotitoli: SottotitoloJellyfin[]
}

interface StreamGrezzo {
  Index: number
  Type: string
  Codec?: string
  Language?: string
  Title?: string
  DisplayTitle?: string
  IsDefault?: boolean
  IsExternal?: boolean
  IsTextSubtitleStream?: boolean
  BitDepth?: number
}

interface SorgenteGrezza {
  Id: string
  Path?: string
  Container?: string
  Size?: number
  MediaStreams?: StreamGrezzo[]
}

const lingua = (l?: string) => (l && l !== 'und' ? l.toLowerCase() : null)

export function infoDaSorgente(s: SorgenteGrezza): InfoJellyfin {
  const flussi = s.MediaStreams ?? []
  const v = flussi.find((f) => f.Type === 'Video')
  const audio = flussi
    .filter((f) => f.Type === 'Audio')
    // Prima quelle dentro il file, nell'ordine del file: la prima è quella che
    // si sente senza scegliere niente.
    .sort((a, b) => Number(!!a.IsExternal) - Number(!!b.IsExternal) || a.Index - b.Index)
    .map((f) => ({ indice: f.Index, lingua: lingua(f.Language), titolo: f.Title ?? '', codec: (f.Codec ?? '').toLowerCase(), esterno: !!f.IsExternal }))
  const cartelle = parti(s.Path ?? '').slice(0, -1)
  const cartella = cartelle[cartelle.length - 1] ?? null
  return {
    nome: parti(s.Path ?? '').pop() ?? '',
    cartella,
    serie: cartella && stagioneDaCartella(cartella) !== null ? (cartelle[cartelle.length - 2] ?? null) : null,
    dimensione: s.Size ?? null,
    sorgente: s.Id,
    contenitore: (s.Container ?? '').toLowerCase(),
    video: v ? { codec: (v.Codec ?? '').toLowerCase(), profondita: v.BitDepth ?? null } : null,
    audio,
    // Solo quelli di testo: quelli a immagini (PGS dei Blu-ray) il browser
    // non li disegna, e Ciak nemmeno.
    sottotitoli: flussi
      .filter((f) => f.Type === 'Subtitle' && f.IsTextSubtitleStream)
      .map((f) => ({ indice: f.Index, lingua: lingua(f.Language), titolo: f.Title ?? f.DisplayTitle ?? '', esterno: !!f.IsExternal })),
  }
}

export async function infoVideoJellyfin(fileId: string): Promise<InfoJellyfin> {
  const config = leggiJellyfin()
  const id = idJellyfin(fileId)
  if (!config || !id) throw new ErroreJellyfin('Il server di casa non è collegato.')
  const item = await richiesta<{ MediaSources?: SorgenteGrezza[] }>(`/Users/${config.userId}/Items/${id}`, {}, config)
  const sorgente = item.MediaSources?.[0]
  if (!sorgente) throw new ErroreJellyfin('Il server non trova più questo video.')
  return infoDaSorgente(sorgente)
}

// La traccia che si sente senza scegliere: il browser suona la prima dentro
// il file. Jellyfin segna «predefinite» anche quelle accanto, che invece non
// partono da sole.
export function tracciaPredefinita(info: InfoJellyfin): TracciaAudioJellyfin | undefined {
  return info.audio.find((a) => !a.esterno) ?? info.audio[0]
}

// Il file così com'è, quando il browser lo sa leggere: MP4 con video H.264 a
// 8 bit (o WebM) e audio AAC/MP3/Opus. Il resto (MKV, HEVC, Dolby) Jellyfin lo
// converte al volo (`flussoHls`).
export function riproducibileDirettamente(info: InfoJellyfin): boolean {
  const contenitori = info.contenitore.split(',')
  const mp4 = contenitori.some((c) => ['mp4', 'm4v', 'mov'].includes(c))
  const webm = contenitori.includes('webm')
  const video = info.video
  const videoOk = !!video && ((mp4 && video.codec === 'h264' && (video.profondita ?? 8) <= 8) || (webm && ['vp8', 'vp9', 'av1'].includes(video.codec)))
  const audio = tracciaPredefinita(info)
  const audioOk = !audio || ['aac', 'mp3', 'opus', 'vorbis', 'flac'].includes(audio.codec)
  return videoOk && audioOk
}

export function flussoDiretto(fileId: string, config = leggiJellyfin()): string {
  const id = idJellyfin(fileId)
  if (!config || !id) return ''
  return `${config.url}/Videos/${id}/stream?static=true&api_key=${encodeURIComponent(config.token)}`
}

// Il video convertito da Jellyfin in HLS (pezzi da 6 secondi), con la lingua
// scelta: il video si copia quando è già H.264, l'audio diventa AAC stereo.
export function flussoHls(fileId: string, info: InfoJellyfin, audio: number | null, sessione: string, config = leggiJellyfin()): string {
  const id = idJellyfin(fileId)
  if (!config || !id) return ''
  const p = new URLSearchParams({
    MediaSourceId: info.sorgente,
    api_key: config.token,
    PlaySessionId: sessione,
    VideoCodec: 'h264',
    AudioCodec: 'aac',
    TranscodingMaxAudioChannels: '2',
    SegmentContainer: 'mp4',
    MinSegments: '1',
    BreakOnNonKeyFrames: 'true',
    allowVideoStreamCopy: 'true',
    allowAudioStreamCopy: 'true',
  })
  if (audio !== null) p.set('AudioStreamIndex', String(audio))
  return `${config.url}/Videos/${id}/master.m3u8?${p.toString()}`
}

export function sottotitoloJellyfin(fileId: string, info: InfoJellyfin, indice: number, config = leggiJellyfin()): string {
  const id = idJellyfin(fileId)
  if (!config || !id) return ''
  return `${config.url}/Videos/${id}/${info.sorgente}/Subtitles/${indice}/0/Stream.vtt?api_key=${encodeURIComponent(config.token)}`
}

// I video di Drive e quelli del server di casa in un elenco solo. Mentre si
// sposta la collezione dal Drive al disco lo stesso file sta in tutti e due
// i posti: vale la copia di casa, e quella di Drive non si ripete.
export function unisciFonti(drive: DriveVideo[], casa: DriveVideo[]): DriveVideo[] {
  if (casa.length === 0) return drive
  const chiave = (v: DriveVideo) => v.name.toLowerCase()
  const aCasa = new Set(casa.map(chiave))
  return [...drive.filter((v) => !aCasa.has(chiave(v))), ...casa].sort((a, b) =>
    titoloVideo(a).localeCompare(titoloVideo(b), 'it', { numeric: true }),
  )
}

// Una conversione al volo che non serve più (il lettore chiuso, la lingua
// cambiata) si ferma: altrimenti il PC continua a lavorare per niente finché
// Jellyfin non se ne accorge da solo.
export function fermaConversione(sessione: string): void {
  const config = leggiJellyfin()
  if (!config) return
  const p = new URLSearchParams({ deviceId: idDispositivo(), playSessionId: sessione })
  fetch(`${config.url}/Videos/ActiveEncodings?${p.toString()}`, { method: 'DELETE', headers: { Authorization: intestazione(config.token) }, keepalive: true }).catch(
    () => {
      /* il server spento ha già smesso di convertire */
    },
  )
}
