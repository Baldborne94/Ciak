import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toastCtx'
import Modal from './Modal'
import StarRating from './StarRating'
import { addDiaryEntry, type DiaryRef } from '../lib/diary'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function LogDiaryButton({ item }: { item: DiaryRef }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(todayISO())
  const [rating, setRating] = useState(0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  if (!user) return null

  async function save() {
    if (!user) return
    setSaving(true)
    try {
      await addDiaryEntry(user.id, item, {
        watchedOn: date,
        rating: rating || null,
        note: note.trim() || null,
      })
      setDone(true)
      setTimeout(() => {
        setOpen(false)
        setDone(false)
        setRating(0)
        setNote('')
        setDate(todayISO())
      }, 1200)
    } catch (e) {
      showToast(`Non sono riuscito a salvare nel diario: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost">
        📖 Segna nel diario
      </button>

      {open && (
        <Modal title="Segna nel diario" onClose={() => setOpen(false)}>
          {done ? (
            <p className="py-3 text-center text-sm text-projector">✓ Aggiunto al diario!</p>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-wider text-zinc-500">Visto il</label>
                <input
                  type="date"
                  value={date}
                  max={todayISO()}
                  onChange={(e) => setDate(e.target.value)}
                  className="input-cine mt-1 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-zinc-500">Voto</label>
                <div className="mt-1">
                  <StarRating value={rating || null} onChange={(v) => setRating(v ?? 0)} size="lg" />
                </div>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Due parole su questa visione…"
                rows={3}
                className="w-full resize-none rounded-md border border-theatre-700 bg-theatre-900 px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-projector/50 focus:outline-none"
              />
              <button onClick={save} disabled={saving} className="btn-primary w-full py-2 text-sm">
                {saving ? 'Salvo…' : 'Salva nel diario'}
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
