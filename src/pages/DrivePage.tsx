import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { logFailure } from '../lib/logFailure'
import {
  driveConfigurato,
  driveConnesso,
  collegaDrive,
  elencaVideo,
  anteprimaUrl,
  type DriveVideo,
} from '../lib/googleDrive'

// Dimensione leggibile (i film sono grossi: MB/GB). `size` può mancare.
function taglia(bytes: number | null): string {
  if (!bytes) return ''
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(1).replace('.', ',')} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}

export default function DrivePage() {
  const [connesso, setConnesso] = useState(driveConnesso())
  const [videos, setVideos] = useState<DriveVideo[]>([])
  const [caricando, setCaricando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  // Il film aperto nel player (anteprima di Google in un iframe).
  const [inRiproduzione, setInRiproduzione] = useState<DriveVideo | null>(null)

  async function collega() {
    setErrore(null)
    setCaricando(true)
    try {
      await collegaDrive()
      setConnesso(true)
      setVideos(await elencaVideo())
    } catch (e) {
      setErrore((e as Error).message)
      logFailure('collegamento a Google Drive non riuscito')(e as Error)
    } finally {
      setCaricando(false)
    }
  }

  async function ricarica() {
    setErrore(null)
    setCaricando(true)
    try {
      setVideos(await elencaVideo())
    } catch (e) {
      setErrore((e as Error).message)
    } finally {
      setCaricando(false)
    }
  }

  // Senza Client ID configurato la funzione non esiste: lo diciamo invece di
  // mostrare un pulsante che non farebbe nulla.
  if (!driveConfigurato()) {
    return (
      <div>
        <PageHeader
          eyebrow="Google Drive"
          title="I miei film"
          subtitle="Guarda in streaming i film che tieni su Google Drive, senza scaricarli."
        />
        <EmptyState
          title="Funzione non ancora configurata"
          message="Manca il collegamento a Google Drive (Client ID OAuth). Una volta configurato, qui compariranno i tuoi film."
          icon="🔌"
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Google Drive"
        title="I miei film"
        subtitle="Guarda in streaming i film che tieni su Google Drive, senza scaricarli in locale."
      >
        {connesso && (
          <button onClick={ricarica} disabled={caricando} className="btn-ghost">
            🔄 Aggiorna
          </button>
        )}
      </PageHeader>

      {errore && <ErrorState title="Qualcosa è andato storto" message={errore} />}

      {!connesso ? (
        <div className="rounded-2xl border border-dashed border-theatre-700 p-8 text-center">
          <p className="mb-4 text-zinc-400">
            Collega il tuo Google Drive per vedere qui i tuoi film e riprodurli in streaming. La
            connessione è in sola lettura e i file restano su Drive.
          </p>
          <button onClick={collega} disabled={caricando} className="btn-primary">
            {caricando ? 'Collego…' : '📁 Collega Google Drive'}
          </button>
        </div>
      ) : caricando && videos.length === 0 ? (
        <Loader />
      ) : videos.length === 0 ? (
        <EmptyState
          title="Nessun film su Drive"
          message="Non ho trovato file video nel tuo Google Drive. Carica un film (meglio in MP4) e premi «Aggiorna»."
          icon="🎞️"
        />
      ) : (
        <ul className="divide-y divide-theatre-800 rounded-2xl border border-theatre-800 bg-theatre-900/40">
          {videos.map((v) => (
            <li key={v.id}>
              <button
                onClick={() => setInRiproduzione(v)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-theatre-800/60"
              >
                <span className="text-xl">🎬</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-100">{v.name}</span>
                  <span className="block text-xs text-zinc-500">
                    {v.mimeType.replace('video/', '').toUpperCase()}
                    {taglia(v.size) && ` · ${taglia(v.size)}`}
                  </span>
                </span>
                <span className="shrink-0 text-projector">▶ Guarda</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {inRiproduzione && (
        <Modal title={inRiproduzione.name} onClose={() => setInRiproduzione(null)}>
          <div className="aspect-video w-[min(90vw,64rem)] overflow-hidden rounded-lg bg-black">
            <iframe
              title={inRiproduzione.name}
              src={anteprimaUrl(inRiproduzione.id)}
              allow="autoplay; fullscreen"
              allowFullScreen
              className="h-full w-full border-0"
            />
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            In streaming da Google Drive. Se un formato non parte (es. MKV/AVI), il lettore di Drive
            non lo supporta: gli MP4 (H.264) sono i più affidabili.
          </p>
        </Modal>
      )}
    </div>
  )
}
