interface MessageProps {
  title: string
  message?: string
  icon?: string
}

export function Loader({ label = 'Caricamento in corso…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-zinc-400">
      <span className="text-4xl animate-pulse">🎞️</span>
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function ErrorState({
  title = 'Qualcosa è andato storto',
  message,
  icon = '🎬',
}: MessageProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-curtain/30 bg-curtain-dark/10 py-16 text-center">
      <span className="text-4xl">{icon}</span>
      <h2 className="font-display text-2xl tracking-wide text-zinc-100">
        {title}
      </h2>
      {message && <p className="max-w-md text-sm text-zinc-400">{message}</p>}
    </div>
  )
}

export function EmptyState({
  title,
  message,
  icon = '🍿',
}: MessageProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-theatre-700 py-16 text-center">
      <span className="text-4xl">{icon}</span>
      <h2 className="font-display text-2xl tracking-wide text-zinc-100">
        {title}
      </h2>
      {message && <p className="max-w-md text-sm text-zinc-400">{message}</p>}
    </div>
  )
}
