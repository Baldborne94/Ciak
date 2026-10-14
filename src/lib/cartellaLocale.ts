import { CARTELLA_CIAK, type VideoFile } from './fileVideo'
import { stagioneDaCartella } from './sottotitoli'
import { cartellaDaChiudere, pianoCancellazione } from './pianoCancellazione'
import { idLocale, registraFilmAperto, type FilmAperto } from './filmLocali'

// La videoteca da una cartella del PC (E:\Ciak): la si sceglie una volta, e
// Ciak la legge come una videoteca — schede, serie, stagioni, episodio dopo,
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
export function videoDaPercorsi(voci: VoceCartella[]): VideoFile[] {
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
  queryPermission(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}
type Cartella = FileSystemDirectoryHandle & Permessi & { values(): AsyncIterable<FileSystemHandle> }
type ConSceltaCartella = Window & { showDirectoryPicker?: (o?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<Cartella> }

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
  const cartella = await scegli({ id: 'ciak', mode: 'readwrite' })
  await scriviSalvato({ cartella, indice: [] })
  ricorda(cartella.name, 'maniglia')
  scelta = null
  avvisa()
  return cartella.name
}

// I file della cartella scelta con <input webkitdirectory>, per questa visita.
let scelta: { video: VideoFile[]; file: Map<string, { file: File; vicini: File[]; percorso: string[] }> } | null = null

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
    video.map((f, i) => [elenco[i].id, { file: f, vicini: perCartella.get(percorsoScelto(f).slice(0, -1).join('/')) ?? [], percorso: percorsoScelto(f) }]),
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
  // Lettura e scrittura insieme: un permesso solo, chiesto una volta, basta
  // per guardare, salvare i sottotitoli trovati online e cancellare.
  if ((await s.cartella.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  return chiedi && (await s.cartella.requestPermission({ mode: 'readwrite' })) === 'granted'
}

function daRiscegliere(): ErroreCartella {
  return new ErroreCartella(`Scegli di nuovo la cartella «${cartellaCollegata()}»: questo browser la lascia leggere solo per una visita.`, true)
}

async function pronta(): Promise<Salvato> {
  const s = await leggiSalvato()
  if (!s) throw new ErroreCartella('Nessuna cartella collegata.')
  if (!(await permessoCartella(false))) {
    throw new ErroreCartella(`Il browser chiede di nuovo il permesso di usare la cartella «${s.cartella.name}».`, true)
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

// Tutti i video della cartella. Si ricorda dove sta
// ciascuno, per il lettore.
export async function elencaVideoCartella(): Promise<VideoFile[]> {
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

// I file di una cartella, accanto al video: sottotitoli, lingue dell'audio e
// gli altri video (contano anche quelli: con un video solo nella cartella,
// ogni .srt è suo). `getFile` legge solo nome e dimensione.
async function fileDi(cartella: Cartella): Promise<File[]> {
  const file: File[] = []
  for await (const voce of cartella.values()) if (voce.kind === 'file') file.push(await (voce as FileSystemFileHandle).getFile())
  return file
}

async function cartellaA(radice: Cartella, dir: string[]): Promise<Cartella> {
  let cartella = radice
  for (const nome of dir) cartella = (await cartella.getDirectoryHandle(nome)) as Cartella
  return cartella
}

// Scheda, cartella e serie del video, come nella videoteca: per il titolo e
// per cercare i sottotitoli online.
function dove(percorso: string[], dimensione: number): Pick<FilmAperto, 'cartella' | 'serie'> {
  const [v] = videoDaPercorsi([{ percorso, dimensione }])
  return { cartella: v?.cartella ?? null, serie: v?.serie ?? null }
}

async function apriDaPercorso(s: Salvato, id: string, percorso: string[]): Promise<FilmAperto | null> {
  try {
    const cartella = await cartellaA(s.cartella, percorso.slice(0, -1))
    const file = await (await cartella.getFileHandle(percorso[percorso.length - 1])).getFile()
    // Lo stesso nome con un'altra dimensione è un altro file (sostituito).
    if (idLocale(file) !== id) return null
    return registraFilmAperto({
      id,
      file,
      vicini: await fileDi(cartella),
      origine: 'cartella',
      ...dove(percorso, file.size),
      // Un sottotitolo trovato online si salva accanto al video, come quelli
      // che c'erano: la volta dopo è già lì, anche per gli altri programmi.
      scrivi: {
        salva: async (nome, testo) => {
          const scrittura = await (await cartella.getFileHandle(nome, { create: true })).createWritable()
          await scrittura.write(testo)
          await scrittura.close()
        },
        togli: (nome) => cartella.removeEntry(nome),
      },
    })
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
    if (!trovato) return null
    // Senza maniglie il browser non lascia scrivere: i sottotitoli trovati
    // online restano in Ciak.
    const { file, vicini, percorso } = trovato
    return registraFilmAperto({ id, file, vicini, origine: 'cartella', ...dove(percorso, file.size), scrivi: null })
  }
  let s = await pronta()
  const posto = new Map(s.indice).get(id)
  if (posto) {
    const trovato = await apriDaPercorso(s, id, posto)
    if (trovato) return trovato
  }
  await elencaVideoCartella()
  s = await pronta()
  const nuovo = new Map(s.indice).get(id)
  return nuovo ? apriDaPercorso(s, id, nuovo) : null
}

// ── Cancellare dal disco ───────────────────────────────────────────────────

// Si cancella solo con la maniglia (Chrome, Edge): il selettore degli altri
// browser lascia leggere i file, non toccarli.
export function cancellabileDalDisco(): boolean {
  return cartellaCollegata() !== null && !cartellaScelta()
}

// Al posto del nome della cartella collegata, nel piano: nessuna cartella vera
// si chiama così.
const RADICE = '\u0000radice'

// Cancella dal disco i video, coi loro sottotitoli e le loro lingue
// dell'audio, e le cartelle rimaste vuote (mai la cartella collegata né le
// schede: vedi pianoCancellazione). Non passa dal Cestino di Windows: chi
// chiama lo deve dire prima. Va chiamata da un clic, perché chiede il permesso
// di modificare la cartella. Torna quanti video ha cancellato.
export async function cancellaDalDisco(ids: string[]): Promise<number> {
  if (!cancellabileDalDisco()) {
    throw new ErroreCartella('Questo browser lascia solo leggere i file: per cancellarli apri Ciak con Chrome o Edge, oppure usa Esplora file.')
  }
  const s = await leggiSalvato()
  if (!s) throw new ErroreCartella('Nessuna cartella collegata.')
  if (!(await permessoCartella(true))) throw new ErroreCartella('Senza il permesso di modificare la cartella non si può cancellare niente.')
  const indice = new Map(s.indice)
  // Scelta la cartella sopra «Ciak», le schede stanno un livello più giù.
  const base = s.indice.length > 0 && s.indice.every(([, p]) => p.length > 1 && uguale(p[0], CARTELLA_CIAK)) ? 1 : 0
  const gruppi = new Map<string, { dir: string[]; nomi: string[]; ids: string[] }>()
  for (const id of ids) {
    const percorso = indice.get(id)
    if (!percorso) continue
    const dir = percorso.slice(0, -1)
    const chiave = dir.join('/')
    const g = gruppi.get(chiave) ?? { dir, nomi: [], ids: [] }
    g.nomi.push(percorso[percorso.length - 1])
    g.ids.push(id)
    gruppi.set(chiave, g)
  }
  let cancellati = 0
  for (const { dir, nomi, ids: suoi } of gruppi.values()) {
    const rel = dir.slice(base)
    const cartella = await cartellaA(s.cartella, dir)
    const vicini: { id: string; name: string; mimeType: string }[] = []
    let sottocartelle = 0
    for await (const voce of cartella.values()) {
      if (voce.kind === 'file') vicini.push({ id: voce.name, name: voce.name, mimeType: '' })
      else sottocartelle++
    }
    const piano = pianoCancellazione({
      video: nomi.map((n) => ({ id: n, name: n })),
      cartella: rel.length > 0 ? { id: dir.join('/'), name: rel[rel.length - 1] } : null,
      vicini,
      sottocartelle,
      nomeCartellaSopra: rel.length >= 2 ? rel[rel.length - 2] : rel.length === 1 ? RADICE : null,
      radice: RADICE,
    })
    if (piano.cartella) {
      const sopra = await cartellaA(s.cartella, dir.slice(0, -1))
      await sopra.removeEntry(dir[dir.length - 1], { recursive: true })
      // La serie sopra la stagione, rimasta vuota, va anche lei.
      const relSopra = rel.slice(0, -1)
      if (relSopra.length > 0) {
        let file = 0
        let cartelle = 0
        for await (const voce of sopra.values()) {
          if (voce.kind === 'file') file++
          else cartelle++
        }
        if (cartellaDaChiudere({ nome: relSopra[relSopra.length - 1], nomeSopra: relSopra.length >= 2 ? relSopra[relSopra.length - 2] : RADICE, file, sottocartelle: cartelle, radice: RADICE })) {
          await (await cartellaA(s.cartella, dir.slice(0, -2))).removeEntry(dir[dir.length - 2], { recursive: true })
        }
      }
    } else {
      for (const nome of piano.file) await cartella.removeEntry(nome)
    }
    for (const id of suoi) indice.delete(id)
    cancellati += suoi.length
  }
  await scriviSalvato({ cartella: s.cartella, indice: [...indice] })
  return cancellati
}
