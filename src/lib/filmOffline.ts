import { logFailure } from './logFailure'
import { apiDriveMediaUrl, flussoVideoUrl, tokenDrive } from './googleDrive'

// I film scaricati sul dispositivo, per vederli anche senza rete (in giro, sul
// tablet). Stanno nella cache «ciak-film-v1» del browser, la stessa che il
// service worker legge quando il lettore chiede /drive-video/{id}: un film
// scaricato parte da lì, online o offline, senza chiedere niente a Drive.
//
// Per ogni film: il file (/film-offline/{id}) e una scheda (/film-offline/
// {id}/info.json) con titolo, stato e i sottotitoli già trovati, così offline
// ci sono anche quelli.

export const CACHE_FILM = 'ciak-film-v1'

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
}

export interface Avanzamento {
  id: string
  ricevuti: number
  totale: number | null
}

const PREFISSO = '/film-offline/'

function urlFilm(id: string): string {
  return PREFISSO + id
}
function urlInfo(id: string): string {
  return PREFISSO + id + '/info.json'
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
export async function chiediPersistenza(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

// ── Avvisi: chi ascolta sa quando un download avanza, finisce o fallisce ─────
type Ascoltatore = (evento: { id: string; stato: StatoFilmOffline | 'annullato' | 'eliminato'; avanzamento?: Avanzamento }) => void
const ascoltatori = new Set<Ascoltatore>()

function avvisa(evento: Parameters<Ascoltatore>[0]): void {
  for (const a of ascoltatori) a(evento)
}

export function ascoltaFilmOffline(cb: Ascoltatore): () => void {
  ascoltatori.add(cb)
  return () => ascoltatori.delete(cb)
}

// I download in sottofondo finiscono nel service worker: da lì arriva il messaggio.
if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', (evento: MessageEvent) => {
    const dati = evento.data as { tipo?: string; id?: string; stato?: string } | null
    if (dati?.tipo !== 'ciak:film-offline' || !dati.id) return
    avvisa({ id: dati.id, stato: dati.stato as StatoFilmOffline | 'annullato' })
  })
}

// ── Download ─────────────────────────────────────────────────────────────────
interface BackgroundFetchManager {
  fetch: (
    id: string,
    requests: Request[],
    options: { title: string; icons?: { src: string; sizes: string; type: string }[]; downloadTotal?: number },
  ) => Promise<unknown>
  get: (id: string) => Promise<unknown>
}

function backgroundFetch(reg: ServiceWorkerRegistration): BackgroundFetchManager | null {
  return (reg as ServiceWorkerRegistration & { backgroundFetch?: BackgroundFetchManager }).backgroundFetch ?? null
}

const inCorso = new Map<string, AbortController>()

export function downloadInCorso(id: string): boolean {
  return inCorso.has(id)
}

// Scarica un film sul dispositivo. Se il browser sa farlo in sottofondo
// (Background Fetch: Chrome su Android e desktop), continua a schermo spento e
// con l'app chiusa, con la notifica di sistema; il service worker lo mette in
// cache alla fine. Altrimenti lo si scarica da qui, e la pagina deve restare
// aperta.
export async function scaricaFilm(
  film: { id: string; titolo: string; file: string; dimensione: number | null },
  sottotitoli: SottotitoloOffline[],
): Promise<'sottofondo' | 'pagina'> {
  if (!offlineDisponibile()) throw new Error('Questo browser non può salvare film sul dispositivo.')
  const cache = await caches.open(CACHE_FILM)
  void chiediPersistenza()
  await scriviInfo(cache, { ...film, stato: 'in-corso', sottotitoli })
  avvisa({ id: film.id, stato: 'in-corso' })

  const token = tokenDrive()
  const reg = await navigator.serviceWorker?.getRegistration()
  const bg = reg && backgroundFetch(reg)
  if (bg && token) {
    try {
      // Il download in sottofondo non passa dal service worker: chiede a Drive
      // direttamente, col token.
      await bg.fetch(
        'ciak-film-' + film.id,
        [new Request(apiDriveMediaUrl(film.id), { headers: { Authorization: `Bearer ${token}` } })],
        {
          title: film.titolo,
          icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          downloadTotal: film.dimensione ?? undefined,
        },
      )
      return 'sottofondo'
    } catch (e) {
      logFailure('Download in sottofondo non avviato: si scarica dalla pagina')(e)
    }
  }

  const controllo = new AbortController()
  inCorso.set(film.id, controllo)
  try {
    const res = await fetch(flussoVideoUrl(film.id), { signal: controllo.signal })
    if (!res.ok || !res.body) throw new Error(`Drive ha risposto ${res.status}.`)
    const totale = film.dimensione ?? (Number(res.headers.get('Content-Length')) || null)
    let ricevuti = 0
    let ultimoAvviso = 0
    const contatore = new TransformStream<Uint8Array, Uint8Array>({
      transform(pezzo, controller) {
        ricevuti += pezzo.byteLength
        controller.enqueue(pezzo)
        // Un avviso ogni 4 MB basta a muovere la barra senza intasare la pagina.
        if (ricevuti - ultimoAvviso > 4 * 1024 * 1024) {
          ultimoAvviso = ricevuti
          avvisa({ id: film.id, stato: 'in-corso', avanzamento: { id: film.id, ricevuti, totale } })
        }
      },
    })
    await cache.put(
      urlFilm(film.id),
      new Response(res.body.pipeThrough(contatore), {
        headers: { 'Content-Type': res.headers.get('Content-Type') || 'video/mp4' },
      }),
    )
    await scriviInfo(cache, { ...film, stato: 'completo', scaricatoIl: Date.now(), sottotitoli })
    avvisa({ id: film.id, stato: 'completo' })
    return 'pagina'
  } catch (e) {
    if (controllo.signal.aborted) {
      await cache.delete(urlFilm(film.id))
      await cache.delete(urlInfo(film.id))
      avvisa({ id: film.id, stato: 'annullato' })
      throw new Error('Download annullato.')
    }
    const errore = e instanceof Error ? e.message : 'Download non riuscito.'
    await cache.delete(urlFilm(film.id))
    await scriviInfo(cache, { ...film, stato: 'errore', errore, sottotitoli })
    avvisa({ id: film.id, stato: 'errore' })
    throw e
  } finally {
    inCorso.delete(film.id)
  }
}

export function annullaDownload(id: string): void {
  inCorso.get(id)?.abort()
}

export async function eliminaFilm(id: string): Promise<void> {
  if (!offlineDisponibile()) return
  annullaDownload(id)
  const cache = await caches.open(CACHE_FILM)
  await cache.delete(urlFilm(id))
  await cache.delete(urlInfo(id))
  avvisa({ id, stato: 'eliminato' })
}

// I sottotitoli trovati dopo l'avvio del download, o cambiati con «Prova un
// altro», raggiungono la scheda del film: offline si vedono quelli.
export async function salvaSottotitoliOffline(id: string, sottotitoli: SottotitoloOffline[]): Promise<void> {
  if (!offlineDisponibile()) return
  const cache = await caches.open(CACHE_FILM)
  const info = await leggiInfo(cache, id)
  if (!info) return
  await scriviInfo(cache, { ...info, sottotitoli })
}
