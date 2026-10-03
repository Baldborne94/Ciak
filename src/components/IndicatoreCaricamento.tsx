import { useEffect, useState, type RefObject } from 'react'
import { useElementoVideo } from '../lib/useElementoVideo'

// Mentre il video aspetta i dati (da Drive, su rete lenta) si vede che sta
// caricando: senza i comandi del browser non c'era più il suo cerchio, e un
// fotogramma fermo sembrava un lettore rotto.

export default function IndicatoreCaricamento({ videoRef }: { videoRef: RefObject<HTMLVideoElement> }) {
  const video = useElementoVideo(videoRef)
  const [inAttesa, setInAttesa] = useState(false)

  useEffect(() => {
    const v = video
    if (!v) return setInAttesa(false)
    const aspetta = () => setInAttesa(true)
    const pronto = () => setInAttesa(false)
    // Appena montato, a volte sta già aspettando il primo byte.
    setInAttesa(!v.paused && v.readyState < 3)
    v.addEventListener('waiting', aspetta)
    v.addEventListener('stalled', aspetta)
    v.addEventListener('playing', pronto)
    v.addEventListener('canplay', pronto)
    v.addEventListener('pause', pronto)
    return () => {
      v.removeEventListener('waiting', aspetta)
      v.removeEventListener('stalled', aspetta)
      v.removeEventListener('playing', pronto)
      v.removeEventListener('canplay', pronto)
      v.removeEventListener('pause', pronto)
    }
  }, [video])

  if (!inAttesa) return null
  return (
    <div role="status" aria-label="Caricamento" className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="h-14 w-14 animate-spin rounded-full border-4 border-white/30 border-t-white" />
    </div>
  )
}
