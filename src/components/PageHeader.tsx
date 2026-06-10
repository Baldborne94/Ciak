interface Props {
  eyebrow?: string
  title: string
  subtitle?: string
  children?: React.ReactNode
}

export default function PageHeader({ eyebrow, title, subtitle, children }: Props) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-gold/80">
            {eyebrow}
          </p>
        )}
        <h1 className="title-display text-4xl text-white sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm text-zinc-400">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
