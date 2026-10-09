import { useEffect, useState } from 'react'
import { fileNellaCartella, infoFile, scaricaByte } from './googleDrive'
import { logFailure } from './logFailure'
import { decodificaTesto } from './sottotitoli'
import { leggiElencoAudio, nomeElencoAudio, type TracciaAudio } from './tracceAudio'

// Le lingue dell'audio di un video su Drive, dall'elenco che prepara-ciak gli
// lascia accanto. Vuoto finché non arriva, e per un video senza elenco (una
// lingua sola, o caricato prima che lo script le preparasse): allora il menu
// Audio non c'è e il film suona come sempre.
export function useTracceAudio(fileId: string, attivo: boolean): TracciaAudio[] {
  const [tracce, setTracce] = useState<TracciaAudio[]>([])
  useEffect(() => {
    setTracce([])
    if (!attivo) return
    let vivo = true
    ;(async () => {
      const video = await infoFile(fileId)
      const idCartella = video.parents[0]
      if (!idCartella) return
      const vicini = await fileNellaCartella(idCartella)
      const elenco = vicini.find((f) => f.name === nomeElencoAudio(video.name))
      if (!elenco) return
      const testo = decodificaTesto(await scaricaByte(elenco.id))
      if (vivo) setTracce(leggiElencoAudio(testo, vicini))
    })().catch(logFailure('Lingue dell’audio del video'))
    return () => {
      vivo = false
    }
  }, [fileId, attivo])
  return tracce
}
