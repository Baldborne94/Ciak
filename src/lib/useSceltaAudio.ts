import { useCallback, useMemo, useState } from 'react'
import type { InfoJellyfin } from './jellyfin'
import type { VoceStreaming } from './streaming'
import { indiceAudio, leggiLinguaAudio, salvaLinguaAudio, type TracciaAudio } from './tracceAudio'
import { useTracceAudio, type VideoConVicini } from './useTracceAudio'

// La lingua dell'audio nel lettore (vedi lib/tracceAudio): il menu c'è solo
// per i video con più lingue. Dal disco le prepara prepara-ciak accanto al
// film; dal server di casa le conosce Jellyfin, dentro e accanto al file.
//
// `primaDiCambiare` corre prima di passare a un'altra lingua: dal server di
// casa un'altra lingua è un altro flusso, e il lettore deve ricordare dov'era.
export function useSceltaAudio(p: {
  fileId: string
  casa: boolean
  conVicini: VideoConVicini | undefined
  infoCasa: InfoJellyfin | null
  voce: VoceStreaming | null
  archivioCaricato: boolean
  primaDiCambiare: () => void
}) {
  const { fileId, casa, infoCasa, voce, archivioCaricato, primaDiCambiare } = p
  const audioDisco = useTracceAudio(p.conVicini)
  const tracceCasa = useMemo<TracciaAudio[]>(
    () => (infoCasa ? infoCasa.audio.map((a, i) => ({ indice: i + 1, lingua: a.lingua, titolo: a.titolo, fileId: null })) : []),
    [infoCasa],
  )
  const tracce = casa ? tracceCasa : audioDisco.tracce
  // Ricordata per serie (un anime doppiato, un altro in originale); per i film
  // una scelta sola.
  const ambito = voce?.tmdb_id && voce.stagione != null ? `${voce.media_type}-${voce.tmdb_id}` : 'film'
  const [toccato, setToccato] = useState<{ fileId: string; indice: number } | null>(null)
  const ricordato = useMemo(
    () => (archivioCaricato ? indiceAudio(tracce, leggiLinguaAudio(ambito)) : 0),
    [archivioCaricato, tracce, ambito],
  )
  const scelta = toccato?.fileId === fileId ? toccato.indice : ricordato
  const traccia = tracce[scelta]
  const scegli = useCallback(
    (indice: number) => {
      if (casa) primaDiCambiare()
      setToccato({ fileId, indice })
      salvaLinguaAudio(ambito, tracce[indice]?.lingua ?? null)
    },
    [casa, primaDiCambiare, fileId, ambito, tracce],
  )
  return {
    tracce,
    scelta,
    traccia,
    scegli,
    // L'<audio> della lingua scelta, quando non è quella dentro il video: lo
    // segue in tutto, e il video tace (vedi lib/sincroniaAudio).
    srcAudio: !casa && traccia?.fileId ? audioDisco.url(traccia.fileId) : null,
  }
}
