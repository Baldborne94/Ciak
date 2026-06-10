import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import SavedTitleCard from '../components/SavedTitleCard'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { useAuth } from '../lib/auth'
import { listByStatus } from '../lib/userTitles'
import { STATUS_LABELS, type TitleStatus, type UserTitle } from '../lib/types'

const COPY: Record<TitleStatus, { subtitle: string; icon: string }> = {
  watched: { subtitle: 'Tutti i titoli che hai già guardato.', icon: '✅' },
  to_watch: {
    subtitle: 'La tua watchlist: cosa guardare alla prossima serata.',
    icon: '🎟️',
  },
  in_progress: {
    subtitle: 'Serie e anime che stai seguendo in questo momento.',
    icon: '▶️',
  },
  abandoned: { subtitle: 'Titoli iniziati ma lasciati a metà.', icon: '🚪' },
}

export default function ListPage({ status }: { status: TitleStatus }) {
  const { user } = useAuth()
  const copy = COPY[status]
  const [items, setItems] = useState<UserTitle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    setError(null)
    listByStatus(user.id, status)
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [user, status])

  return (
    <div>
      <PageHeader
        eyebrow="Le tue liste"
        title={STATUS_LABELS[status]}
        subtitle={copy.subtitle}
      />

      {loading ? (
        <Loader label="Apro la tua collezione…" />
      ) : error ? (
        <ErrorState title="Impossibile caricare la lista" message={error} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Lista ancora vuota"
          message="Apri la scheda di un titolo e assegnagli questo stato per vederlo qui."
          icon={copy.icon}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((record) => (
            <SavedTitleCard key={record.id} record={record} />
          ))}
        </div>
      )}
    </div>
  )
}
