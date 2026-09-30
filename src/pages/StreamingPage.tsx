import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { logFailure } from '../lib/logFailure'
import {
  CARTELLA_CIAK,
  driveConfigurato,
  driveConnesso,
  driveDisconnetti,
  collegaDrive,
  elencaVideo,
  titoloVideo,
  type DriveVideo,
} from '../lib/googleDrive'

// Dimensione leggibile (i film sono grossi: MB/GB). `size` può mancare.
function taglia(bytes: number | null): string {
  if (!bytes) return ''
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(1).replace('.', ',')} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}

// «video/x-matroska» → «MKV»: il sottotipo MIME è poco leggibile.
function formato(mime: string): string {
  const sotto = mime.replace('video/', '')
  if (sotto === 'x-matroska') return 'MKV'
  if (sotto === 'x-msvideo') return 'AVI'
  if (sotto === 'quicktime') return 'MOV'
  return sotto.replace(/^x-/, '').toUpperCase()
}

export default function StreamingPage() {
  const navigate = useNavigate()
  const [connesso, setConnesso] = useState(driveConnesso())
  const [video, setVideo] = useState<DriveVideo[]>([])
  const [cartellaTrovata, setCartellaTrovata] = useState(true)
  const [caricato, setCaricato] = useState(false)
  const [caricando, setCaricando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const carica = useCallback(async () => {
    setErrore(null)
    setCaricando(true)
    try {
      const esito = await elencaVideo()
      setCartellaTrovata(esito.cartellaTrovata)
      setVideo(esito.video)
      setCaricato(true)
    } catch (e) {
      setErrore((e as Error).message)
      // Un 401 ha già dimenticato il token: torniamo a proporre il collegamento.
      setConnesso(driveConnesso())
    } finally {
      setCaricando(false)
    }
  }, [])

  // Già collegati (token ancora valido in questa scheda): elenco subito, senza
  // chiedere di nuovo il permesso.
  useEffect(() => {
    if (driveConfigurato() && driveConnesso()) void carica()
  }, [carica])

  async function collega() {
    setErrore(null)
    setCaricando(true)
    try {
      await collegaDrive()
      setConnesso(true)
    } catch (e) {
      setErrore((e as Error).message)
      logFailure('collegamento a Google Drive non riuscito')(e as Error)
      setCaricando(false)
      return
    }
    await carica()
  }

  function scollega() {
    driveDisconnetti()
    setConnesso(false)
    setVideo([])
    setCaricato(false)
  }

  // Senza Client ID configurato la funzione non esiste: lo diciamo invece di
  // mostrare un pulsante che non farebbe nulla.
  if (!driveConfigurato()) {
    return (
      <div>
        <PageHeader
          eyebrow="Streaming"
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
        eyebrow="Streaming"
        title="I miei film"
        subtitle={`I film nella cartella «${CARTELLA_CIAK}» del tuo Google Drive, in streaming senza scaricarli.`}
      >
        {connesso && (
          <div className="flex gap-2">
            <button onClick={carica} disabled={caricando} className="btn-ghost">
              🔄 Aggiorna
            </button>
            <button onClick={scollega} className="btn-ghost">
              Scollega
            </button>
          </div>
        )}
      </PageHeader>

      {errore && <ErrorState title="Qualcosa è andato storto" message={errore} />}

      {!connesso ? (
        <div className="rounded-2xl border border-dashed border-theatre-700 p-8 text-center">
          <p className="mb-4 text-zinc-400">
            Collega il tuo Google Drive per vedere qui i film della cartella «{CARTELLA_CIAK}» e
            riprodurli in streaming. La connessione è in sola lettura e i file restano su Drive.
          </p>
          <button onClick={collega} disabled={caricando} className="btn-primary">
            {caricando ? 'Collego…' : '📁 Collega Google Drive'}
          </button>
        </div>
      ) : caricando && !caricato ? (
        <Loader />
      ) : !cartellaTrovata ? (
        <EmptyState
          title={`Nessuna cartella «${CARTELLA_CIAK}» su Drive`}
          message={`Crea una cartella chiamata «${CARTELLA_CIAK}» in «Il mio Drive», mettici dentro i film (anche in sottocartelle) e premi «Aggiorna».`}
          icon="📂"
        />
      ) : caricato && video.length === 0 ? (
        <EmptyState
          title={`La cartella «${CARTELLA_CIAK}» è vuota`}
          message="Non ho trovato video. Se li stai ancora caricando con Google Drive per desktop, attendi la fine del caricamento e premi «Aggiorna»."
          icon="🎞️"
        />
      ) : (
        <ul className="divide-y divide-theatre-800 rounded-2xl border border-theatre-800 bg-theatre-900/40">
          {video.map((v) => (
            <li key={v.id}>
              <button
                onClick={() =>
                  navigate(`/streaming/${v.id}`, { state: { titolo: titoloVideo(v), file: v.name } })
                }
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-theatre-800/60"
              >
                <span className="text-xl">🎬</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-100">
                    {titoloVideo(v)}
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    {formato(v.mimeType)}
                    {taglia(v.size) && ` · ${taglia(v.size)}`}
                    {v.cartella && ` · ${v.name}`}
                  </span>
                </span>
                <span className="shrink-0 text-projector">▶ Guarda</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
