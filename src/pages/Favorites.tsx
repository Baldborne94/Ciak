import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'

export default function Favorites() {
  return (
    <div>
      <PageHeader
        eyebrow="Il meglio del tuo caveau"
        title="Preferiti"
        subtitle="I titoli che ami, con il tuo voto personale e le tue note. Ordinabili per voto, data di visione e anno."
      />
      <EmptyState
        icon="⭐"
        title="Nessun preferito… per ora"
        message="Contrassegna un titolo come preferito, assegna un voto da 1 a 5 stelle e scrivi le tue note. Tutto nella Fase 4."
      />
    </div>
  )
}
