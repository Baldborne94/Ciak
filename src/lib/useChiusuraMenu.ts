import { useEffect, type RefObject } from 'react'

// Un menu della barra del lettore si chiude toccando fuori o con Esc, come ogni
// menu. Esc lo si prende prima del lettore: chiude il menu, non lo schermo
// intero, e il fuoco torna al pulsante che l'ha aperto.
export function useChiusuraMenu(
  aperto: boolean,
  chiudi: () => void,
  contenitore: RefObject<HTMLElement>,
  pulsante: RefObject<HTMLElement>,
): void {
  useEffect(() => {
    if (!aperto) return
    const fuori = (e: PointerEvent) => {
      if (!contenitore.current?.contains(e.target as Node)) chiudi()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      chiudi()
      pulsante.current?.focus()
    }
    document.addEventListener('pointerdown', fuori)
    window.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', fuori)
      window.removeEventListener('keydown', esc, true)
    }
  }, [aperto, chiudi, contenitore, pulsante])
}
