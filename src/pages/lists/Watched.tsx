import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'

export default function Watched() {
  return (
    <div>
      <PageHeader
        eyebrow="Le tue liste"
        title="Visti"
        subtitle="Tutti i titoli che hai già guardato."
      />
      <EmptyState
        icon="🎟️"
        title="Ancora nessun titolo visto"
        message="Quando segnerai un titolo come «Visto» comparirà qui. Collegheremo questa lista a Supabase nella Fase 3."
      />
    </div>
  )
}
