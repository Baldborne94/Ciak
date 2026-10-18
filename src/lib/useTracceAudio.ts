import { useEffect, useState } from 'react'
import { logFailure } from './logFailure'
import { decodificaTesto } from './sottotitoli'
import { leggiElencoAudio, nomeElencoAudio, type TracciaAudio } from './tracceAudio'

// Le lingue dell'audio di un video, dall'elenco che prepara-ciak gli lascia
// accanto («Film.audio.json» e i suoi «Film.audio-2.m4a»). Vuoto finché non
// arriva, e per un video senza elenco (una lingua sola, o preparato prima che
// lo script le aggiungesse): allora il menu Audio non c'è e il film suona come
// sempre. `url` dà il file di una lingua per l'<audio> del lettore.
//
// Basta il nome del video e i file accanto: anche la copia salvata in Ciak li
// ha (vedi viciniSalvati), senza il file vero.
export type VideoConVicini = { file: Pick<File, 'name'>; vicini: File[] }

export function useTracceAudio(film: VideoConVicini | undefined): { tracce: TracciaAudio[]; url: (fileId: string) => string | null } {
  const [tracce, setTracce] = useState<TracciaAudio[]>([])
  useEffect(() => {
    setTracce([])
    if (!film) return
    const elenco = film.vicini.find((f) => f.name === nomeElencoAudio(film.file.name))
    if (!elenco) return
    let vivo = true
    elenco
      .arrayBuffer()
      .then((byte) => {
        const vicini = film.vicini.map((f) => ({ id: f.name, name: f.name, mimeType: f.type }))
        if (vivo) setTracce(leggiElencoAudio(decodificaTesto(byte), vicini))
      })
      .catch(logFailure('Lingue dell’audio del video'))
    return () => {
      vivo = false
    }
  }, [film])

  // Un indirizzo per ogni lingua accanto al video, creato in un effetto e non
  // durante il disegno: così si rilascia quando non serve più.
  const [indirizzi, setIndirizzi] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    const fatti = new Map<string, string>()
    for (const t of tracce) {
      const file = t.fileId ? film?.vicini.find((f) => f.name === t.fileId) : undefined
      if (t.fileId && file) fatti.set(t.fileId, URL.createObjectURL(file))
    }
    setIndirizzi(fatti)
    return () => fatti.forEach((u) => URL.revokeObjectURL(u))
  }, [film, tracce])
  return { tracce, url: (fileId: string) => indirizzi.get(fileId) ?? null }
}
