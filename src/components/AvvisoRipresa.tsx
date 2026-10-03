import { useEffect, useState } from 'react'
import { formattaTempo } from '../lib/streaming'

// Ripartendo da dove ci si era fermati lo si dice sopra il video, per qualche
// secondo: scritto solo sotto, a schermo intero non si vedeva, e un episodio
// ripreso a 1:31 sembrava una sigla saltata da sola.

export const MS_AVVISO_RIPRESA = 8000

export default function AvvisoRipresa({ da, onRicomincia }: { da: number | null; onRicomincia: () => void }) {
  const [visibile, setVisibile] = useState(false)
  useEffect(() => {
    if (da === null) return
    setVisibile(true)
    const via = setTimeout(() => setVisibile(false), MS_AVVISO_RIPRESA)
    return () => clearTimeout(via)
  }, [da])

  if (da === null || !visibile) return null
  return (
    <div
      role="status"
      className="absolute left-2 top-2 flex items-center gap-2 rounded-xl border border-theatre-700 bg-theatre-950/90 px-3 py-1.5 text-sm text-zinc-100 shadow-reel"
    >
      <span>↩ Ripreso da {formattaTempo(da)}</span>
      <button
        type="button"
        onClick={() => {
          onRicomincia()
          setVisibile(false)
        }}
        className="text-projector underline-offset-2 hover:underline"
      >
        Ricomincia dall’inizio
      </button>
    </div>
  )
}
