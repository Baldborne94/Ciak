import { Link } from 'react-router-dom'
import { etichettaGuarda, fileDaGuardare, titoloDaMostrare, type VoceStreaming } from '../lib/streaming'
import type { TmdbType } from '../lib/types'

// «▶ Guarda ora»: dal titolo dell'archivio al suo file nella videoteca. Non
// compare se il titolo non ha file — un pulsante che non porta a niente è
// peggio di nessun pulsante.
export default function GuardaOra({
  videoteca,
  tmdbId,
  mediaType,
  episodio,
  grande = false,
}: {
  videoteca: VoceStreaming[]
  tmdbId: number
  mediaType: TmdbType
  episodio?: { stagione: number; episodio: number }
  grande?: boolean
}) {
  const voce = fileDaGuardare(videoteca, tmdbId, mediaType, episodio)
  if (!voce) return null
  return (
    <Link
      to={`/streaming/${voce.drive_file_id}`}
      state={{ titolo: titoloDaMostrare(voce) ?? undefined, file: voce.nome_file ?? undefined }}
      className={grande ? 'btn-primary' : 'btn-primary block w-full py-1.5 text-center text-sm'}
    >
      {etichettaGuarda(voce)}
    </Link>
  )
}
