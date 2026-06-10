import { useQuery } from '@tanstack/react-query'
import { getTrending } from '@/lib/tmdb'
import PageHeader from '@/components/PageHeader'
import TitleGrid from '@/components/TitleGrid'
import Spinner from '@/components/Spinner'
import EmptyState from '@/components/EmptyState'

// Statistiche personali: placeholder finché non colleghiamo Supabase (Fase 5).
const STATS = [
  { label: 'Titoli visti', value: '—', icon: '🎟️' },
  { label: 'Ore di visione', value: '—', icon: '⏱️' },
  { label: 'Genere top', value: '—', icon: '🎭' },
  { label: 'Preferiti', value: '—', icon: '⭐' },
]

export default function Dashboard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['trending'],
    queryFn: getTrending,
  })

  return (
    <div>
      <PageHeader
        eyebrow="Benvenuto in sala"
        title="Cosa si proietta oggi"
        subtitle="I titoli del momento da tutto il mondo, più il riepilogo del tuo caveau personale."
      />

      {/* Statistiche personali */}
      <section className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="panel flex items-center gap-3 px-4 py-4">
            <span className="text-2xl" aria-hidden>{s.icon}</span>
            <div>
              <div className="title-display text-2xl text-gold">{s.value}</div>
              <div className="text-xs uppercase tracking-wide text-zinc-500">{s.label}</div>
            </div>
          </div>
        ))}
      </section>

      {/* Scopri oggi: trending TMDB */}
      <section>
        <h2 className="title-display mb-4 flex items-center gap-2 text-2xl text-white">
          <span aria-hidden>🔥</span> Scopri oggi
        </h2>

        {isLoading && <Spinner />}

        {isError && (
          <EmptyState
            icon="🎬"
            title="Proiezione interrotta"
            message={
              error instanceof Error
                ? error.message
                : 'Impossibile recuperare i titoli di tendenza da TMDB.'
            }
          />
        )}

        {data && data.length > 0 && <TitleGrid titles={data} />}
      </section>
    </div>
  )
}
