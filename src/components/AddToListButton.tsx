import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import {
  addToList,
  createList,
  listIdsContaining,
  listLists,
  removeFromList,
  type ListItemRef,
} from '../lib/lists'
import type { UserList } from '../lib/types'

export default function AddToListButton({ item }: { item: ListItemRef }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [lists, setLists] = useState<UserList[]>([])
  const [inLists, setInLists] = useState<Set<string>>(new Set())
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !user) return
    setLoading(true)
    Promise.all([
      listLists(user.id),
      listIdsContaining(user.id, item.tmdbId, item.mediaType),
    ])
      .then(([ls, ids]) => {
        setLists(ls)
        setInLists(ids)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, user, item.tmdbId, item.mediaType])

  if (!user) return null

  async function toggle(listId: string) {
    if (!user) return
    const has = inLists.has(listId)
    const next = new Set(inLists)
    if (has) {
      await removeFromList(listId, item.tmdbId, item.mediaType)
      next.delete(listId)
    } else {
      await addToList(user.id, listId, item)
      next.add(listId)
    }
    setInLists(next)
  }

  async function create() {
    if (!user || !newName.trim()) return
    const list = await createList(user.id, newName.trim(), null)
    await addToList(user.id, list.id, item)
    setNewName('')
    setLists((prev) => [{ ...list, item_count: 1 }, ...prev])
    setInLists((prev) => new Set(prev).add(list.id))
  }

  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)} className="btn-ghost">
        ➕ Aggiungi a lista
      </button>

      {open && (
        <div className="absolute left-0 z-40 mt-2 w-64 rounded-xl border border-theatre-700 bg-theatre-900 p-3 shadow-reel">
          {loading ? (
            <p className="px-1 py-2 text-sm text-zinc-500">Carico…</p>
          ) : (
            <>
              <div className="max-h-52 space-y-1 overflow-y-auto">
                {lists.length === 0 && (
                  <p className="px-1 py-1 text-xs text-zinc-500">Nessuna lista, creane una.</p>
                )}
                {lists.map((l) => (
                  <label
                    key={l.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-200 hover:bg-theatre-800"
                  >
                    <input
                      type="checkbox"
                      checked={inLists.has(l.id)}
                      onChange={() => toggle(l.id)}
                      className="accent-projector"
                    />
                    <span className="line-clamp-1">{l.name}</span>
                  </label>
                ))}
              </div>

              <div className="mt-2 flex gap-1 border-t border-theatre-800 pt-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && create()}
                  placeholder="Nuova lista…"
                  className="input-cine flex-1 py-1.5 text-sm"
                />
                <button onClick={create} disabled={!newName.trim()} className="btn-primary px-3 py-1.5 text-sm">
                  +
                </button>
              </div>

              <Link
                to="/liste"
                onClick={() => setOpen(false)}
                className="mt-2 block text-center text-xs text-projector/80 hover:text-projector"
              >
                Gestisci le liste →
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}
