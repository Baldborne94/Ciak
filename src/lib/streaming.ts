import { supabase } from './supabase'
import type { MediaItem, TmdbType } from './types'
import type { NomeFilm } from './sottotitoli'

// Il legame fra un file su Drive e l'archivio: quale titolo è, dove ci si è
// fermati, quando lo si è finito. È ciò che permette al lettore di segnare un
// film come visto, spuntare un episodio e riprendere dal punto giusto.

export interface VoceStreaming {
  drive_file_id: string
  nome_file: string | null
  tmdb_id: number | null
  media_type: TmdbType | null
  titolo: string | null
  poster_path: string | null
  stagione: number | null
  episodio: number | null
  abbinato_a_mano: boolean
  posizione: number
  durata: number | null
  secondi_visti: number
  visto_il: string | null
  updated_at?: string
}

const TABELLA = 'user_streaming'

function client() {
  if (!supabase) throw new Error('Supabase non è configurato.')
  return supabase
}

// ── Riconoscimento: quale titolo di TMDB è questo file ──────────────────────

// Per confrontare i titoli: minuscolo, senza accenti né punteggiatura.
// «Shōgun» e «Shogun», «Song of the Sea» e «Song.of.the.Sea» sono lo stesso.
export function normalizzaTitolo(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function annoDi(item: MediaItem): number | null {
  const a = item.releaseDate ? Number(item.releaseDate.slice(0, 4)) : NaN
  return Number.isFinite(a) ? a : null
}

// Il risultato di TMDB che corrisponde al file, o null se nessuno convince
// abbastanza (meglio chiedere che sbagliare: un film sbagliato finirebbe nel
// diario). Un episodio vuole una serie; l'anno, se c'è, deve combaciare.
export function scegliAbbinamento(nome: NomeFilm, risultati: MediaItem[]): MediaItem | null {
  const cercato = normalizzaTitolo(nome.titolo)
  if (!cercato) return null
  const episodio = nome.stagione !== undefined && nome.episodio !== undefined
  let migliore: { item: MediaItem; punti: number } | null = null
  risultati.forEach((item, posizione) => {
    if (episodio && item.mediaType !== 'tv') return
    const titoli = [item.title, item.originalTitle].filter((t): t is string => !!t).map(normalizzaTitolo)
    let punti = 0
    if (titoli.includes(cercato)) punti += 10
    else if (titoli.some((t) => t.startsWith(cercato + ' ') || cercato.startsWith(t + ' '))) punti += 4
    else return
    const anno = annoDi(item)
    if (nome.anno !== undefined && anno !== null) {
      if (anno === nome.anno) punti += 5
      // Un anno di scarto succede (uscita in festival, date locali); di più no,
      // se non per le serie, dove l'anno del file è spesso quello dell'episodio.
      else if (Math.abs(anno - nome.anno) === 1) punti += 2
      else if (item.mediaType === 'movie') return
    }
    // Senza stagione ed episodio, a parità, un film batte una serie.
    if (!episodio && item.mediaType === 'movie') punti += 1
    // A parità di tutto vince il primo, che per TMDB è il più popolare.
    punti -= posizione * 0.01
    if (!migliore || punti > migliore.punti) migliore = { item, punti }
  })
  const scelto = migliore as { item: MediaItem; punti: number } | null
  // Serve il titolo esatto (10 punti, meno lo scarto di posizione): un titolo
  // che ne contiene un altro, anche con l'anno giusto, non basta.
  return scelto && scelto.punti >= 9.5 ? scelto.item : null
}

// ── Quando un film conta come «visto» ───────────────────────────────────────

// Oltre il 90%, o negli ultimi tre minuti: i titoli di coda non si guardano.
export const SOGLIA_FINE = 0.9
const CODA_SECONDI = 180
// Almeno metà film guardata davvero: saltare alla fine per provare il lettore
// non deve riempire il diario.
export const QUOTA_GUARDATA = 0.5

export function arrivatoAllaFine(posizione: number, durata: number | null): boolean {
  if (!durata || durata <= 0) return false
  return posizione >= durata * SOGLIA_FINE || durata - posizione <= CODA_SECONDI
}

export function contaComeVisto(posizione: number, durata: number | null, secondiVisti: number): boolean {
  return arrivatoAllaFine(posizione, durata) && !!durata && secondiVisti >= durata * QUOTA_GUARDATA
}

// Dopo cinque minuti un film «da vedere» passa «in corso»: compare in «Riprendi
// a guardare», che è il posto giusto per un film lasciato a metà.
export const SECONDI_PER_IN_CORSO = 300

// ── Riprendere da dove ci si era fermati ────────────────────────────────────

// Da dove ripartire: niente se si era appena all'inizio o già alla fine (lì si
// ricomincia), altrimenti qualche secondo prima, per ritrovare il filo.
export function puntoDiRipresa(posizione: number, durata: number | null): number {
  if (posizione < 30) return 0
  if (arrivatoAllaFine(posizione, durata)) return 0
  return Math.max(0, posizione - 5)
}

export function formattaTempo(secondi: number): string {
  const s = Math.max(0, Math.floor(secondi))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

// L'episodio che viene dopo, fra i file della stessa serie: il successivo della
// stessa stagione, altrimenti il primo della stagione dopo.
export function prossimoEpisodio(voce: VoceStreaming, tutte: VoceStreaming[]): VoceStreaming | null {
  if (voce.media_type !== 'tv' || voce.stagione == null || voce.episodio == null) return null
  const stessaSerie = tutte.filter(
    (v) => v.media_type === 'tv' && v.tmdb_id === voce.tmdb_id && v.stagione != null && v.episodio != null,
  )
  const dopo = stessaSerie
    .filter(
      (v) =>
        (v.stagione as number) > (voce.stagione as number) ||
        ((v.stagione as number) === voce.stagione && (v.episodio as number) > (voce.episodio as number)),
    )
    .sort((a, b) => (a.stagione as number) - (b.stagione as number) || (a.episodio as number) - (b.episodio as number))
  return dopo[0] ?? null
}

// Come si chiama il file nella lista: il titolo di TMDB, e per un episodio
// anche stagione ed episodio.
export function titoloDaMostrare(voce: Pick<VoceStreaming, 'titolo' | 'media_type' | 'stagione' | 'episodio'>): string | null {
  if (!voce.titolo) return null
  if (voce.media_type === 'tv' && voce.stagione != null && voce.episodio != null) {
    return `${voce.titolo} · S${voce.stagione}E${voce.episodio}`
  }
  return voce.titolo
}

// ── Lettura e scrittura ─────────────────────────────────────────────────────

export async function elencaStreaming(userId: string): Promise<VoceStreaming[]> {
  const { data, error } = await client().from(TABELLA).select('*').eq('user_id', userId)
  if (error) throw new Error(error.message)
  return (data ?? []) as VoceStreaming[]
}

export async function voceStreaming(userId: string, fileId: string): Promise<VoceStreaming | null> {
  const { data, error } = await client()
    .from(TABELLA)
    .select('*')
    .eq('user_id', userId)
    .eq('drive_file_id', fileId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as VoceStreaming | null) ?? null
}

// Aggiorna solo i campi passati: l'upsert di PostgREST tocca le colonne che
// riceve, così salvare la posizione non cancella l'abbinamento, e viceversa.
export async function salvaStreaming(
  userId: string,
  fileId: string,
  campi: Partial<Omit<VoceStreaming, 'drive_file_id'>>,
): Promise<void> {
  const { error } = await client()
    .from(TABELLA)
    .upsert(
      { user_id: userId, drive_file_id: fileId, ...campi, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,drive_file_id' },
    )
  if (error) throw new Error(error.message)
}

export function abbinamentoDa(item: MediaItem, nome: NomeFilm): Partial<VoceStreaming> {
  const episodio = item.mediaType === 'tv' && nome.stagione !== undefined && nome.episodio !== undefined
  return {
    tmdb_id: item.id,
    media_type: item.mediaType,
    titolo: item.title,
    poster_path: item.posterPath,
    stagione: episodio ? (nome.stagione as number) : null,
    episodio: episodio ? (nome.episodio as number) : null,
  }
}

// ── Una copia della posizione sul dispositivo ───────────────────────────────
// Offline (film scaricato, in treno) Supabase non risponde: la posizione resta
// qui e si confronta con quella del server alla prossima apertura, vince la più
// recente. È una comodità del singolo dispositivo: localStorage basta.
const CHIAVE_LOCALE = 'ciak:posizione:'

export function leggiPosizioneLocale(fileId: string): { posizione: number; quando: number } | null {
  try {
    const raw = localStorage.getItem(CHIAVE_LOCALE + fileId)
    if (!raw) return null
    const v = JSON.parse(raw) as { posizione?: unknown; quando?: unknown }
    return typeof v.posizione === 'number' && typeof v.quando === 'number'
      ? { posizione: v.posizione, quando: v.quando }
      : null
  } catch {
    return null
  }
}

export function scriviPosizioneLocale(fileId: string, posizione: number): void {
  try {
    localStorage.setItem(CHIAVE_LOCALE + fileId, JSON.stringify({ posizione, quando: Date.now() }))
  } catch {
    /* storage pieno o negato: resta la copia sul server */
  }
}

// La posizione più recente fra server e dispositivo.
export function posizionePiuRecente(
  server: { posizione: number; updated_at?: string } | null,
  locale: { posizione: number; quando: number } | null,
): number {
  const quandoServer = server?.updated_at ? Date.parse(server.updated_at) : 0
  if (locale && (!server || locale.quando > quandoServer)) return locale.posizione
  return server?.posizione ?? 0
}
