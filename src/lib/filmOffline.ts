import { logFailure } from './logFailure'

// I film salvati in Ciak, per vederli anche senza il disco a portata e senza
// rete (in giro, sul tablet). Stanno nella cache «ciak-film-v1» del browser:
// il lettore ne prende il file da lì (`urlFilmSalvato`).
//
// Per ogni film: il file (/film-offline/{id}) e una scheda (/film-offline/
// {id}/info.json) con titolo, stato e i sottotitoli già trovati, così offline
// ci sono anche quelli; e i file accanto che servono al lettore (le lingue
// dell'audio di prepara-ciak) in /film-offline/{id}/vicino/{nome}.

const CACHE_FILM = 'ciak-film-v1'

export type StatoFilmOffline = 'in-corso' | 'completo' | 'errore'

export interface SottotitoloOffline {
  chiave: string
  lingua: string | null
  etichetta: string
  vtt: string
}

export interface FilmOffline {
  id: string
  titolo: string
  file: string
  dimensione: number | null
  stato: StatoFilmOffline
  scaricatoIl?: number
  errore?: string
  sottotitoli?: SottotitoloOffline[]
  // La serie, per un episodio: «Sul dispositivo» li raccoglie sotto di lei.
  serie?: string | null
  // I nomi dei file accanto salvati con lui (vedi `viciniSalvati`).
  vicini?: string[]
}

const PREFISSO = '/film-offline/'

function urlFilm(id: string): string {
  return PREFISSO + id
}
function urlInfo(id: string): string {
  return PREFISSO + id + '/info.json'
}
function urlVicino(id: string, nome: string): string {
  return PREFISSO + id + '/vicino/' + encodeURIComponent(nome)
}

// Senza Cache API (contesti privati restrittivi, browser vecchi) la funzione
// non esiste: i pulsanti non compaiono.
export function offlineDisponibile(): boolean {
  return typeof caches !== 'undefined'
}

// Dimensione leggibile (i film sono grossi: MB/GB). `size` può mancare.
export function taglia(bytes: number | null | undefined): string {
  if (!bytes) return ''
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(1).replace('.', ',')} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}

// Estrae l'id di un film dall'URL della sua scheda in cache; null per il resto.
export function idDaUrlInfo(url: string): string | null {
  const m = /\/film-offline\/([\w-]+)\/info\.json$/.exec(url)
  return m ? m[1] : null
}

async function leggiInfo(cache: Cache, id: string): Promise<FilmOffline | null> {
  const res = await cache.match(urlInfo(id))
  if (!res) return null
  try {
    return (await res.json()) as FilmOffline
  } catch {
    return null
  }
}

async function scriviInfo(cache: Cache, info: FilmOffline): Promise<void> {
  await cache.put(urlInfo(info.id), new Response(JSON.stringify(info), { headers: { 'Content-Type': 'application/json' } }))
}

export async function filmOffline(id: string): Promise<FilmOffline | null> {
  if (!offlineDisponibile()) return null
  try {
    return await leggiInfo(await caches.open(CACHE_FILM), id)
  } catch (e) {
    logFailure('Lettura del film offline')(e)
    return null
  }
}

// Tutti i film sul dispositivo, i completi per primi e poi per titolo.
export async function elencaFilmOffline(): Promise<FilmOffline[]> {
  if (!offlineDisponibile()) return []
  try {
    const cache = await caches.open(CACHE_FILM)
    const chiavi = await cache.keys()
    const film: FilmOffline[] = []
    for (const req of chiavi) {
      const id = idDaUrlInfo(req.url)
      if (!id) continue
      const info = await leggiInfo(cache, id)
      if (info) film.push(info)
    }
    return film.sort(
      (a, b) =>
        Number(b.stato === 'completo') - Number(a.stato === 'completo') ||
        a.titolo.localeCompare(b.titolo, 'it', { numeric: true }),
    )
  } catch (e) {
    logFailure('Elenco dei film offline')(e)
    return []
  }
}

// Quanto spazio usa Ciak sul dispositivo (film compresi) e quanto ne resta.
export async function spazio(): Promise<{ usato: number; disponibile: number } | null> {
  try {
    const stima = await navigator.storage?.estimate()
    if (!stima) return null
    return { usato: stima.usage ?? 0, disponibile: (stima.quota ?? 0) - (stima.usage ?? 0) }
  } catch {
    return null
  }
}

