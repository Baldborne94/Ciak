import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'

export default function InProgress() {
  return (
    <div>
      <PageHeader
        eyebrow="Le tue liste"
        title="In corso"
        subtitle="Serie e anime che stai guardando in questo momento."
      />
      <EmptyState
        icon="📺"
        title="Niente in corso"
        message="I titoli segnati come «In corso» appariranno qui. Collegamento a Supabase nella Fase 3."
      />
    </div>
  )
}
