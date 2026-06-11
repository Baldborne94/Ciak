import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { addEntity, getEntity, removeEntity, type EntityRef } from '../lib/entities'

// Heart toggle to save a person / studio among favorites.
export default function EntityFavoriteButton({ entity }: { entity: EntityRef }) {
  const { user } = useAuth()
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)
    getEntity(user.id, entity.entityType, entity.entityId)
      .then((row) => setSaved(!!row))
      .catch(() => setSaved(false))
      .finally(() => setLoading(false))
  }, [user, entity.entityType, entity.entityId])

  if (!user) {
    return (
      <Link to="/login" className="btn-ghost mt-4 inline-flex">
        🤍 Accedi per salvare tra i preferiti
      </Link>
    )
  }

  async function toggle() {
    if (!user) return
    setBusy(true)
    try {
      if (saved) {
        await removeEntity(user.id, entity.entityType, entity.entityId)
        setSaved(false)
      } else {
        await addEntity(user.id, entity)
        setSaved(true)
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy || loading}
      className={`mt-4 inline-flex ${
        saved ? 'btn bg-curtain text-white hover:bg-curtain-light' : 'btn-ghost'
      }`}
    >
      {saved ? '❤️ Nei preferiti' : '🤍 Aggiungi ai preferiti'}
    </button>
  )
}
