import type { VideoFile } from './fileVideo'

// I film aperti dal dispositivo: un file scelto dal disco del PC (F:) o dalla
// memoria del tablet, riprodotto dal lettore di Ciak senza caricarlo da
// nessuna parte. Il browser lo legge dal disco man mano che serve.
//
// L'id viene dal nome e dalla dimensione del file, sempre uguale: riaprendo lo
// stesso film un'altra sera, Ciak ritrova il titolo riconosciuto, il punto in
// cui ci si era fermati e il diario (tutto legato all'id del file, come per
// la cartella collegata).
const PREFISSO_LOCALE = 'loc-'

export function eLocale(fileId: string): boolean {
  return fileId.startsWith(PREFISSO_LOCALE)
}

// FNV-1a a 64 bit, in esadecimale: corto, stabile, senza librerie.
function impronta(testo: string): string {
  let h = 0xcbf29ce484222325n
  for (const c of new TextEncoder().encode(testo)) {
    h ^= BigInt(c)
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return h.toString(16).padStart(16, '0')
}

export function idLocale(file: { name: string; size: number }): string {
  return `${PREFISSO_LOCALE}${impronta(`${file.name}|${file.size}`)}`
}

const ESTENSIONE_VIDEO = /\.(mp4|m4v|mkv|webm|mov|avi|wmv|ts)$/i

export interface FilmAperto {
  id: string
  file: File
  // I file accanto al video, da cui il lettore prende sottotitoli e lingue
  // dell'audio: quelli della sua cartella, o gli altri scelti insieme a lui.
  vicini: File[]
  origine: 'cartella' | 'scelto'
  // Le cartelle del film o della stagione, per il titolo e la ricerca dei
  // sottotitoli online; null per un file scelto a mano.
  cartella: string | null
  serie: string | null
  // Scrive o toglie un file accanto al video (un sottotitolo trovato online).
  // null dove il browser non lascia scrivere: allora resta in Ciak.
  scrivi: { salva: (nome: string, testo: string) => Promise<void>; togli: (nome: string) => Promise<void> } | null
}

// I file aperti in questa visita: il browser li legge solo finché la pagina
// resta aperta, e per sicurezza non lascia ritrovarli da soli dopo.
const aperti = new Map<string, FilmAperto>()

export function filmAperto(id: string): FilmAperto | undefined {
  return aperti.get(id)
}

// Un film trovato nella cartella collegata (vedi cartellaLocale), a portata
// del lettore come quelli scelti a mano.
export function registraFilmAperto(film: FilmAperto): FilmAperto {
  aperti.set(film.id, film)
  return film
}

// Dai file scelti (un video, ed eventualmente i suoi .srt o le sue lingue
// dell'audio) il film da aprire. Si legge solo il nome: il resto quando serve.
export function apriFile(scelti: File[]): FilmAperto {
  const video = scelti.find((f) => f.type.startsWith('video/') || ESTENSIONE_VIDEO.test(f.name))
  if (!video) throw new Error('Scegli un file video (MP4, MKV, WebM…).')
  return registraFilmAperto({ id: idLocale(video), file: video, vicini: scelti, origine: 'scelto', cartella: null, serie: null, scrivi: null })
}

// Il file come video della videoteca, per riconoscerne il titolo come quelli
// della cartella (nome del file, nessuna cartella).
export function comeVideo(film: FilmAperto): VideoFile {
  return { id: film.id, name: film.file.name, size: film.file.size, mimeType: film.file.type || 'video/mp4', cartella: null }
}

// Il browser legge MP4 e WebM; un MKV o un AVI spesso no.
export function formatoLeggibile(nome: string): boolean {
  return /\.(mp4|m4v|webm|mov)$/i.test(nome)
}
