import { CARTELLA_CIAK, type DriveVideo } from './googleDrive'
import { decodificaTesto, nomeLingua, sottotitoliPerVideo, srtAVtt, stagioneDaCartella } from './sottotitoli'
import { idLocale, registraFilmAperto, type FilmAperto } from './filmLocali'
import type { SottotitoloOffline } from './filmOffline'

// La videoteca da una cartella del PC (E:\Ciak): la si sceglie una volta, e
// Ciak la legge come leggeva Drive — schede, serie, stagioni, episodio dopo,
// sottotitoli accanto ai video. I file restano dove sono: il browser li legge
// dal disco quando servono.
//
// Il collegamento è una «maniglia» della cartella (File System Access, Chrome
// ed Edge sul computer) salvata in IndexedDB. Il permesso di leggerla, però,
// il browser lo ridà solo con un clic: riaprendo Ciak serve «Riapri la
// cartella», e lo si dice invece di mostrare una videoteca vuota.
//
// Gli altri browser (Firefox, Brave, Opera…) non hanno le maniglie: lì la
// cartella si sceglie con un <input webkitdirectory>, che dà i file per
// questa visita soltanto (modo «scelta»). Ciak ricorda che c'era, e a ogni
// riapertura chiede di sceglierla di nuovo con lo stesso pulsante.

// ── Logica pura: dai percorsi ai video della videoteca ─────────────────────

export interface VoceCartella {
  // Dalla cartella collegata in giù, nome del file compreso.
  percorso: string[]
  dimensione: number
  modificato?: number
}

const ESTENSIONE_VIDEO = /\.(mp4|m4v|mkv|webm|mov|avi|wmv|ts)$/i

const uguale = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0

// La cartella scelta fa da «Ciak»: la prima sottocartella è la scheda (FILM,
// SERIE TV…), poi la cartella del film o della stagione, e sopra la stagione
// la serie. Chi sceglie la cartella che contiene «Ciak» (E:\) la ritrova lo
// stesso: si scende in «Ciak» da soli.
export function videoDaPercorsi(voci: VoceCartella[]): DriveVideo[] {
  const conCiak = voci.length > 0 && voci.every((v) => v.percorso.length > 1 && uguale(v.percorso[0], CARTELLA_CIAK))
  return voci
    .filter((v) => ESTENSIONE_VIDEO.test(v.percorso[v.percorso.length - 1]))
    .map((v) => {
      const percorso = conCiak ? v.percorso.slice(1) : v.percorso
      const nome = percorso[percorso.length - 1]
      const cartelle = percorso.slice(0, -1)
      const categoria = cartelle[0] ?? null
      const dentro = cartelle.slice(1)
      const cartella = dentro.length > 0 ? dentro[dentro.length - 1] : null
      const sopra = dentro.length > 1 ? dentro[dentro.length - 2] : null
      const estensione = /\.([a-z0-9]+)$/i.exec(nome)?.[1]?.toLowerCase() ?? 'mp4'
      return {
        id: idLocale({ name: nome, size: v.dimensione }),
        name: nome,
        size: v.dimensione,
        mimeType: `video/${estensione}`,
        cartella,
        serie: cartella && stagioneDaCartella(cartella) !== null ? sopra : null,
        categoria,
        aggiunto: v.modificato ? new Date(v.modificato).toISOString() : null,
        cartellaId: null,
      }
    })
}

// ── Il collegamento, salvato sul dispositivo ───────────────────────────────

// Le parti di File System Access che TypeScript non conosce ancora.
interface Permessi {
  queryPermission(o: { mode: 'read' }): Promise<PermissionState>
  requestPermission(o: { mode: 'read' }): Promise<PermissionState>
}
type Cartella = FileSystemDirectoryHandle & Permessi & { values(): AsyncIterable<FileSystemHandle> }
type ConSceltaCartella = Window & { showDirectoryPicker?: (o?: { id?: string; mode?: 'read' }) => Promise<Cartella> }

interface Salvato {
  cartella: Cartella
  // id del file → dove sta: il lettore lo apre senza rileggere tutta la cartella.
  indice: [string, string[]][]
}

const NOME_DB = 'ciak-cartella'
const CHIAVE = 'ciak:cartella'
const CHIAVE_MODO = 'ciak:cartella-modo'
export const EVENTO_CARTELLA = 'ciak:cartella'

export class ErroreCartella extends Error {
  constructor(
    messaggio: string,
    // Il browser chiede di nuovo il permesso: serve un clic, non un errore.
    readonly permesso = false,
  ) {
    super(messaggio)
  }
}

export function cartellaDisponibile(): boolean {
  return typeof window !== 'undefined' && typeof (window as ConSceltaCartella).showDirectoryPicker === 'function'
}

// Il nome della cartella collegata, per sapere subito (senza IndexedDB) se
// c'è una videoteca da leggere.
export function cartellaCollegata(): string | null {
  try {
    return localStorage.getItem(CHIAVE)
  } catch {
    return null
  }
}

