import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { Loader, ErrorState } from '../components/States'
import { useAuth } from '../lib/auth'
import {
  checkAndUnlockAchievements,
  getUnlockedAchievementIds,
  getActiveAchievementId,
  setActiveAchievement,
} from '../lib/userTitles'
import { useAchievementsCtx, achievementById } from '../lib/achievementsCtx'
import {
  ACHIEVEMENTS,
  RARITY_STYLES,
  RARITY_LABELS,
  type Achievement,
} from '../lib/achievements'

function ProfileCard({
  active,
  unlockedCount,
}: {
  active: Achievement | null
  unlockedCount: number
}) {
  return (
    <div className="mb-10 flex flex-col items-center gap-4 rounded-2xl border border-theatre-800 bg-theatre-900/60 p-8 sm:flex-row">
      <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl border-2 border-projector/40 bg-theatre-800 text-6xl shadow-reel">
        {active ? active.avatar : '🎬'}
      </div>
      <div className="text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Titolo attivo
        </p>
        <h2 className="mt-1 font-display text-3xl tracking-wide text-projector">
          {active ? active.title : 'Spettatore'}
        </h2>
        {active && (
          <span
            className={`mt-2 inline-block rounded-full border px-3 py-0.5 text-xs font-medium ${RARITY_STYLES[active.rarity]}`}
          >
            {RARITY_LABELS[active.rarity]}
          </span>
        )}
        <p className="mt-2 text-sm text-zinc-400">
          {unlockedCount} / {ACHIEVEMENTS.length} trofei sbloccati
        </p>
        {!active && (
          <p className="mt-1 text-xs text-zinc-500">
            Sblocca un trofeo e cliccaci sopra per equipaggiarlo.
          </p>
        )}
      </div>
    </div>
  )
}

function AchievementCard({
  achievement,
  unlocked,
  active,
  onEquip,
  equipping,
}: {
  achievement: Achievement
  unlocked: boolean
  active: boolean
  onEquip: (a: Achievement) => void
  equipping: boolean
}) {
  return (
    <button
      onClick={() => unlocked && onEquip(achievement)}
      disabled={!unlocked || equipping}
      className={`group relative flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition ${
        active
          ? 'border-projector bg-projector/10 shadow-reel'
          : unlocked
            ? 'border-theatre-700 bg-theatre-900/60 hover:border-projector/40 hover:bg-theatre-800/60'
            : 'border-theatre-800/50 bg-theatre-950/40 opacity-40'
      }`}
    >
      <div className="text-4xl">{unlocked ? achievement.avatar : '🔒'}</div>
      <div>
        <p
          className={`text-sm font-semibold ${unlocked ? 'text-zinc-100' : 'text-zinc-600'}`}
        >
          {achievement.title}
        </p>
        <span
          className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-xs ${
            unlocked ? RARITY_STYLES[achievement.rarity] : 'border-zinc-700 text-zinc-600'
          }`}
        >
          {RARITY_LABELS[achievement.rarity]}
        </span>
      </div>
      <p className={`text-xs ${unlocked ? 'text-zinc-400' : 'text-zinc-700'}`}>
        {achievement.subtitle}
      </p>
      {active && (
        <span className="absolute right-2 top-2 rounded-full bg-projector px-1.5 py-0.5 text-xs font-bold text-theatre-950">
          ✓
        </span>
      )}
    </button>
  )
}

export default function TrophiesPage() {
  const { user } = useAuth()
  const { notify, setActiveAchievement: setCtxActive } = useAchievementsCtx()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [equipping, setEquipping] = useState(false)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    Promise.all([
      checkAndUnlockAchievements(user.id),
      getUnlockedAchievementIds(user.id),
      getActiveAchievementId(user.id),
    ])
      .then(([newOnes, ids, active]) => {
        if (newOnes.length > 0) notify(newOnes)
        setUnlockedIds(new Set(ids))
        setActiveId(active)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [user, notify])

  async function equip(achievement: Achievement) {
    if (!user) return
    setEquipping(true)
    try {
      await setActiveAchievement(user.id, achievement.id)
      setActiveId(achievement.id)
      setCtxActive(achievement.id, achievement.theme)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setEquipping(false)
    }
  }

  if (!user) {
    return (
      <div className="py-20 text-center text-zinc-400">
        <Link to="/login" className="text-projector hover:underline">
          Accedi
        </Link>{' '}
        per sbloccare i trofei.
      </div>
    )
  }

  const active = activeId ? achievementById(activeId) ?? null : null
  const unlockedCount = unlockedIds.size

  const byRarity = ['platinum', 'gold', 'silver', 'bronze'] as const
  const grouped = byRarity.map((rarity) => ({
    rarity,
    items: ACHIEVEMENTS.filter((a) => a.rarity === rarity),
  }))

  return (
    <div>
      <PageHeader
        eyebrow="Il tuo profilo"
        title="Trofei & Badge"
        subtitle="Sblocca trofei guardando film e serie. Equipaggia il tuo preferito per cambiare titolo, avatar e tema dell'app."
      />

      {loading ? (
        <Loader label="Carico i tuoi trofei…" />
      ) : error ? (
        <ErrorState title="Errore" message={error} />
      ) : (
        <>
          <ProfileCard active={active} unlockedCount={unlockedCount} />

          <div className="space-y-10">
            {grouped.map(({ rarity, items }) => (
              <div key={rarity}>
                <h3 className="mb-4 font-display text-xl tracking-wide text-zinc-300">
                  {rarity === 'platinum' && '💎 Platino'}
                  {rarity === 'gold' && '🥇 Oro'}
                  {rarity === 'silver' && '🥈 Argento'}
                  {rarity === 'bronze' && '🥉 Bronzo'}
                  <span className="ml-2 text-sm font-normal text-zinc-500">
                    {items.filter((a) => unlockedIds.has(a.id)).length}/{items.length}
                  </span>
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {items.map((a) => (
                    <AchievementCard
                      key={a.id}
                      achievement={a}
                      unlocked={unlockedIds.has(a.id)}
                      active={activeId === a.id}
                      onEquip={equip}
                      equipping={equipping}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
