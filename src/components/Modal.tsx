import type { ReactNode } from 'react'

// Centered overlay that can't be clipped by any ancestor's overflow.
export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-theatre-700 bg-theatre-900 p-5 shadow-reel"
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
