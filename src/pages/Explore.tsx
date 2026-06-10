import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { ErrorState, Loader } from '../components/States'
import {
  getGenres,
  searchPerson,
  searchCompany,
  profileUrl,
  logoUrl,
  isTmdbConfigured,
} from '../lib/tmdb'
import type { Genre, Person, Company, TmdbType } from '../lib/types'

type Tab = 'genres' | 'actors' | 'studios'

const TABS: { value: Tab; label: string; icon: string }[] = [
  { value: 'genres', label: 'Generi', icon: '🎭' },
  { value: 'actors', label: 'Attori', icon: '🌟' },
  { value: 'studios', label: 'Studi', icon: '🏛️' },
]

function GenresTab() {
  const [type, setType] = useState<TmdbType>('movie')
  const [genres, setGenres] = useState<Genre[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isTmdbConfigured) {
      setError('Configura VITE_TMDB_API_KEY per esplorare i generi.')
      setLoading(false)
      return
    }
    setLoading(true)
    getGenres(type)
      .then(setGenres)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [type])

  return (
    <div>
      <div className="mb-6 flex gap-1">
        {(['movie', 'tv'] as TmdbType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded-md px-4 py-2 text-sm transition ${
              type === t
                ? 'bg-projector text-theatre-950'
                : 'bg-theatre-800 text-zinc-300 hover:bg-theatre-700'
            }`}
          >
            {t === 'movie' ? 'Film' : 'Serie TV'}
          </button>
        ))}
      </div>

      {loading ? (
        <Loader label="Carico i generi…" />
      ) : error ? (
        <ErrorState title="Generi non disponibili" message={error} />
      ) : (
        <div className="flex flex-wrap gap-3">
          {genres.map((g) => (
            <Link
              key={g.id}
              to={`/genre/${type}/${g.id}`}
              className="rounded-xl border border-theatre-700 bg-theatre-900/60 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:-translate-y-0.5 hover:border-projector/40 hover:text-projector"
            >
              {g.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function ActorsTab() {
  const [input, setInput] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      setResults(await searchPerson(input))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="mb-6 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Cerca un attore o regista… (es. Al Pacino)"
          className="input-cine"
        />
        <button type="submit" className="btn-primary whitespace-nowrap">
          🔍 Cerca
        </button>
      </form>

      {loading ? (
        <Loader label="Cerco tra le star…" />
      ) : error ? (
        <ErrorState title="Ricerca non riuscita" message={error} />
      ) : searched && results.length === 0 ? (
        <p className="text-zinc-500">Nessuna persona trovata.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {results.map((p) => {
            const photo = profileUrl(p.profilePath)
            return (
              <Link
                key={p.id}
                to={`/person/${p.id}`}
                className="group rounded-xl border border-theatre-800 bg-theatre-900 p-3 text-center transition hover:-translate-y-1 hover:border-projector/40"
              >
                <div className="mx-auto aspect-square w-full overflow-hidden rounded-full border border-theatre-700 bg-theatre-800">
                  {photo ? (
                    <img
                      src={photo}
                      alt={p.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">
                      👤
                    </div>
                  )}
                </div>
                <p className="mt-2 line-clamp-1 text-sm font-semibold text-zinc-100">
                  {p.name}
                </p>
                {p.knownFor && (
                  <p className="line-clamp-1 text-xs text-zinc-500">{p.knownFor}</p>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StudiosTab() {
  const [input, setInput] = useState('')
  const [results, setResults] = useState<Company[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      setResults(await searchCompany(input))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="mb-6 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Cerca uno studio… (es. Pixar, A24, Studio Ghibli)"
          className="input-cine"
        />
        <button type="submit" className="btn-primary whitespace-nowrap">
          🔍 Cerca
        </button>
      </form>

      {loading ? (
        <Loader label="Cerco gli studi…" />
      ) : error ? (
        <ErrorState title="Ricerca non riuscita" message={error} />
      ) : searched && results.length === 0 ? (
        <p className="text-zinc-500">Nessuno studio trovato.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {results.map((c) => {
            const logo = logoUrl(c.logoPath)
            return (
              <Link
                key={c.id}
                to={`/studio/${c.id}`}
                className="group flex h-28 flex-col items-center justify-center gap-2 rounded-xl border border-theatre-800 bg-theatre-900 p-4 text-center transition hover:-translate-y-1 hover:border-projector/40"
              >
                {logo ? (
                  <img
                    src={logo}
                    alt={c.name}
                    loading="lazy"
                    className="max-h-12 max-w-full bg-white/90 px-2 py-1"
                  />
                ) : (
                  <span className="text-3xl opacity-40">🏛️</span>
                )}
                <p className="line-clamp-1 text-sm font-medium text-zinc-200">
                  {c.name}
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Explore() {
  const [tab, setTab] = useState<Tab>('genres')

  return (
    <div>
      <PageHeader
        eyebrow="Catalogo"
        title="Esplora"
        subtitle="Sfoglia per genere, scopri la filmografia di un attore o tutti i titoli di uno studio."
      />

      <div className="mb-8 flex gap-2 border-b border-theatre-800">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition ${
              tab === t.value
                ? 'border-projector text-projector'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'genres' && <GenresTab />}
      {tab === 'actors' && <ActorsTab />}
      {tab === 'studios' && <StudiosTab />}
    </div>
  )
}
