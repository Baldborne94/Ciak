import type { TitleStatus } from '../lib/types'

// L'etichetta che dice «questo ce l'hai già», e in che stato. Viveva dentro
// MediaCard, quindi le griglie che disegnano le proprie card — le liste
// personali, per esempio — restavano senza: dentro una raccolta «da vedere»
// non si capiva a colpo d'occhio cosa avessi già guardato.
const STILI: Record<TitleStatus, { label: string; cls: string }> = {
  watched: { label: '✓ Visto', cls: 'bg-emerald-600/90 text-white' },
  in_progress: { label: '▶ In corso', cls: 'bg-projector/90 text-theatre-950' },
  to_watch: { label: '🎟️ In lista', cls: 'bg-sky-600/90 text-white' },
  abandoned: { label: '✕ Mollato', cls: 'bg-zinc-600/90 text-white' },
}

export default function LibraryBadge({
  status,
  isFavorite = false,
}: {
  status: TitleStatus
  isFavorite?: boolean
}) {
  const stile = STILI[status]
  if (!stile) return null

  return (
    <span
      className={`absolute left-2 top-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold backdrop-blur ${stile.cls}`}
    >
      {stile.label}
      {isFavorite && <span aria-label="preferito">❤️</span>}
    </span>
  )
}
