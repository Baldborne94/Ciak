import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { addDiaryEntry, type DiaryRef } from '../lib/diary'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function LogDiaryButton({ item }: { item: DiaryRef }) {
  const { user } = useAuth()
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
    } catch {
      /* ignore */
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)} className="btn-ghost">
        📖 Segna nel diario
      </button>

      {open && (
        <div className="absolute left-0 z-40 mt-2 w-64 rounded-xl border border-theatre-700 bg-theatre-900 p-3 shadow-reel">
          {done ? (
            <p className="py-3 text-center text-sm text-projector">✓ Aggiunto al diario!</p>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wider text-zinc-500">Visto il</label>
                <input
                  type="date"
                  value={date}
                  max={todayISO()}
                  onChange={(e) => setDate(e.target.value)}
                  className="input-cine mt-1 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-zinc-500">Voto</label>
                <div className="mt-1 flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      onClick={() => setRating(s === rating ? 0 : s)}
                      className={`text-xl leading-none ${
                        rating >= s ? 'text-projector' : 'text-theatre-700 hover:text-projector/60'
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Due parole su questa visione…"
                rows={2}
                className="w-full resize-none rounded-md border border-theatre-700 bg-theatre-900 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-projector/50 focus:outline-none"
              />
              <button onClick={save} disabled={saving} className="btn-primary w-full py-1.5 text-sm">
                {saving ? 'Salvo…' : 'Salva nel diario'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
