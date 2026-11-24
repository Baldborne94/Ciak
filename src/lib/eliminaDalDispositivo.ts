import { eliminaFilm, type FilmOffline } from './filmOffline'
import { lasciaSerieInCiak, leggiSerieInCiak } from './serieInCiak'
import { logFailure } from './logFailure'

// Toglie da «Sul dispositivo» le copie salvate in Ciak di un film o di una
// serie: i file sul NAS o nella cartella restano. Prima si poteva solo
// episodio per episodio, dal lettore: per i 21 episodi di South Park, 21 volte.
//
// Una serie tolta per intero smette anche di essere tenuta in Ciak: se no,
// alla prossima lettura della cartella gli episodi si ricopierebbero da soli.
export async function eliminaDalDispositivo(
  copie: FilmOffline[],
  { serieIntera }: { serieIntera: boolean },
): Promise<{ tolti: number; falliti: number }> {
  let falliti = 0
  let ultimo: unknown = null
  for (const f of copie) {
    try {
      await eliminaFilm(f.id)
    } catch (e) {
      // Un intoppo è di quella copia: le altre vanno via lo stesso.
      falliti++
      ultimo = e
    }
  }
  if (falliti > 0) logFailure(`Copie sul dispositivo: ${falliti} su ${copie.length} non tolte`)(ultimo)
  if (serieIntera) {
    const nomi = new Set(copie.map((f) => f.serie).filter((s): s is string => !!s))
    for (const [cartella, s] of Object.entries(leggiSerieInCiak())) if (nomi.has(s.titolo)) lasciaSerieInCiak(cartella)
  }
  return { tolti: copie.length - falliti, falliti }
}
