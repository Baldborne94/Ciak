import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { isSupabaseConfigured } from '../lib/supabase'
import { tmdbConfigurato } from '../lib/tmdb'
import { useAuth } from '../lib/auth'
import {
  disablePush,
  enablePush,
  isPushEnabled,
  pushConfigured,
  pushSupported,
  sendTestNotification,
} from '../lib/push'
import {
  esportaTutto,
  nomeFileEsportazione,
  riassuntoEsportazione,
} from '../lib/exportData'
import { leggiErrori, cancellaErrori, type ErroreRegistrato } from '../lib/errorLog'
import { backfillGenreIds, type EsitoBackfill } from '../lib/userTitles'

function quando(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Il diario degli errori, guardabile senza aprire la console né il SQL Editor.
// È il punto di tutta la funzione: un errore che nessuno legge non è diverso
// da un errore ingoiato.
function DiagnosticaSettings() {
  const { user } = useAuth()
  const [errori, setErrori] = useState<ErroreRegistrato[] | null>(null)
  const [aperto, setAperto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ricarica = useCallback(async () => {
    if (!user) return
    setBusy(true)
    try {
      setErrori(await leggiErrori(user.id))
    } catch {
      setErrori([])
    } finally {
      setBusy(false)
    }
  }, [user])

  useEffect(() => {
    void ricarica()
  }, [ricarica])

  return (
    <section className="rounded-xl border border-theatre-800 bg-theatre-900/60 p-5 md:col-span-2">
      <h2 className="mb-3 font-display text-xl tracking-wide text-zinc-100">🩺 Diagnostica</h2>
      {!user ? (
        <p className="text-sm text-zinc-400">Accedi per vedere gli errori registrati.</p>
      ) : (
        <>
          <p className="text-sm text-zinc-400">
            Gli errori che l'app incontra senza interromperti finiscono qui, oltre che nella
            console. Se qualcosa &laquo;sparisce&raquo; senza spiegazione, di solito la
            spiegazione è in questo elenco.
          </p>

          {errori === null ? (
            <p className="mt-4 text-xs text-zinc-500">Carico…</p>
          ) : errori.length === 0 ? (
            <p className="mt-4 text-sm text-emerald-400">Nessun errore registrato. 🎉</p>
          ) : (
            <ul className="mt-4 divide-y divide-theatre-800 text-sm">
              {errori.map((e) => (
                <li key={e.id} className="py-2">
                  <button
                    onClick={() => setAperto(aperto === e.id ? null : e.id)}
                    aria-expanded={aperto === e.id}
                    className="flex w-full items-baseline justify-between gap-3 text-left"
                  >
                    <span className="text-zinc-200">
                      <span className="text-curtain-light">{e.contesto}</span> — {e.messaggio}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">{quando(e.created_at)}</span>
                  </button>
                  {aperto === e.id && (
                    <div className="mt-2 space-y-1 text-xs text-zinc-500">
                      {e.percorso && <p>Pagina: {e.percorso}</p>}
                      {e.dettaglio && (
                        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-theatre-950/60 p-2">
                          {e.dettaglio}
                        </pre>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => void ricarica()} disabled={busy} className="btn-ghost">
              ↻ Aggiorna
            </button>
            {errori && errori.length > 0 && (
              <button
                onClick={async () => {
                  setBusy(true)
                  try {
                    await cancellaErrori(user.id)
                    setErrori([])
                  } finally {
                    setBusy(false)
                  }
                }}
                disabled={busy}
                className="btn-ghost"
              >
                🗑️ Svuota
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}

// I generi mancano sui titoli salvati prima che venissero registrati: senza,
// spariscono dal filtro per genere del diario e dai «Generi preferiti» delle
// statistiche. Il recupero c'era già ma girava di nascosto, una volta sola per
// browser: se a metà strada TMDB non rispondeva, nessuno lo sapeva e non si
// riprovava più. Qui si vede, si lancia e si legge com'è andata.
function GeneriSettings() {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [avanzamento, setAvanzamento] = useState<{ fatti: number; totale: number } | null>(null)
  const [esito, setEsito] = useState<EsitoBackfill | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  async function completa() {
    if (!user) return
    setBusy(true)
    setEsito(null)
    setErrore(null)
    setAvanzamento({ fatti: 0, totale: 0 })
    try {
      setEsito(
        await backfillGenreIds(user.id, (fatti, totale) => setAvanzamento({ fatti, totale })),
      )
    } catch (e) {
      setErrore((e as Error).message)
    } finally {
      setBusy(false)
      setAvanzamento(null)
    }
  }

  return (
    <section className="rounded-xl border border-theatre-800 bg-theatre-900/60 p-5">
      <h2 className="mb-3 font-display text-xl tracking-wide text-zinc-100">🎭 Generi dei titoli</h2>
      {!user ? (
        <p className="text-sm text-zinc-400">Accedi per completare i generi della tua collezione.</p>
      ) : (
        <>
          <p className="text-sm text-zinc-400">
            I titoli salvati prima che i generi venissero registrati non compaiono nel filtro per
            genere del diario né nelle statistiche. Questo li ricontrolla su TMDB e li completa.
          </p>
          <div className="mt-4">
            <button onClick={completa} disabled={busy} className="btn-primary">
              {busy ? 'Controllo…' : '🎭 Completa i generi mancanti'}
            </button>
          </div>
          {avanzamento && avanzamento.totale > 0 && (
            <p className="mt-3 text-xs text-zinc-400" role="status">
              {avanzamento.fatti} di {avanzamento.totale}…
            </p>
          )}
          {esito && (
            <p className="mt-3 text-xs text-projector" role="status">
              {esito.daFare === 0
                ? 'Tutti i titoli hanno già i loro generi. 🎉'
                : `Completati ${esito.aggiornati} titoli su ${esito.daFare}.`}
              {esito.falliti > 0 &&
                ` ${esito.falliti} non hanno generi su TMDB o non hanno risposto: riprova più tardi.`}
            </p>
          )}
          {errore && <p className="mt-3 text-xs text-curtain-light">{errore}</p>}
        </>
      )}
    </section>
  )
}

function BackupSettings() {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  async function scarica() {
    if (!user) return
    setBusy(true)
    setMsg(null)
    setErrore(null)
    try {
      const dati = await esportaTutto({ id: user.id, email: user.email ?? null })
      // Il file nasce e muore nel browser: nessun server intermedio vede i
      // dati, che è il minimo per un backup personale.
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(dati, null, 2)], { type: 'application/json' }),
      )
      const a = document.createElement('a')
      a.href = url
      a.download = nomeFileEsportazione()
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Revoca rimandata: se si libera l'URL nello stesso giro dell'evento, il
      // browser può trovarselo già morto mentre avvia il salvataggio.
      setTimeout(() => URL.revokeObjectURL(url), 0)
      setMsg(riassuntoEsportazione(dati))
    } catch (e) {
      setErrore((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-theatre-800 bg-theatre-900/60 p-5">
      <h2 className="mb-3 font-display text-xl tracking-wide text-zinc-100">💾 Backup dei tuoi dati</h2>
      {!user ? (
        <p className="text-sm text-zinc-400">Accedi per scaricare una copia del tuo archivio.</p>
      ) : (
        <>
          <p className="text-sm text-zinc-400">
            Voti, diario, liste, preferiti ed episodi visti in un unico file JSON. È l'unica parte
            di Ciak che non si può ricostruire da TMDB: tienine una copia tua.
          </p>
          <div className="mt-4">
            <button onClick={scarica} disabled={busy} className="btn-primary">
              {busy ? 'Raccolgo i dati…' : '⬇️ Scarica tutto'}
            </button>
          </div>
          {msg && <p className="mt-3 text-xs text-projector">Scaricato: {msg}</p>}
          {errore && <p className="mt-3 text-xs text-curtain-light">{errore}</p>}
        </>
      )}
    </section>
  )
}

// `ok === null` = non lo sappiamo ancora. Serve per il catalogo, la cui chiave
// vive sul server: dal browser lo stato si scopre chiedendo, non leggendo una
// variabile del bundle.
function StatusRow({ label, ok }: { label: string; ok: boolean | null }) {
  const testo = ok === null ? 'Verifico…' : ok ? 'Connesso' : 'Non configurato'
  const stile =
    ok === null
      ? 'bg-theatre-800 text-zinc-400'
      : ok
        ? 'bg-green-500/15 text-green-400'
        : 'bg-curtain/20 text-curtain-light'
  return (
    <div className="flex items-center justify-between border-b border-theatre-800 py-3 last:border-0">
      <span className="text-sm text-zinc-300">{label}</span>
      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${stile}`}>{testo}</span>
    </div>
  )
}

function IntegrationsSettings() {
  const [tmdbOk, setTmdbOk] = useState<boolean | null>(null)

  useEffect(() => {
    let annullato = false
    tmdbConfigurato().then((ok) => {
      if (!annullato) setTmdbOk(ok)
    })
    return () => {
      annullato = true
    }
  }, [])

  return (
    <section className="rounded-xl border border-theatre-800 bg-theatre-900/60 p-5">
      <h2 className="mb-3 font-display text-xl tracking-wide text-zinc-100">🔌 Integrazioni</h2>
      <StatusRow label="TMDB (catalogo)" ok={tmdbOk} />
      <StatusRow label="Supabase (dati personali)" ok={isSupabaseConfigured} />
      <p className="mt-3 text-xs text-zinc-500">
        Imposta le chiavi nel file <code className="text-projector/80">.env</code>{' '}
        (vedi <code className="text-projector/80">.env.example</code>). La chiave TMDB sta{' '}
        <strong>solo</strong> lato server, come quella di Anthropic: il browser passa da{' '}
        <code className="text-projector/80">/api/tmdb</code>.
      </p>
    </section>
  )
}

function PushSettings() {
  const { user } = useAuth()
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    isPushEnabled().then(setEnabled).catch(() => setEnabled(false))
  }, [])

  async function toggle() {
    if (!user) return
    setBusy(true)
    setMsg(null)
    try {
      if (enabled) {
        await disablePush()
        setEnabled(false)
      } else {
        await enablePush(user.id)
        setEnabled(true)
        setMsg('Notifiche attivate! Ti avviserò quando esce un titolo che aspetti.')
      }
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-theatre-800 bg-theatre-900/60 p-5">
      <h2 className="mb-3 font-display text-xl tracking-wide text-zinc-100">🔔 Notifiche push</h2>
      {!user ? (
        <p className="text-sm text-zinc-400">Accedi per attivare le notifiche di uscita sul tuo dispositivo.</p>
      ) : !pushSupported ? (
        <p className="text-sm text-zinc-400">Questo browser non supporta le notifiche push.</p>
      ) : !pushConfigured ? (
        <p className="text-sm text-zinc-400">
          Le notifiche push non sono ancora configurate dal server (manca la chiave VAPID pubblica).
        </p>
      ) : (
        <>
          <p className="text-sm text-zinc-400">
            Ricevi una notifica sul dispositivo (anche ad app chiusa) quando esce un titolo che hai segnato con «Avvisami».
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={toggle} disabled={busy} className={enabled ? 'btn-ghost' : 'btn-primary'}>
              {busy ? '…' : enabled ? 'Disattiva notifiche' : '🔔 Attiva notifiche'}
            </button>
            {enabled && (
              <button
                onClick={async () => {
                  setMsg(null)
                  try {
                    await sendTestNotification()
                    setMsg('Inviata! Dovrebbe arrivarti una notifica tra pochi secondi.')
                  } catch (e) {
                    setMsg((e as Error).message)
                  }
                }}
                className="btn-ghost"
              >
                🧪 Invia notifica di prova
              </button>
            )}
          </div>
          {msg && <p className="mt-3 text-xs text-projector">{msg}</p>}
        </>
      )}
    </section>
  )
}

export default function Settings() {
  return (
    <div>
      <PageHeader
        eyebrow="Il tuo profilo"
        title="Impostazioni"
        subtitle="Notifiche, preferenze di raccomandazione e stato delle integrazioni."
      />

      <div className="grid gap-6 md:grid-cols-2">
        <IntegrationsSettings />

        <PushSettings />

        <BackupSettings />

        <GeneriSettings />

        <DiagnosticaSettings />

        <section className="rounded-xl border border-theatre-800 bg-theatre-900/60 p-5">
          <h2 className="mb-3 font-display text-xl tracking-wide text-zinc-100">🎯 Preferenze AI</h2>
          <p className="text-sm text-zinc-400">
            Generi preferiti, generi da escludere e lingue: queste preferenze calibrano i suggerimenti dell'AI.
          </p>
          <p className="mt-3 text-xs text-zinc-500">
            Disponibili nella fase «preferenze utente», salvate nella tabella{' '}
            <code className="text-projector/80">user_preferences</code> su Supabase.
          </p>
        </section>
      </div>
    </div>
  )
}
