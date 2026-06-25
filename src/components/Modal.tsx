import { useEffect, useRef, type ReactNode } from 'react'

// Centered overlay that can't be clipped by any ancestor's overflow.
// Accessibile: ruolo dialog, chiusura con Esc, focus spostato dentro al modale
// all'apertura e trappola del focus con Tab (non esce dal dialog).
export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  // onClose spesso è una funzione inline (cambia a ogni render del genitore):
  // la teniamo in una ref così l'effetto sotto gira UNA volta sola al montaggio
  // e non ruba il focus a ogni battitura.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const panel = panelRef.current
    const focusablesSelector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

    // Sposta il focus sul primo elemento interattivo (o sul pannello stesso),
    // una sola volta all'apertura.
    const initial = panel?.querySelectorAll<HTMLElement>(focusablesSelector)
    ;(initial && initial.length ? initial[0] : panel)?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = panel.querySelectorAll<HTMLElement>(focusablesSelector)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      // Cicla il focus tra primo e ultimo elemento, senza uscire dal dialog.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // Eseguito una sola volta: niente dipendenze (onClose letto via ref).
  }, [])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl border border-theatre-700 bg-theatre-900 p-5 shadow-reel focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg tracking-wide text-zinc-100">{title}</h3>
          <button onClick={onClose} aria-label="Chiudi" className="text-zinc-500 hover:text-zinc-200">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
