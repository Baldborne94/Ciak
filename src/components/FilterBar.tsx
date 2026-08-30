import type { ReactNode } from 'react'

// Shared, consistent filter-bar primitives used by Cerca, Genere and Persona.
// Keeping these in one place means the three pages look and behave the same.

export const filterSelectClass = 'input-cine w-auto py-1.5 text-sm'

// Bordered container that wraps a row of filter controls.
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-8 rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">{children}</div>
    </div>
  )
}

// A labeled cluster of controls (e.g. "Tipo" + chips, or "Voto min" + slider).
export function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
      {children}
    </div>
  )
}

// Pill-style toggle group used for Tipo / Ruolo choices.
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm transition ${
            value === o.value
              ? 'bg-projector text-theatre-950'
              : 'bg-theatre-800 text-zinc-300 hover:bg-theatre-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Minimum-rating slider (0–9). Shows "—" when off, "N+" when active.
export function RatingSlider({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  return (
    <FilterGroup label="Voto min">
      <input
        type="range"
        aria-label="Voto minimo"
        min={0}
        max={9}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-projector"
      />
      <span className="w-8 text-sm font-semibold text-projector">
        {value > 0 ? `${value}+` : '—'}
      </span>
    </FilterGroup>
  )
}
