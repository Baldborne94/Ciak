import { useState, useSyncExternalStore } from 'react'
import { annullaCopia, ascoltaCopie, copiaDaCasa, CopiaAnnullata, pianoCopia, progressoCopia } from '../lib/copiaDaCasa'
import { eliminaFilm, filmOffline, offlineDisponibile, taglia, type FilmOffline } from '../lib/filmOffline'
import type { InfoJellyfin } from '../lib/jellyfin'
import { logFailure } from '../lib/logFailure'
import type { Traccia } from '../lib/useSottotitoli'

// Sotto il lettore, per un video del server di casa: «Salva in Ciak», per
// guardarlo poi col PC spento o senza rete (in giro, sul tablet). Lo
// scaricamento continua anche uscendo dalla pagina (vedi copiaDaCasa).
export default function CopiaDaCasa({
  fileId,
  titolo,
  info,
  audio,
  sottotitoli,
  locale,
  onLocale,
}: {
  fileId: string
  titolo: string
  // null finché il server non ha risposto, e quando si guarda la copia.
  info: InfoJellyfin | null
  // La lingua scelta nel lettore (l'indice di Jellyfin) e il suo nome.
  audio: { indice: number | null; nome: string | null }
  sottotitoli: Traccia[]
  locale: FilmOffline | null | undefined
  onLocale: (f: FilmOffline | null) => void
}) {
  const progresso = useSyncExternalStore(ascoltaCopie, () => progressoCopia(fileId))
  const [errore, setErrore] = useState<string | null>(null)
  if (!offlineDisponibile()) return null
  const scaricato = locale?.stato === 'completo'

  async function salva() {
    if (!info) return
    setErrore(null)
    try {
      await copiaDaCasa({
        fileId,
        titolo,
        info,
        audio: audio.indice,
        sottotitoli: sottotitoli.map(({ chiave, lingua, etichetta, vtt }) => ({ chiave, lingua, etichetta, vtt })),
      })
      onLocale(await filmOffline(fileId))
    } catch (e) {
      if (e instanceof CopiaAnnullata) return
      setErrore(e instanceof Error ? e.message : 'Salvataggio non riuscito.')
      logFailure('Film del server di casa salvato in Ciak')(e)
    }
  }

  async function elimina() {
    await eliminaFilm(fileId).catch(logFailure('Eliminazione del film offline'))
    onLocale(null)
  }

  let testo: string
  let azione: { etichetta: string; fai: () => void } | null = null
  if (scaricato) {
    testo = `📱 Salvato in Ciak${locale?.dimensione ? ` (${taglia(locale.dimensione)})` : ''}: si vede anche col server di casa spento e senza rete. Quando l’hai visto, eliminalo per liberare spazio.`
    azione = { etichetta: 'Elimina dal dispositivo', fai: () => void elimina() }
  } else if (progresso) {
    const quanto = `${taglia(progresso.scaricati) || '0 MB'}${progresso.totale ? ` di ${taglia(progresso.totale)}` : ''}`
    testo = `💾 Lo salvo in Ciak dal server di casa: ${quanto}…${progresso.convertito ? ' Jellyfin lo converte in MP4 mentre lo manda: ci mette circa quanto la conversione. Puoi uscire da questa pagina, continua.' : ''}`
    azione = { etichetta: 'Annulla', fai: () => annullaCopia(fileId) }
  } else if (info) {
    const convertito = pianoCopia(fileId, info, audio.indice, '').convertito
    testo =
      'Puoi salvarlo in Ciak, per vederlo anche col PC spento o senza rete.' +
      (convertito ? ' Il browser non legge questo file così com’è: Jellyfin lo converte in MP4 mentre lo scarica.' : '') +
      (info.audio.length > 1 && audio.nome ? ` La copia avrà l’audio in ${audio.nome.toLowerCase()}, la lingua scelta ora.` : '')
    azione = { etichetta: '💾 Salva in Ciak (per vederlo offline)', fai: () => void salva() }
  } else return null

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-theatre-800 bg-theatre-900/40 p-3 text-sm">
      <p className={`flex-1 ${scaricato ? 'text-zinc-300' : 'text-zinc-400'}`}>{testo}</p>
      {azione && (
        <button type="button" onClick={azione.fai} className="btn-ghost px-3 py-1.5">
          {azione.etichetta}
        </button>
      )}
      {errore && <p className="w-full text-red-400">{errore}</p>}
    </div>
  )
}
