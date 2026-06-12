import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Loader } from './States'
import { useAuth } from '../lib/auth'
import { searchMulti, searchPerson, posterUrl, profileUrl, displayTitle } from '../lib/tmdb'
import { refFromMedia, upsertUserTitle } from '../lib/userTitles'
import { addEntity } from '../lib/entities'
import { aiFetch } from '../lib/aiClient'
import type { MediaItem, Person } from '../lib/types'

interface TitleHit {
  title: string
  year?: string
  type: 'movie' | 'tv'
  confidence: 'alta' | 'media' | 'bassa'
  reason: string
  item: MediaItem | null
}
interface PersonHit {
  name: string
  role?: string
  confidence: 'alta' | 'media' | 'bassa'
  reason: string
  person: Person | null
}

const CONF_COLOR: Record<string, string> = {
  alta: 'text-emerald-400',
  media: 'text-projector',
  bassa: 'text-zinc-400',
}

function compress(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const max = 1024
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas non disponibile'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' })
    }
    img.onerror = () => reject(new Error('Immagine non valida'))
    img.src = url
  })
}

export default function ImageIdentify() {
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [titles, setTitles] = useState<TitleHit[] | null>(null)
  const [people, setPeople] = useState<PersonHit[]>([])
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [savedPeople, setSavedPeople] = useState<Set<number>>(new Set())

  async function handleFile(file: File) {
    setError(null)
    setTitles(null)
    setPeople([])
    setAdded(new Set())
    setPreview(URL.createObjectURL(file))
    setLoading(true)
    try {
      const { base64, mediaType } = await compress(file)
      const data = await aiFetch<{
        titles: Omit<TitleHit, 'item'>[]
        people: Omit<PersonHit, 'person'>[]
      }>('/api/identify', { image: base64, mediaType })
      const [resolvedTitles, resolvedPeople] = await Promise.all([
        Promise.all(
          (data.titles ?? []).map(async (c) => {
            let item: MediaItem | null = null
            try {
              const results = await searchMulti(c.title)
              item = results.find((r) => r.mediaType === c.type) ?? results[0] ?? null
            } catch { /* ignore */ }
            return { ...c, item }
          }),
        ),
        Promise.all(
          (data.people ?? []).map(async (p) => {
            let person: Person | null = null
            try {
              const results = await searchPerson(p.name)
              person = results[0] ?? null
            } catch { /* ignore */ }
            return { ...p, person }
          }),
        ),
      ])
      setTitles(resolvedTitles)
      setPeople(resolvedPeople)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function addToWatchlist(item: MediaItem) {
    if (!user) return
    await upsertUserTitle(user.id, refFromMedia(item), { status: 'to_watch' }).catch(() => {})
    setAdded((prev) => new Set(prev).add(item.id))
  }

  async function savePerson(person: Person) {
    if (!user) return
    await addEntity(user.id, {
      entityType: 'person',
      entityId: person.id,
      name: person.name,
      imagePath: person.profilePath,
      subtitle: person.department,
    }).catch(() => {})
    setSavedPeople((prev) => new Set(prev).add(person.id))
  }

  const nothing = titles !== null && titles.length === 0 && people.length === 0

  return (
    <div>
      {/* Upload area */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const file = e.dataTransfer.files?.[0]
          if (file) handleFile(file)
        }}
        className="mb-6 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-theatre-700 bg-theatre-900/40 p-8 text-center transition hover:border-projector/50"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
        <span className="text-4xl">📷</span>
        <p className="text-sm text-zinc-300">
          Trascina qui una foto, uno screenshot o un collage, oppure{' '}
          <span className="text-projector">clicca per sceglierla</span>
        </p>
        <p className="text-xs text-zinc-500">
          L'AI riconosce film, serie, anime e gli attori presenti.
        </p>
      </div>

      {preview && (
        <div className="mb-6 flex justify-center">
          <img src={preview} alt="Anteprima" className="max-h-64 rounded-xl border border-theatre-800" />
        </div>
      )}

      {loading ? (
        <Loader label="🔍 L'AI sta osservando l'immagine…" />
      ) : error ? (
        <p className="text-center text-sm text-curtain-light">{error}</p>
      ) : nothing ? (
        <EmptyState
          title="Non sono riuscito a riconoscere nulla"
          message="Prova con un'immagine più nitida o più rappresentativa (una scena chiave, una locandina, un volto)."
          icon="🤔"
        />
      ) : (
        <div className="space-y-10">
          {/* Titles */}
          {titles && titles.length > 0 && (
            <section>
              <h2 className="mb-4 font-display text-xl tracking-wide text-zinc-100">🎬 Titoli riconosciuti</h2>
              <div className="space-y-4">
                {titles.map((c, i) => (
                  <div key={i} className="flex gap-4 rounded-xl border border-theatre-800 bg-theatre-900/60 p-3">
                    <div className="h-28 w-20 shrink-0 overflow-hidden rounded-md bg-theatre-800">
                      {c.item && posterUrl(c.item.posterPath) ? (
                        <img src={posterUrl(c.item.posterPath)!} alt={c.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">🎞️</div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-zinc-100">
                        {c.item ? displayTitle(c.item) : c.title}
                        {c.year && <span className="text-zinc-500"> · {c.year}</span>}
                      </h3>
                      <p className="text-xs">
                        <span className={CONF_COLOR[c.confidence]}>Confidenza {c.confidence}</span>
                        <span className="text-zinc-500"> · {c.type === 'tv' ? 'Serie/Anime' : 'Film'}</span>
                      </p>
                      <p className="mt-1 text-sm text-zinc-400">{c.reason}</p>
                      {c.item && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Link to={`/title/${c.item.mediaType}/${c.item.id}`} className="btn-ghost px-3 py-1.5 text-xs">
                            Apri scheda
                          </Link>
                          {user &&
                            (added.has(c.item.id) ? (
                              <span className="inline-flex items-center px-3 py-1.5 text-xs text-projector">
                                ✓ In «Da vedere»
                              </span>
                            ) : (
                              <button onClick={() => c.item && addToWatchlist(c.item)} className="btn-primary px-3 py-1.5 text-xs">
                                🎟️ Aggiungi a Da vedere
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* People */}
          {people.length > 0 && (
            <section>
              <h2 className="mb-4 font-display text-xl tracking-wide text-zinc-100">🌟 Persone riconosciute</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {people.map((p, i) => {
                  const photo = p.person ? profileUrl(p.person.profilePath) : null
                  const person = p.person
                  const head = (
                    <>
                      <div className="mx-auto aspect-square w-full overflow-hidden rounded-full border border-theatre-700 bg-theatre-800">
                        {photo ? (
                          <img src={photo} alt={p.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">👤</div>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-1 text-sm font-semibold text-zinc-100">
                        {person?.name ?? p.name}
                      </p>
                      <p className={`text-xs ${CONF_COLOR[p.confidence]}`}>
                        {p.role ? p.role : 'persona'} · {p.confidence}
                      </p>
                      <p className="line-clamp-2 text-xs text-zinc-500">{p.reason}</p>
                    </>
                  )
                  return (
                    <div key={i} className="rounded-xl border border-theatre-800 bg-theatre-900 p-3 text-center">
                      {person ? (
                        <Link to={`/person/${person.id}`} className="group block transition hover:opacity-90">
                          {head}
                        </Link>
                      ) : (
                        head
                      )}
                      {person && user && (
                        <div className="mt-2 flex flex-col gap-1">
                          {savedPeople.has(person.id) ? (
                            <span className="text-xs text-projector">✓ Nei preferiti</span>
                          ) : (
                            <button
                              onClick={() => savePerson(person)}
                              className="btn-ghost w-full px-2 py-1 text-xs"
                            >
                              ❤️ Preferito
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
