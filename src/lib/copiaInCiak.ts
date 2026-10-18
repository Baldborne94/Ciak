import type { FilmAperto } from './filmLocali'
import { salvaFileSulDispositivo, type SottotitoloOffline } from './filmOffline'
import { decodificaTesto, nomeLingua, sottotitoliPerVideo, srtAVtt } from './sottotitoli'
import { fileAudioDelVideo } from './tracceAudio'

// Copiare in Ciak un video della cartella senza aprirlo nel lettore (una
// serie intera, gli episodi nuovi): ciò che il lettore troverebbe accanto al
// video lo si prende qui, dai file della sua cartella.

const comeFileCartella = (f: File) => ({ id: f.name, name: f.name, mimeType: f.type })

// I sottotitoli accanto al video, già in WebVTT come li vuole la copia in Ciak:
// uno per lingua, l'italiano prima (vedi sottotitoliPerVideo).
export async function sottotitoliDaVicini(nomeVideo: string, vicini: File[]): Promise<SottotitoloOffline[]> {
  const perNome = new Map(vicini.map((f) => [f.name, f]))
  const fatti: SottotitoloOffline[] = []
  for (const s of sottotitoliPerVideo(nomeVideo, vicini.map(comeFileCartella))) {
    const chiave = s.lingua ?? 'altro'
    const file = perNome.get(s.name)
    if (!file || fatti.some((f) => f.chiave === chiave)) continue
    const testo = decodificaTesto(await file.arrayBuffer())
    fatti.push({
      chiave,
      lingua: s.lingua,
      etichetta: `${nomeLingua(s.lingua)} · dalla cartella`,
      vtt: /\.vtt$/i.test(s.name) ? testo : srtAVtt(testo),
    })
  }
  return fatti
}

// Le lingue dell'audio accanto al video (l'elenco e i .m4a di prepara-ciak).
export function audioDaVicini(nomeVideo: string, vicini: File[]): File[] {
  const suoi = new Set(fileAudioDelVideo(nomeVideo, vicini.map(comeFileCartella)).map((f) => f.name))
  return vicini.filter((f) => suoi.has(f.name))
}

export async function copiaFilmInCiak(film: FilmAperto, titolo: string, serie: string | null): Promise<void> {
  const nome = film.file.name
  await salvaFileSulDispositivo(
    { id: film.id, titolo, file: nome, serie },
    film.file,
    await sottotitoliDaVicini(nome, film.vicini),
    audioDaVicini(nome, film.vicini),
  )
}