// Chiede al browser di non buttare via i dati di Ciak quando lo spazio
// scarseggia: senza, un film da gigabyte è il primo candidato a sparire.
async function chiediPersistenza(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

// ── Avvisi: chi ascolta sa quando un salvataggio comincia, finisce o fallisce ─
type Ascoltatore = (evento: { id: string; stato: StatoFilmOffline | 'eliminato' }) => void
const ascoltatori = new Set<Ascoltatore>()

function avvisa(evento: Parameters<Ascoltatore>[0]): void {
  for (const a of ascoltatori) a(evento)
}

export function ascoltaFilmOffline(cb: Ascoltatore): () => void {
  ascoltatori.add(cb)
  return () => ascoltatori.delete(cb)
}

export async function eliminaFilm(id: string): Promise<void> {
  if (!offlineDisponibile()) return
  const cache = await caches.open(CACHE_FILM)
  const info = await leggiInfo(cache, id)
  for (const nome of info?.vicini ?? []) await cache.delete(urlVicino(id, nome))
  await cache.delete(urlFilm(id))
  await cache.delete(urlInfo(id))
  avvisa({ id, stato: 'eliminato' })
}

// I sottotitoli trovati dopo il salvataggio, o cambiati con «Prova un altro»,
// raggiungono la scheda del film: offline si vedono quelli.
export async function salvaSottotitoliOffline(id: string, sottotitoli: SottotitoloOffline[]): Promise<void> {
  if (!offlineDisponibile()) return
  const cache = await caches.open(CACHE_FILM)
  const info = await leggiInfo(cache, id)
  if (!info) return
  await scriviInfo(cache, { ...info, sottotitoli })
}

// Lo spazio concesso dal browser è finito: chi copia una serie intera si
// ferma e lo dice, invece di riprovare ogni episodio che seguirebbe.
export class SpazioFinito extends Error {
  constructor() {
    super('Non c’è abbastanza spazio sul dispositivo per salvarlo.')
  }
}

// Un film che è già sul dispositivo (aperto dal disco, vedi filmLocali): si
// copia nella cache del lettore così com'è, senza rete, e da lì parte anche
// dopo aver chiuso Ciak o staccato il disco. `vicini` sono i file accanto da
// tenere con lui: le lingue dell'audio, senza le quali un anime doppiato
// tornerebbe muto nella lingua scelta.
export async function salvaFileSulDispositivo(
  film: { id: string; titolo: string; file: string; serie?: string | null },
  contenuto: Blob,
  sottotitoli: SottotitoloOffline[],
  vicini: File[] = [],
): Promise<void> {
  if (!offlineDisponibile()) throw new Error('Questo browser non può salvare film sul dispositivo.')
  const cache = await caches.open(CACHE_FILM)
  void chiediPersistenza()
  const nomiVicini = vicini.map((f) => f.name)
  const scheda = { ...film, dimensione: contenuto.size + vicini.reduce((t, f) => t + f.size, 0), vicini: nomiVicini }
  await scriviInfo(cache, { ...scheda, stato: 'in-corso', sottotitoli })
  avvisa({ id: film.id, stato: 'in-corso' })
  try {
    await cache.put(urlFilm(film.id), new Response(contenuto, { headers: { 'Content-Type': contenuto.type || 'video/mp4' } }))
    for (const f of vicini) await cache.put(urlVicino(film.id, f.name), new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream' } }))
  } catch (e) {
    for (const nome of nomiVicini) await cache.delete(urlVicino(film.id, nome))
    await cache.delete(urlFilm(film.id))
    await cache.delete(urlInfo(film.id))
    avvisa({ id: film.id, stato: 'errore' })
    // Il caso tipico: il film non ci sta nello spazio che il browser concede.
    if (e instanceof DOMException && e.name === 'QuotaExceededError') throw new SpazioFinito()
    throw new Error(e instanceof Error ? e.message : 'Salvataggio non riuscito.')
  }
  await scriviInfo(cache, { ...scheda, stato: 'completo', scaricatoIl: Date.now(), sottotitoli })
  avvisa({ id: film.id, stato: 'completo' })
}

// Il file di un film salvato, per il <video>. Un blob dalla cache del browser
// resta sul disco: non si carica tutto in memoria. Chi lo usa lo rilascia
// (URL.revokeObjectURL) quando non serve più. null se non c'è.
export async function urlFilmSalvato(id: string): Promise<string | null> {
  const blob = await fileFilmSalvato(id)
  return blob ? URL.createObjectURL(blob) : null
}

// Il file di un film salvato, per chi lo deve leggere (l'hash per i
// sottotitoli online): anche questo resta sul disco. null se non c'è.
export async function fileFilmSalvato(id: string): Promise<Blob | null> {
  if (!offlineDisponibile()) return null
  const res = await (await caches.open(CACHE_FILM)).match(urlFilm(id))
  return res ? res.blob() : null
}

// I file accanto salvati con un film, di nuovo come File: il lettore li usa
// come quelli della cartella (vedi useTracceAudio). Vuoto se non ce ne sono.
export async function viciniSalvati(id: string): Promise<File[]> {
  if (!offlineDisponibile()) return []
  const cache = await caches.open(CACHE_FILM)
  const info = await leggiInfo(cache, id)
  const file: File[] = []
  for (const nome of info?.vicini ?? []) {
    const res = await cache.match(urlVicino(id, nome))
    if (res) file.push(new File([await res.blob()], nome, { type: res.headers.get('Content-Type') ?? '' }))
  }
  return file
}
