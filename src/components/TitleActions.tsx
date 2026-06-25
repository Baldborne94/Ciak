import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import {
  getUserTitle,
  upsertUserTitle,
  checkAndUnlockAchievements,
  type TitleRef,
} from '../lib/userTitles'
import { useToast } from '../lib/toastCtx'
import { STATUS_LABELS, type TitleStatus, type UserTitle } from '../lib/types'

const STATUS_ORDER: TitleStatus[] = [
  'to_watch',
  'watched',
  'in_progress',
  'abandoned',
]

export default function TitleActions({ titleRef }: { titleRef: TitleRef }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [record, setRecord] = useState<UserTitle | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)
    getUserTitle(user.id, titleRef.tmdbId, titleRef.mediaType)
      .then(setRecord)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [user, titleRef.tmdbId, titleRef.mediaType])

  if (!user) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-theatre-700 p-4 text-sm text-zinc-400">
        <Link to="/login" className="text-projector hover:underline">
          Accedi
        </Link>{' '}
        per aggiungere questo titolo alle tue liste, segnarlo come preferito e
        dargli un voto.
      </div>
    )
  }

  async function apply(
    patch: Parameters<typeof upsertUserTitle>[2],
  ) {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      const next = await upsertUserTitle(user.id, titleRef, patch)
      setRecord(next)
      // I trofei sono nascosti: continuiamo a registrare gli sblocchi nel DB
      // (utili per la versione futura) ma senza mostrare il toast.
      checkAndUnlockAchievements(user.id).catch(() => {})
    } catch (e) {
      setError((e as Error).message)
      showToast(`Salvataggio non riuscito: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  function setStatus(status: TitleStatus) {
    apply({
      status,
      // Stamp the watch date the first time it's marked as seen.
      watched_at:
        status === 'watched' && !record?.watched_at
          ? new Date().toISOString()
          : record?.watched_at ?? null,
    })
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_ORDER.map((status) => {
          const active = record?.status === status
          return (
            <button
              key={status}
              onClick={() => setStatus(status)}
              disabled={saving || loading}
              className={
                active
                  ? 'btn bg-projector text-theatre-950'
                  : 'btn-ghost'
              }
            >
              {STATUS_LABELS[status]}
            </button>
          )
        })}

        <button
          onClick={() => apply({ is_favorite: !record?.is_favorite })}
          disabled={saving || loading}
          className={
            record?.is_favorite
              ? 'btn bg-curtain text-white hover:bg-curtain-light'
              : 'btn-ghost'
          }
        >
          {record?.is_favorite ? '❤️ Preferito' : '🤍 Aggiungi ai preferiti'}
        </button>

        {/* "Da rivedere": rimette un titolo già visto nella watchlist senza
            togliergli lo stato. Ha senso solo se non è già "Da vedere". */}
        {record && record.status !== 'to_watch' && (
          <button
            onClick={() => apply({ rewatch: !record.rewatch })}
            disabled={saving || loading}
            title="Lo fa riapparire in «Da vedere» mantenendo lo stato attuale"
            className={record.rewatch ? 'btn bg-projector text-theatre-950' : 'btn-ghost'}
          >
            {record.rewatch ? '🔁 Da rivedere' : '🔁 Rivedi'}
          </button>
        )}
      </div>

      {record && (
        <p className="mt-2 text-xs text-zinc-500">
          Nella tua collezione · stato:{' '}
          <span className="text-zinc-300">{STATUS_LABELS[record.status]}</span>
          {record.personal_rating ? ` · voto ${record.personal_rating}/5` : ''}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-curtain-light">{error}</p>}
    </div>
  )
}
