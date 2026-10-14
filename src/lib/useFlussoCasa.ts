import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { fermaConversione, flussoDiretto, flussoHls, riproducibileDirettamente, tracciaPredefinita, type InfoJellyfin } from './jellyfin'
import { useHls } from './useLettoreCasa'

// Il flusso del server di casa: il file così com'è quando il browser lo legge
// e si sente la prima lingua; altrimenti convertito da Jellyfin (HLS), con la
// lingua scelta. Un file diretto che non parte passa alla conversione con
// `forzaConversione` (vedi `segnala` nel lettore).
export function useFlussoCasa(p: {
  videoRef: RefObject<HTMLVideoElement>
  fileId: string
  casa: boolean
  info: InfoJellyfin | null
  sceltaAudio: number
  onErrore: (messaggio: string) => void
}) {
  const { videoRef, fileId, casa, info, sceltaAudio, onErrore } = p
  const [hlsForzato, setHlsForzato] = useState(false)
  const idSessione = useMemo(() => Math.random().toString(36).slice(2), [])
  const audio = casa && info ? info.audio[sceltaAudio] : undefined
  const diretto = !!info && !hlsForzato && riproducibileDirettamente(info) && (!audio || audio === tracciaPredefinita(info))
  // Una sessione per lingua: Jellyfin ne converte una sola per sessione.
  const sessione = `ciak-${idSessione}-${audio?.indice ?? 'p'}`
  const hls = casa && info && !diretto ? flussoHls(fileId, info, audio?.indice ?? null, sessione) : null
  // Letto dagli avvisi, che possono essere stati creati a un disegno di prima.
  const direttoRef = useRef(diretto)
  direttoRef.current = diretto
  useHls(videoRef, hls, 0, onErrore)
  useEffect(() => {
    if (!hls) return
    return () => fermaConversione(sessione)
  }, [hls, sessione])
  return {
    diretto,
    direttoRef,
    hls,
    // Il src del <video> per il file diretto; con l'HLS lo imposta hls.js.
    src: casa && diretto ? flussoDiretto(fileId) : undefined,
    forzaConversione: () => setHlsForzato(true),
  }
}