// La cartella si sceglie a ogni visita (niente maniglie in questo browser).
export function cartellaScelta(): boolean {
  try {
    return localStorage.getItem(CHIAVE_MODO) === 'scelta'
  } catch {
    return false
  }
}

function ricorda(nome: string, modo: 'maniglia' | 'scelta') {
  try {
    localStorage.setItem(CHIAVE, nome)
    localStorage.setItem(CHIAVE_MODO, modo)
  } catch {
    throw new ErroreCartella('Il browser non lascia salvare il collegamento (spazio pieno o navigazione privata).')
  }
}

function avvisa() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_CARTELLA))
}

function db(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(NOME_DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('radice')
    r.onsuccess = () => ok(r.result)
    r.onerror = () => ko(r.error)
  })
}

async function operazione<T>(modo: IDBTransactionMode, fai: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  try {
    return await new Promise<T>((ok, ko) => {
      const r = fai(d.transaction('radice', modo).objectStore('radice'))
      r.onsuccess = () => ok(r.result)
      r.onerror = () => ko(r.error)
    })
  } finally {
    d.close()
  }
}

let salvato: Salvato | null = null

async function leggiSalvato(): Promise<Salvato | null> {
  if (salvato) return salvato
  if (!cartellaCollegata()) return null
  salvato = ((await operazione('readonly', (s) => s.get('radice'))) as Salvato | undefined) ?? null
  return salvato
}

async function scriviSalvato(s: Salvato): Promise<void> {
  salvato = s
  await operazione('readwrite', (st) => st.put(s, 'radice'))
}

// Si sceglie la cartella (va chiamata da un clic). La si legge subito, così
// un errore si vede ora e non alla prima visione.
export async function collegaCartella(): Promise<string> {
  const scegli = (window as ConSceltaCartella).showDirectoryPicker
  if (!scegli) throw new ErroreCartella('Questo browser non sa collegare una cartella: usa Chrome o Edge sul computer.')
  const cartella = await scegli({ id: 'ciak', mode: 'read' })
  await scriviSalvato({ cartella, indice: [] })
  ricorda(cartella.name, 'maniglia')
  scelta = null
  avvisa()
  return cartella.name
}

// I file della cartella scelta con <input webkitdirectory>, per questa visita.
let scelta: { video: DriveVideo[]; file: Map<string, { file: File; vicini: File[] }> } | null = null

// Il percorso di un file dalla cartella scelta in giù: il browser lo scrive a
// partire dal nome della cartella stessa («Ciak/SERIE TV/…»).
function percorsoScelto(f: File): string[] {
  return (f.webkitRelativePath || f.name).split('/').slice(1)
}

// La cartella scelta dal pulsante, nei browser senza maniglie. Si legge solo
// dove sta ogni file: i video restano sul disco finché non si guardano.
export function usaFileCartella(tutti: File[]): string {
  const nome = (tutti[0]?.webkitRelativePath || '').split('/')[0] || 'Cartella'
  const video = tutti.filter((f) => ESTENSIONE_VIDEO.test(f.name))
  const elenco = videoDaPercorsi(video.map((f) => ({ percorso: percorsoScelto(f), dimensione: f.size, modificato: f.lastModified })))
  const perCartella = new Map<string, File[]>()
  for (const f of tutti) {
    const dir = percorsoScelto(f).slice(0, -1).join('/')
    perCartella.set(dir, [...(perCartella.get(dir) ?? []), f])
  }
  const file = new Map(
    // Lo stesso ordine di `videoDaPercorsi`, che tiene solo i video.
    video.map((f, i) => [elenco[i].id, { file: f, vicini: perCartella.get(percorsoScelto(f).slice(0, -1).join('/')) ?? [] }]),
  )
  scelta = { video: elenco, file }
  salvato = null
  ricorda(nome, 'scelta')
  avvisa()
  return nome
}

export async function scollegaCartella(): Promise<void> {
  salvato = null
  scelta = null
  try {
    localStorage.removeItem(CHIAVE)
    localStorage.removeItem(CHIAVE_MODO)
  } catch {
    /* storage negato: non c'era niente da togliere */
  }
  avvisa()
  await operazione('readwrite', (s) => s.delete('radice'))
}

// Il permesso di leggere la cartella: `chiedi` solo da un clic, che è l'unico
// momento in cui il browser lascia chiederlo.
export async function permessoCartella(chiedi: boolean): Promise<boolean> {
  // Senza maniglie non c'è permesso da chiedere: o la si è scelta in questa
  // visita, o va scelta di nuovo (lo fa il pulsante, vedi ScegliCartella).
  if (cartellaScelta()) return scelta !== null
  const s = await leggiSalvato()
  if (!s) return false
  if ((await s.cartella.queryPermission({ mode: 'read' })) === 'granted') return true
  return chiedi && (await s.cartella.requestPermission({ mode: 'read' })) === 'granted'
}

function daRiscegliere(): ErroreCartella {
  return new ErroreCartella(`Scegli di nuovo la cartella «${cartellaCollegata()}»: questo browser la lascia leggere solo per una visita.`, true)
}

