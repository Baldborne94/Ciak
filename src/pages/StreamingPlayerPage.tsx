import { Link, useLocation, useParams } from 'react-router-dom'
import { ErrorState } from '../components/States'
import { anteprimaUrl, apriSuDriveUrl, idDriveValido } from '../lib/googleDrive'

// Il player a tutta larghezza (il modale di prima era troppo stretto). Riproduce
// col lettore di Google Drive: streaming, qualità e conversione al volo degli MKV
// le fa Google, e non serve un token — basta la sessione Google del browser.
export default function StreamingPlayerPage() {
  const { fileId = '' } = useParams()
  const stato = useLocation().state as { titolo?: string; file?: string } | null
  const titolo = stato?.titolo ?? 'Film'

  const indietro = (
    <Link to="/streaming" className="text-sm text-zinc-400 transition hover:text-projector">
      ← Torna ai film
    </Link>
  )

  if (!idDriveValido(fileId)) {
    return (
      <div className="space-y-4">
        {indietro}
        <ErrorState title="Film non trovato" message="L'indirizzo di questo film non è valido." />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {indietro}
      <div>
        <h1 className="font-display text-3xl tracking-wide text-zinc-100">{titolo}</h1>
        {stato?.file && stato.file !== titolo && (
          <p className="mt-1 truncate text-xs text-zinc-500">{stato.file}</p>
        )}
      </div>

      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-reel">
        <iframe
          title={titolo}
          src={anteprimaUrl(fileId)}
          allow="autoplay; fullscreen"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>

      <div className="grid gap-3 text-sm text-zinc-400 sm:grid-cols-2">
        <div className="rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
          <p className="mb-1 font-medium text-zinc-200">📺 Guardarlo al meglio</p>
          <p>
            Usa ⛶ per lo schermo intero e l'ingranaggio ⚙ per la qualità. I file appena caricati
            possono restare a bassa qualità finché Google non ha finito di elaborarli.
          </p>
        </div>
        <div className="rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
          <p className="mb-1 font-medium text-zinc-200">💬 Sottotitoli</p>
          <p>
            Il lettore di Drive mostra i sottotitoli caricati sul file: apri il film su Drive, poi
            ⋮ → <em>Gestisci tracce dei sottotitoli</em> → aggiungi il file <code>.srt</code>. Qui li
            attivi col pulsante CC.{' '}
            <a
              href={apriSuDriveUrl(fileId)}
              target="_blank"
              rel="noreferrer"
              className="text-projector hover:underline"
            >
              Apri su Drive ↗
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
