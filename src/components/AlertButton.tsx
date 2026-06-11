import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { addAlert, removeAlert, type AlertRef } from '../lib/alerts'

// Toggle "avvisami quando esce" for an upcoming title.
export default function AlertButton({
  item,
  active,
  onChange,
}: {
  item: AlertRef
  active: boolean
  onChange?: (active: boolean) => void
}) {
  const { user } = useAuth()
  const [on, setOn] = useState(active)
  const [busy, setBusy] = useState(false)
  if (!user) return null

  async function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    const next = !on
    setOn(next)
    onChange?.(next)
    try {
      if (next) await addAlert(user!.id, item)
      else await removeAlert(user!.id, item.tmdbId, item.mediaType)
    } catch {
      setOn(!next) // revert on failure
      onChange?.(!next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={toggle}
      className={`w-full rounded-md px-2 py-1 text-xs font-medium transition ${
        on
          ? 'bg-projector text-theatre-950'
          : 'bg-theatre-800 text-zinc-300 hover:bg-theatre-700'
      }`}
    >
      {on ? '🔔 Ti avviso' : '🔔 Avvisami'}
    </button>
  )
}
