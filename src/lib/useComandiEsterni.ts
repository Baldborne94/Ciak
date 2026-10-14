import { useEffect, useRef, type RefObject } from 'react'
import { azioneTasto, metadatiSessione, SALTO_TASTIERA, type AzioneTasto } from './comandiLettore'
import { logFailure } from './logFailure'

// I comandi del lettore che arrivano da fuori la pagina: la tastiera del
// computer e la schermata di blocco del telefono.

// La tastiera: un gestore solo, registrato una volta, che chiama le azioni
// dell'ultimo disegno. Chi lo usa assegna `.current` a ogni disegno: le azioni
// cambiano (la sigla saltabile, il prossimo episodio), il gestore no.
export function useTastiera() {
  const suTasto = useRef<(azione: AzioneTasto) => void>(() => {})
  useEffect(() => {
    const premuto = (e: KeyboardEvent) => {
      const azione = azioneTasto(e, e.target instanceof HTMLElement ? e.target : null)
      if (!azione) return
      // Prima del browser: lo spazio non scorre la pagina e non preme di nuovo
      // l'ultimo pulsante, e il video in primo piano non salta due volte.
      e.preventDefault()
      e.stopPropagation()
      suTasto.current(azione)
    }
    window.addEventListener('keydown', premuto, true)
    return () => window.removeEventListener('keydown', premuto, true)
  }, [])
  return suTasto
}

// La schermata di blocco e le notifiche del telefono: titolo, locandina,
// pausa, salti e gli episodi accanto, anche a schermo spento o da un'altra app.
export function useSessioneMedia(p: {
  videoRef: RefObject<HTMLVideoElement>
  titolo: string
  poster: string | null
  salta: (secondi: number) => void
  prossimo: (() => void) | null
  precedente: (() => void) | null
}) {
  const { videoRef, titolo, poster, salta, prossimo, precedente } = p
  useEffect(() => {
    const sessione = typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null
    if (!sessione) return
    if (typeof MediaMetadata !== 'undefined') sessione.metadata = new MediaMetadata(metadatiSessione(titolo, poster))
    const azioni: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ['play', () => videoRef.current?.play().catch(logFailure('Ripresa dalla schermata di blocco'))],
      ['pause', () => videoRef.current?.pause()],
      ['seekbackward', (d) => salta(-(d.seekOffset ?? SALTO_TASTIERA))],
      ['seekforward', (d) => salta(d.seekOffset ?? SALTO_TASTIERA)],
      [
        'seekto',
        (d) => {
          if (videoRef.current && d.seekTime != null) videoRef.current.currentTime = d.seekTime
        },
      ],
      ['nexttrack', prossimo],
      ['previoustrack', precedente],
    ]
    const imposta = (azione: MediaSessionAction, gestore: MediaSessionActionHandler | null) => {
      try {
        sessione.setActionHandler(azione, gestore)
      } catch {
        // Un'azione che questo browser non conosce: le altre funzionano lo stesso.
      }
    }
    for (const [azione, gestore] of azioni) imposta(azione, gestore)
    return () => {
      sessione.metadata = null
      for (const [azione] of azioni) imposta(azione, null)
    }
  }, [videoRef, titolo, poster, prossimo, precedente, salta])
}
