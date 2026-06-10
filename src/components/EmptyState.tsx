interface Props {
  icon?: string
  title: string
  message?: string
  children?: React.ReactNode
}

export default function EmptyState({ icon = '🎬', title, message, children }: Props) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="text-5xl opacity-80" aria-hidden>
        {icon}
      </div>
      <h2 className="title-display text-2xl text-zinc-200">{title}</h2>
      {message && <p className="max-w-md text-sm text-zinc-500">{message}</p>}
      {children}
    </div>
  )
}
