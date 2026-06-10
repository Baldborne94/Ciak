import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'

export default function Recommendations() {
  return (
    <div>
      <PageHeader
        eyebrow="Il critico personale"
        title="Suggerimenti AI"
        subtitle="L'AI analizza i tuoi preferiti e i titoli visti per consigliarti cosa guardare, con una spiegazione su misura."
      >
        <button className="btn-gold" disabled title="Disponibile nella Fase 6">
          ✨ Genera suggerimenti
        </button>
      </PageHeader>
      <EmptyState
        icon="🤖"
        title="Il critico è ancora dietro le quinte"
        message="Le raccomandazioni intelligenti basate su Anthropic arriveranno nella Fase 6. Verranno generate on-demand leggendo i tuoi gusti da Supabase."
      />
    </div>
  )
}
