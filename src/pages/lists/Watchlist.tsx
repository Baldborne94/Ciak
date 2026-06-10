import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'

export default function Watchlist() {
  return (
    <div>
      <PageHeader
        eyebrow="Le tue liste"
        title="Da vedere"
        subtitle="La tua watchlist: i titoli che aspettano il loro turno in sala."
      />
      <EmptyState
        icon="🍿"
        title="Watchlist vuota"
        message="Aggiungi titoli alla lista «Da vedere» dalla scheda dettaglio. Collegamento a Supabase nella Fase 3."
      />
    </div>
  )
}
