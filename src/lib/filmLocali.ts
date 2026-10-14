import type { DriveVideo } from './googleDrive'
import { linguaDaNome, srtAVtt } from './sottotitoli'
import type { SottotitoloOffline } from './filmOffline'

// I film aperti dal dispositivo: un file scelto dal disco del PC (F:) o dalla
// memoria del tablet, riprodotto dal lettore di Ciak senza caricarlo da
// nessuna parte. Il browser lo legge dal disco man mano che serve.
//
// L'id viene dal nome e dalla dimensione del file, sempre uguale: riaprendo lo
// stesso film un'altra sera, Ciak ritrova il titolo riconosciuto, il punto in
// cui ci si era fermati e il diario (tutto legato all'id del file, come per
// Drive).
export const PREFISSO_LOCALE = 'loc-'

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
const ESTENSIONE_SOTTOTITOLI = /\.(srt|vtt)$/i

export interface FilmAperto {
  id: string
  file: File
  sottotitoli: SottotitoloOffline[]
}

// I file aperti in questa visita: il browser li legge solo finché la pagina
// resta aperta, e per sicurezza non lascia ritrovarli da soli dopo.
const aperti = new Map<string, FilmAperto>()

export function filmAperto(id: string): FilmAperto | undefined {
  return aperti.get(id)
}

// Dai file scelti (un video, ed eventualmente i suoi .srt) il film da aprire.
// I sottotitoli si leggono subito: sono piccoli, e così il lettore li ha già.
export async function apriFile(scelti: File[]): Promise<FilmAperto> {
  const video = scelti.find((f) => f.type.startsWith('video/') || ESTENSIONE_VIDEO.test(f.name))
  if (!video) throw new Error('Scegli un file video (MP4, MKV, WebM…).')
  const sottotitoli = await Promise.all(
    scelti
      .filter((f) => ESTENSIONE_SOTTOTITOLI.test(f.name))
      .map(async (f, i) => {
        const lingua = linguaDaNome(f.name)
        return {
          chiave: lingua ?? `altro-${i}`,
          lingua,
          etichetta: `${lingua === 'it' ? 'Italiano' : lingua === 'en' ? 'Inglese' : 'Sottotitoli'} · dal file scelto`,
          vtt: srtAVtt(await f.text()),
        }
      }),
  )
  const film = { id: idLocale(video), file: video, sottotitoli }
  aperti.set(film.id, film)
  return film
}

// Il file come video della videoteca, per riconoscerne il titolo come quelli
// di Drive (nome del file, nessuna cartella).
export function comeVideo(film: FilmAperto): DriveVideo {
  return { id: film.id, name: film.file.name, size: film.file.size, mimeType: film.file.type || 'video/mp4', cartella: null }
}

// Il browser legge MP4 e WebM; un MKV o un AVI spesso no.
export function formatoLeggibile(nome: string): boolean {
  return /\.(mp4|m4v|webm|mov)$/i.test(nome)
}
