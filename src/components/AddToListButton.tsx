import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toastCtx'
import Modal from './Modal'
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
  const { showToast } = useToast()
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
        setLists([...ls].sort((a, b) => a.name.localeCompare(b.name, 'it')))
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
    if (has) next.delete(listId)
    else next.add(listId)
    setInLists(next) // aggiornamento ottimistico
    try {
      if (has) await removeFromList(listId, item.tmdbId, item.mediaType)
      else await addToList(user.id, listId, item)
    } catch (e) {
      setInLists(inLists) // rollback: il DB non è cambiato
      showToast(`Errore: ${(e as Error).message}`, 'error')
    }
  }

  async function create() {
    if (!user || !newName.trim()) return
    try {
      const list = await createList(user.id, newName.trim(), null)
      await addToList(user.id, list.id, item)
      setNewName('')
      setLists((prev) => [...prev, { ...list, item_count: 1 }].sort((a, b) => a.name.localeCompare(b.name, 'it')))
      setInLists((prev) => new Set(prev).add(list.id))
    } catch (e) {
      showToast(`Non sono riuscito a creare la lista: ${(e as Error).message}`, 'error')
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost">
        ➕ Aggiungi a lista
      </button>

      {open && (
        <Modal title="Aggiungi a lista" onClose={() => setOpen(false)}>
          {loading ? (
            <p className="px-1 py-2 text-sm text-zinc-500">Carico…</p>
          ) : (
            <>
              <div className="max-h-60 space-y-1 overflow-y-auto">
                {lists.length === 0 && (
                  <p className="px-1 py-1 text-sm text-zinc-500">Nessuna lista, creane una qui sotto.</p>
                )}
                {lists.map((l) => (
                  <label
                    key={l.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-200 hover:bg-theatre-800"
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

              <div className="mt-3 flex gap-2 border-t border-theatre-800 pt-3">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && create()}
                  placeholder="Nuova lista…"
                  className="input-cine flex-1 py-2 text-sm"
                />
                <button onClick={create} disabled={!newName.trim()} className="btn-primary px-3 py-2 text-sm">
                  Crea
                </button>
              </div>

              <Link
                to="/liste"
                onClick={() => setOpen(false)}
                className="mt-3 block text-center text-xs text-projector/80 hover:text-projector"
              >
                Gestisci le liste →
              </Link>
            </>
          )}
        </Modal>
      )}
    </>
  )
}
