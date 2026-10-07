import { posterUrl } from '../lib/tmdb'
import { taglia } from '../lib/filmOffline'
import type { DriveVideo } from '../lib/googleDrive'
import type { VoceStreaming } from '../lib/streaming'

// «video/x-matroska» → «MKV»: il sottotipo MIME è poco leggibile.
function formato(mime: string): string {
  const sotto = mime.replace('video/', '')
  if (sotto === 'x-matroska') return 'MKV'
  if (sotto === 'x-msvideo') return 'AVI'
  if (sotto === 'quicktime') return 'MOV'
  return sotto.replace(/^x-/, '').toUpperCase()
}

// Un film della videoteca: locandina, titolo, file e avanzamento, con «▶
// Guarda» e ✎ per scegliere il titolo. Lo stesso nell'elenco e dentro la
// cartella di una saga.
export default function FilmVideoteca({
  video,
  voce,
  nome,
  anno,
  scaricato,
  onApri,
  onScegli,
}: {
  video: DriveVideo
  voce: VoceStreaming | undefined
  nome: string
  anno: string | null
  scaricato: boolean
  onApri: () => void
  onScegli: () => void
}) {
  const avanzamento = voce?.durata ? Math.min(1, voce.posizione / voce.durata) : 0
  const daRiprendere = avanzamento > 0.02 && !voce?.visto_il
  return (
    <div className="flex items-center">
      <button onClick={onApri} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition hover:bg-theatre-800/60">
        {voce?.poster_path ? (
          <img src={posterUrl(voce.poster_path, 'w185') ?? undefined} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded object-cover" />
        ) : (
          <span className="flex h-14 w-10 shrink-0 items-center justify-center text-xl">{scaricato ? '📱' : '🎬'}</span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-zinc-100">{nome}</span>
          <span className="block truncate text-xs text-zinc-500">
            {anno && `${anno} · `}
            {voce?.visto_il && '✓ Visto · '}
            {scaricato && 'Offline · '}
            {formato(video.mimeType)}
            {taglia(video.size) && ` · ${taglia(video.size)}`}
            {` · ${video.name}`}
          </span>
          {daRiprendere && (
            <span className="mt-1 block h-1 overflow-hidden rounded bg-theatre-800" aria-hidden="true">
              <span className="block h-full bg-projector" style={{ width: `${Math.round(avanzamento * 100)}%` }} />
            </span>
          )}
        </span>
        <span className="shrink-0 text-projector">{daRiprendere ? '▶ Riprendi' : '▶ Guarda'}</span>
      </button>
      <button
        type="button"
        onClick={onScegli}
        // Senza il titolo nel nome: chi cerca la riga del film trova la riga.
        aria-label="Scegli il titolo"
        title={voce?.tmdb_id ? 'Non è questo? Scegli il titolo' : 'Scegli il titolo'}
        className="shrink-0 px-3 py-3 text-zinc-500 transition hover:text-projector"
      >
        ✎
      </button>
    </div>
  )
}
