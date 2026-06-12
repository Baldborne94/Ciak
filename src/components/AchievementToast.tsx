import { useEffect } from 'react'
import { useAchievementsCtx } from '../lib/achievementsCtx'
import { RARITY_STYLES, RARITY_LABELS } from '../lib/achievements'

export default function AchievementToast() {
  const { pending, dismiss } = useAchievementsCtx()

  useEffect(() => {
    if (pending.length === 0) return
    const t = setTimeout(dismiss, 5000)
    return () => clearTimeout(t)
  }, [pending, dismiss])

  if (pending.length === 0) return null

  const latest = pending[pending.length - 1]

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex max-w-xs cursor-pointer flex-col gap-1 rounded-2xl border border-projector/40 bg-theatre-900/95 p-4 shadow-reel backdrop-blur animate-in fade-in slide-in-from-bottom-4 duration-500"
      onClick={dismiss}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-projector">
        🏆 Trofeo sbloccato!
      </p>
      <div className="mt-1 flex items-center gap-3">
        <span className="text-4xl">{latest.avatar}</span>
        <div>
          <p className="font-display text-xl tracking-wide text-zinc-100">
            {latest.title}
          </p>
          <span
            className={`mt-0.5 inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${RARITY_STYLES[latest.rarity]}`}
          >
            {RARITY_LABELS[latest.rarity]}
          </span>
        </div>
      </div>
      <p className="mt-1 text-xs text-zinc-400">{latest.subtitle}</p>
      {pending.length > 1 && (
        <p className="mt-1 text-xs text-projector/70">
          +{pending.length - 1} altri trofei sbloccati!
        </p>
      )}
    </div>
  )
}
