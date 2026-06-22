import { useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import TonightTool from '../components/TonightTool'
import SongSearch from '../components/SongSearch'
import ImageIdentify from '../components/ImageIdentify'
import AiCreditsNote from '../components/AiCreditsNote'

type Tab = 'tonight' | 'song' | 'image'

const TABS: { value: Tab; label: string; icon: string }[] = [
  { value: 'tonight', label: 'Stasera', icon: '🌙' },
  { value: 'song', label: 'Canzone', icon: '🎵' },
  { value: 'image', label: 'Foto', icon: '📷' },
]

// Hub unico degli strumenti AI: Stasera (cosa vedere), Canzone (film con un
// brano) e Foto (riconosci un titolo da un'immagine). Prima erano sparsi tra
// una pagina dedicata e le schede di Cerca; ora vivono tutti qui.
export default function AiToolsPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : 'tonight'

  function switchTab(t: Tab) {
    const next = new URLSearchParams(params)
    next.set('tab', t)
    setParams(next)
  }

  return (
    <div>
      <PageHeader
        eyebrow="✨ Strumenti AI"
        title="Il tuo assistente cinefilo"
        subtitle="Fatti consigliare cosa vedere stasera, scopri in quali film c'è una canzone o riconosci un titolo da una foto."
      />

      <div className="mb-8 flex items-stretch gap-1 overflow-x-auto border-b border-theatre-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => switchTab(t.value)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition ${
              tab === t.value
                ? 'border-projector text-projector'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'tonight' && <TonightTool />}
      {tab === 'song' && <SongSearch />}
      {tab === 'image' && (
        <>
          <AiCreditsNote className="mb-4" />
          <ImageIdentify />
        </>
      )}
    </div>
  )
}
