import { useState } from 'react'

// Voto a mezza stella, stile Letterboxd: da 0.5 a 5.0 a passi di 0.5.
// - Interattivo quando viene passato `onChange` (metà sinistra = mezza stella,
//   metà destra = stella piena; ri-cliccare lo stesso voto lo azzera).
// - Sola lettura quando `onChange` è assente.

const SIZES = { sm: 'text-base', md: 'text-xl', lg: 'text-3xl' } as const

export default function StarRating({
  value,
  onChange,
  size = 'md',
  showValue,
}: {
  value: number | null
  onChange?: (v: number | null) => void
  size?: keyof typeof SIZES
  showValue?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const readOnly = !onChange
  const shown = hover ?? value ?? 0
  const withNumber = showValue ?? !readOnly

  function fillFor(star: number): 0 | 0.5 | 1 {
    if (shown >= star) return 1
    if (shown >= star - 0.5) return 0.5
    return 0
  }

  function pick(v: number) {
    if (!onChange) return
    onChange(value === v ? null : v)
  }

  return (
    <div
      className={`inline-flex items-center gap-0.5 leading-none ${SIZES[size]}`}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = fillFor(star)
        return (
          <span key={star} className="relative inline-block">
            <span className="text-theatre-700">★</span>
            <span
              className="pointer-events-none absolute inset-0 overflow-hidden text-projector"
              style={{ width: fill === 1 ? '100%' : fill === 0.5 ? '50%' : '0%' }}
            >
              ★
            </span>
            {!readOnly && (
              <>
                <button
                  type="button"
                  aria-label={`${star - 0.5} stelle`}
                  className="absolute inset-y-0 left-0 z-10 w-1/2 cursor-pointer"
                  onMouseEnter={() => setHover(star - 0.5)}
                  onClick={() => pick(star - 0.5)}
                />
                <button
                  type="button"
                  aria-label={`${star} stelle`}
                  className="absolute inset-y-0 right-0 z-10 w-1/2 cursor-pointer"
                  onMouseEnter={() => setHover(star)}
                  onClick={() => pick(star)}
                />
              </>
            )}
          </span>
        )
      })}
      {withNumber && (
        <span className="ml-2 text-xs font-normal text-zinc-500">
          {value ? `${value}/5` : '—'}
        </span>
      )}
    </div>
  )
}
