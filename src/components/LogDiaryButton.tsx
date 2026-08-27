import { useEffect, useState } from 'react'
import { logFailure } from '../lib/logFailure'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toastCtx'
import Modal from './Modal'
import StarRating from './StarRating'
import {
  addDiaryEntry,
  updateDiaryEntry,
  getLatestDiaryEntry,
  countDiaryViewings,
  type DiaryRef,
} from '../lib/diary'
import { getUserTitle } from '../lib/userTitles'
import type { DiaryEntry } from '../lib/types'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function LogDiaryButton({ item }: { item: DiaryRef }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  // La visione più recente già registrata (se c'è): permette di modificarla
  // invece di forzare sempre una nuova rivisione.
  const [existing, setExisting] = useState<DiaryEntry | null>(null)
  // Voto già dato al titolo nella sua scheda (user_titles): può esistere anche
  // senza nessuna visione registrata, e va mostrato lo stesso.
  const [titleRating, setTitleRating] = useState<number | null>(null)
  const [priorViewings, setPriorViewings] = useState(0)
  const [mode, setMode] = useState<'edit' | 'new'>('new')
  const [date, setDate] = useState(todayISO())
  const [rating, setRating] = useState(0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!open || !user) return
    Promise.all([
      getLatestDiaryEntry(user.id, item.tmdbId, item.mediaType),
      countDiaryViewings(user.id, item.tmdbId, item.mediaType),
      // In pratica user_titles tiene solo 'movie'/'tv' (anime e cartoni sono
      // serie): restringiamo esplicitamente per la ricerca della scheda.
      getUserTitle(user.id, item.tmdbId, item.mediaType === 'tv' ? 'tv' : 'movie').catch(() => null),
    ])
      .then(([latest, count, title]) => {
        setPriorViewings(count)
        setExisting(latest)
        setTitleRating(title?.personal_rating ?? null)
        if (latest) {
          // Predefinito: modifica la visione esistente (magari solo per aggiungere
          // la recensione dimenticata), mantenendo data e voto. Se la visione non
          // ha voto ma il titolo sì, mostriamo quello invece di stelle vuote.
          setMode('edit')
          setDate(latest.watched_on)
          setRating(latest.rating ?? title?.personal_rating ?? 0)
          setNote(latest.note ?? '')
        } else {
          setMode('new')
          setDate(todayISO())
          // Nessuna visione registrata, ma il voto sulla scheda esiste: aprire il
          // diario con le stelle vuote faceva sembrare perso un voto già dato.
          setRating(title?.personal_rating ?? 0)
          setNote('')
        }
      })
      .catch(logFailure('visioni del diario non caricate'))
  }, [open, user, item.tmdbId, item.mediaType])

  if (!user) return null

  function chooseEdit() {
    if (!existing) return
    setMode('edit')
    setDate(existing.watched_on)
    setRating(existing.rating ?? titleRating ?? 0)
    setNote(existing.note ?? '')
  }

  function chooseNew() {
    setMode('new')
    setDate(todayISO())
    setRating(existing?.rating ?? titleRating ?? 0) // punto di partenza; modificabile
    setNote('')
  }

  async function save() {
    if (!user) return
    setSaving(true)
    try {
      if (mode === 'edit' && existing) {
        await updateDiaryEntry(user.id, existing, {
          rating: rating || null,
          note: note.trim() || null,
        })
      } else {
        await addDiaryEntry(user.id, item, {
          watchedOn: date,
          rating: rating || null,
          note: note.trim() || null,
        })
      }
      setDone(true)
      setTimeout(() => {
        setOpen(false)
        setDone(false)
      }, 1200)
    } catch (e) {
      showToast(`Non sono riuscito a salvare nel diario: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const toggleCls = (active: boolean) =>
    `flex-1 rounded-md px-3 py-2 text-sm transition ${
      active ? 'bg-projector text-theatre-950' : 'bg-theatre-800 text-zinc-300 hover:bg-theatre-700'
    }`

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost">
        📖 Segna nel diario
      </button>

      {open && (
        <Modal title="Segna nel diario" onClose={() => setOpen(false)}>
          {done ? (
            <p className="py-3 text-center text-sm text-projector">✓ Salvato nel diario!</p>
          ) : (
            <div className="space-y-4">
              {/* Se il titolo è già nel diario, scegli tu: modificare la visione
                  esistente o registrarne una nuova (rivisione). */}
              {existing && (
                <div className="flex gap-2">
                  <button onClick={chooseEdit} className={toggleCls(mode === 'edit')}>
                    ✏️ Modifica visione
                  </button>
                  <button onClick={chooseNew} className={toggleCls(mode === 'new')}>
                    🔁 Nuova visione
                  </button>
                </div>
              )}

              {mode === 'edit' && existing ? (
                <p className="text-xs text-zinc-500">
                  Stai modificando la visione del{' '}
                  <span className="text-zinc-300">{formatDate(existing.watched_on)}</span>. Puoi
                  aggiornare voto e recensione senza cambiarne la data.
                </p>
              ) : (
                <>
                  {priorViewings > 0 && (
                    <div className="rounded-md border border-projector/30 bg-projector/5 px-3 py-2 text-xs text-projector">
                      🔁 Rivisione · sarà la tua visione n.{priorViewings + 1}.
                    </div>
                  )}
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
                </>
              )}

              <div>
                <label className="text-xs uppercase tracking-wider text-zinc-500">Voto</label>
                <div className="mt-1">
                  <StarRating value={rating || null} onChange={(v) => setRating(v ?? 0)} size="lg" />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-zinc-500">La tua recensione</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Cosa ti ha lasciato? Scrivi quanto vuoi…"
                  rows={6}
                  className="mt-1 w-full resize-y rounded-md border border-theatre-700 bg-theatre-900 px-2 py-1.5 text-sm leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-projector/50 focus:outline-none"
                />
              </div>
              <button onClick={save} disabled={saving} className="btn-primary w-full py-2 text-sm">
                {saving ? 'Salvo…' : mode === 'edit' ? 'Salva modifiche' : 'Salva nel diario'}
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
