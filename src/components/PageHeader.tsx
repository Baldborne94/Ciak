import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  subtitle?: string
  children?: ReactNode
}

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  children,
}: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-projector/80">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 font-display text-4xl tracking-wide text-zinc-100">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}
