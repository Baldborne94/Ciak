import { useEffect, useState } from 'react'
import { logFailure } from '../lib/logFailure'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { listReleased, markNotified } from '../lib/alerts'
import type { UserAlert } from '../lib/types'

// In-app alert: when a title the user asked to be reminded about has been
// released, show a one-time banner on app open.
export default function ReleaseAlerts() {
  const { user } = useAuth()
  const [released, setReleased] = useState<UserAlert[]>([])

  useEffect(() => {
    if (!user) {
      setReleased([])
      return
    }
    listReleased(user.id).then(setReleased).catch(() => setReleased([]))
  }, [user])

  if (!user || released.length === 0) return null

  async function dismiss() {
    if (!user) return
    const ids = released.map((a) => a.id)
    setReleased([])
    await markNotified(user.id, ids).catch(logFailure('avvisi non marcati come letti'))
  }

  const names = released.map((a) => a.title)
  const label =
    names.length === 1
      ? `«${names[0]}» è uscito!`
      : `${names.length} titoli che aspettavi sono usciti!`

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-projector/40 bg-theatre-900/95 px-4 py-3 shadow-reel backdrop-blur">
      <span className="text-xl">🎉</span>
      <div className="flex-1 text-sm text-zinc-200">
        <span className="font-semibold text-projector">{label}</span>{' '}
        <Link to="/in-arrivo" onClick={dismiss} className="underline decoration-projector/50 hover:text-projector">
          Vedi
        </Link>
      </div>
      <button onClick={dismiss} aria-label="Ho capito" className="btn-ghost px-3 py-1.5 text-sm">
        Ok
      </button>
    </div>
  )
}