async function pronta(): Promise<Salvato> {
  const s = await leggiSalvato()
  if (!s) throw new ErroreCartella('Nessuna cartella collegata.')
  if (!(await permessoCartella(false))) {
    throw new ErroreCartella(`Il browser chiede di nuovo il permesso di leggere la cartella «${s.cartella.name}».`, true)
  }
  return s
}

async function* visita(cartella: Cartella, percorso: string[]): AsyncGenerator<{ percorso: string[]; file: FileSystemFileHandle }> {
  for await (const voce of cartella.values()) {
    // Le cartelle di sistema e i file nascosti (Thumbs.db, $RECYCLE.BIN…).
    if (voce.name.startsWith('.') || voce.name.startsWith('$')) continue
    if (voce.kind === 'directory') yield* visita(voce as Cartella, [...percorso, voce.name])
    else yield { percorso: [...percorso, voce.name], file: voce as FileSystemFileHandle }
  }
}

// Tutti i video della cartella, come quelli di Drive. Si ricorda dove sta
// ciascuno, per il lettore.
export async function elencaVideoCartella(): Promise<DriveVideo[]> {
  if (cartellaScelta()) {
    if (!scelta) throw daRiscegliere()
    return scelta.video
  }
  const s = await pronta()
  const voci: VoceCartella[] = []
  for await (const { percorso, file } of visita(s.cartella, [])) {
    if (!ESTENSIONE_VIDEO.test(file.name)) continue
    const f = await file.getFile()
    voci.push({ percorso, dimensione: f.size, modificato: f.lastModified })
  }
  const video = videoDaPercorsi(voci)
  // Lo stesso ordine di `videoDaPercorsi`, che tiene solo i video.
  const indice = voci.map((v, i) => [video[i].id, v.percorso] as [string, string[]])
  await scriviSalvato({ cartella: s.cartella, indice })
  return video
}

async function sottotitoliAccanto(cartella: Cartella, nomeVideo: string): Promise<SottotitoloOffline[]> {
  const vicini: File[] = []
  for await (const voce of cartella.values()) {
    if (voce.kind !== 'file') continue
    if (/\.(srt|vtt)$/i.test(voce.name)) vicini.push(await (voce as FileSystemFileHandle).getFile())
    // Anche gli altri video contano (solo il nome): con un video solo nella
    // cartella, ogni .srt è suo.
    else if (ESTENSIONE_VIDEO.test(voce.name)) vicini.push(new File([], voce.name))
  }
  return sottotitoliFra(nomeVideo, vicini)
}

// I sottotitoli di un video fra i file della sua cartella, già in WebVTT.
async function sottotitoliFra(nomeVideo: string, vicini: File[]): Promise<SottotitoloOffline[]> {
  const perNome = new Map(vicini.map((f) => [f.name, f]))
  const elenco = vicini.map((f) => ({ id: f.name, name: f.name, mimeType: f.type }))
  return Promise.all(
    sottotitoliPerVideo(nomeVideo, elenco).map(async (s, i) => {
      const file = perNome.get(s.name)!
      return {
        chiave: s.lingua ?? `cartella-${i}`,
        lingua: s.lingua,
        etichetta: `${s.lingua ? nomeLingua(s.lingua) : 'Sottotitoli'} · dalla cartella`,
        vtt: srtAVtt(decodificaTesto(await file.arrayBuffer())),
      }
    }),
  )
}

async function apriDaPercorso(s: Salvato, id: string, percorso: string[]): Promise<FilmAperto | null> {
  try {
    let cartella = s.cartella
    for (const nome of percorso.slice(0, -1)) cartella = (await cartella.getDirectoryHandle(nome)) as Cartella
    const file = await (await cartella.getFileHandle(percorso[percorso.length - 1])).getFile()
    // Lo stesso nome con un'altra dimensione è un altro file (sostituito).
    if (idLocale(file) !== id) return null
    return registraFilmAperto({ id, file, sottotitoli: await sottotitoliAccanto(cartella, file.name) })
  } catch (e) {
    // Spostato o cancellato dal PC: si rilegge la cartella.
    if (e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')) return null
    throw e
  }
}

// Il file di un video della cartella, per il lettore: dall'indice, e se non
// c'è più dove stava, rileggendo la cartella. null se non c'è (o non c'è una
// cartella collegata).
export async function fileDallaCartella(id: string): Promise<FilmAperto | null> {
  if (!cartellaCollegata()) return null
  if (cartellaScelta()) {
    if (!scelta) throw daRiscegliere()
    const trovato = scelta.file.get(id)
    return trovato ? registraFilmAperto({ id, file: trovato.file, sottotitoli: await sottotitoliFra(trovato.file.name, trovato.vicini) }) : null
  }
  let s = await pronta()
  const dove = new Map(s.indice).get(id)
  if (dove) {
    const trovato = await apriDaPercorso(s, id, dove)
    if (trovato) return trovato
  }
  await elencaVideoCartella()
  s = await pronta()
  const nuovo = new Map(s.indice).get(id)
  return nuovo ? apriDaPercorso(s, id, nuovo) : null
}
