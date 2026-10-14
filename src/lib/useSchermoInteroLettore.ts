import { useEffect, useRef, useState, type RefObject } from 'react'
import { logFailure } from './logFailure'

// Lo schermo intero del lettore. È quello della pagina, non del <video>:
// passando all'episodio dopo il <video> si rifà da capo, e col suo schermo
// intero si tornava ogni volta alla finestra. E sopra il video restano visibili
// i pulsanti per saltare le sigle.
export function useSchermoInteroLettore(videoRef: RefObject<HTMLVideoElement>) {
  const [schermoIntero, setSchermoIntero] = useState(() => document.fullscreenElement === document.documentElement)
  // Lo schermo intero del browser sul solo <video> (il suo pulsante, che
  // Firefox mostra comunque, o Chrome che ci va da solo girando il tablet):
  // lì sopra il video non resta niente, né il tocco per la pausa né «Salta
  // sigla». Si passa a quello di Ciak; se il browser non lo concede senza un
  // tocco, il lettore occupa comunque tutta la finestra (`aTuttaFinestra`) e
  // il primo tocco sul video chiede lo schermo intero vero (`concediDalTocco`).
  const [aTuttaFinestra, setATuttaFinestra] = useState(false)
  const daRotazione = useRef(false)
  useEffect(() => {
    const cambia = () => {
      const v = videoRef.current
      if (v && document.fullscreenElement === v) {
        daRotazione.current = true
        setATuttaFinestra(true)
        document
          .exitFullscreen()
          .then(() => document.documentElement.requestFullscreen())
          .catch(() => {
            /* niente schermo intero vero senza un tocco: resta a tutta finestra */
          })
        return
      }
      const nostro = document.fullscreenElement === document.documentElement
      setSchermoIntero(nostro)
      // Ottenuto quello vero, la finestra intera non serve più: uscendo col
      // gesto «indietro» si torna al lettore normale.
      if (nostro) setATuttaFinestra(false)
    }
    document.addEventListener('fullscreenchange', cambia)
    return () => document.removeEventListener('fullscreenchange', cambia)
  }, [videoRef])
  // Rimettendo il tablet in verticale si esce, come avrebbe fatto il browser.
  useEffect(() => {
    const orientamento = typeof screen !== 'undefined' ? screen.orientation : undefined
    if (!orientamento) return
    const gira = () => {
      if (!daRotazione.current || !orientamento.type.startsWith('portrait')) return
      daRotazione.current = false
      setATuttaFinestra(false)
      if (document.fullscreenElement) document.exitFullscreen().catch(logFailure('Uscita dallo schermo intero'))
    }
    orientamento.addEventListener('change', gira)
    return () => orientamento.removeEventListener('change', gira)
  }, [])
  const cinema = schermoIntero || aTuttaFinestra
  // A tutto schermo la pagina sotto non deve scorrere: la sua barra di
  // scorrimento restava visibile sul bordo destro del film.
  useEffect(() => {
    if (!cinema) return
    const prima = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = prima
    }
  }, [cinema])

  function alterna() {
    daRotazione.current = false
    if (aTuttaFinestra || document.fullscreenElement) {
      setATuttaFinestra(false)
      if (document.fullscreenElement) document.exitFullscreen().catch(logFailure('Uscita dallo schermo intero'))
    } else document.documentElement.requestFullscreen().catch(logFailure('Schermo intero del lettore'))
  }

  // A tutta finestra senza schermo intero vero: un tocco sul video lo concede.
  function concediDalTocco() {
    if (aTuttaFinestra && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(logFailure('Schermo intero del lettore'))
    }
  }

  return { cinema, alterna, concediDalTocco }
}
