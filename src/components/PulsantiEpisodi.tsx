import { sigla } from '../lib/videoteca'
import type { VoceStreaming } from '../lib/streaming'

// Nella barra del lettore, gli episodi accanto, sempre a portata: non solo «il
// prossimo» a fine episodio, ma anche tornare a quello prima.
export default function PulsantiEpisodi({
  precedente,
  prossimo,
  onPrecedente,
  onProssimo,
}: {
  precedente: VoceStreaming | null
  prossimo: VoceStreaming | null
  onPrecedente: () => void
  onProssimo: () => void
}) {
  return (
    <>
      {precedente && (
        <button
          type="button"
          onClick={onPrecedente}
          aria-label={`Episodio precedente: ${sigla(precedente) ?? ''}`}
          title={`Episodio precedente (${sigla(precedente) ?? ''}) · P`}
          className="rounded-md px-2 py-1 text-zinc-100 transition hover:bg-white/10"
        >
          ⏮
        </button>
      )}
      {prossimo && (
        <button
          type="button"
          onClick={onProssimo}
          aria-label={`Episodio successivo: ${sigla(prossimo) ?? ''}`}
          title={`Episodio successivo (${sigla(prossimo) ?? ''}) · N`}
          className="rounded-md px-2 py-1 text-zinc-100 transition hover:bg-white/10"
        >
          ⏭
        </button>
      )}
    </>
  )
}
