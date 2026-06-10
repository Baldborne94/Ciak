import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import MediaGrid from '../components/MediaGrid'
import { ErrorState, Loader } from '../components/States'
import { getPersonDetail, profileUrl, isTmdbConfigured } from '../lib/tmdb'
import type { PersonDetail } from '../lib/types'

function calcAge(birthday: string): number {
  const diff = Date.now() - new Date(birthday).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
}

export default function PersonPage() {
  const { id } = useParams<{ id: string }>()
  const [person, setPerson] = useState<PersonDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    if (!isTmdbConfigured) {
      setError('Configura VITE_TMDB_API_KEY per vedere i profili.')
      setLoading(false)
      return
    }
    setLoading(true)
    getPersonDetail(Number(id))
      .then(setPerson)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <Loader label="Carico il profilo…" />
  if (error) return <ErrorState title="Profilo non disponibile" message={error} />
  if (!person) return null

  const photo = profileUrl(person.profilePath)

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="w-40 flex-shrink-0 sm:w-52">
          {photo ? (
            <img
              src={photo}
              alt={person.name}
              className="w-full rounded-xl border border-theatre-700 shadow-reel"
            />
          ) : (
            <div className="flex aspect-[2/3] items-center justify-center rounded-xl bg-theatre-800 text-5xl">
              👤
            </div>
          )}
        </div>

        <div className="flex-1">
          <h1 className="font-display text-4xl tracking-wide text-zinc-100 sm:text-5xl">
            {person.name}
          </h1>
          {person.knownFor && (
            <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-projector/80">
              {person.knownFor}
            </p>
          )}

          <div className="mt-4 space-y-1 text-sm text-zinc-400">
            {person.birthday && (
              <p>
                🎂 {new Date(person.birthday).toLocaleDateString('it-IT')}
                {' '}({calcAge(person.birthday)} anni)
              </p>
            )}
            {person.placeOfBirth && <p>📍 {person.placeOfBirth}</p>}
          </div>

          {person.biography && (
            <p className="mt-5 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-zinc-300 line-clamp-[12]">
              {person.biography}
            </p>
          )}
        </div>
      </div>

      {person.credits.length > 0 && (
        <section>
          <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">
            🎬 Filmografia ({person.credits.length})
          </h2>
          <MediaGrid items={person.credits} />
        </section>
      )}

      <Link
        to="/explore"
        className="inline-block text-sm text-projector/80 hover:text-projector"
      >
        ← Torna a Esplora
      </Link>
    </div>
  )
}
