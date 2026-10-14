import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cancellaDalDisco, cancellabileDalDisco, cartellaCollegata } from '../lib/cartellaLocale'
import { eliminaFilm, filmOffline, offlineDisponibile, salvaFileSulDispositivo, taglia, type FilmOffline } from '../lib/filmOffline'
import type { FilmAperto } from '../lib/filmLocali'
import { logFailure } from '../lib/logFailure'
import type { Traccia } from '../lib/useSottotitoli'

// Sotto il lettore, per un video del disco: la copia in Ciak (il file del
// disco non si ritrova da solo dopo aver chiuso Ciak, il browser non lo
// permette) e la cancellazione dal disco.
export default function FileSulDisco({
  fileId,
  titolo,
  aperto,
  locale,
  onLocale,
  sottotitoli,
  onErrore,
}: {
  fileId: string
  titolo: string
  aperto: FilmAperto | undefined
  locale: FilmOffline | null | undefined
  onLocale: (f: FilmOffline | null) => void
  // Da salvare insieme alla copia in Ciak: offline si vedono quelli.
  sottotitoli: Traccia[]
  // Gli errori della cancellazione vanno nell'avviso del lettore.
  onErrore: (messaggio: string | null) => void
}) {
  const navigate = useNavigate()
  const [salvando, setSalvando] = useState(false)
  const [erroreSalva, setErroreSalva] = useState<string | null>(null)
  const [cancellando, setCancellando] = useState(false)
  const scaricato = locale?.stato === 'completo'

  // Il film aperto dal disco, copiato in Ciak: sul tablet si guarda poi anche
  // senza il file a portata (e senza rete), finché non lo si elimina.
  async function salvaInCiak() {
    if (!aperto) return
    setErroreSalva(null)
    setSalvando(true)
    try {
      await salvaFileSulDispositivo(
        { id: fileId, titolo, file: aperto.file.name },
        aperto.file,
        sottotitoli.map(({ chiave, lingua, etichetta, vtt }) => ({ chiave, lingua, etichetta, vtt })),
      )
      onLocale(await filmOffline(fileId))
    } catch (e) {
      setErroreSalva(e instanceof Error ? e.message : 'Salvataggio non riuscito.')
      logFailure('Film del dispositivo salvato in Ciak')(e)
    } finally {
      setSalvando(false)
    }
  }

  async function elimina() {
    await eliminaFilm(fileId).catch(logFailure('Eliminazione del film offline'))
    onLocale(null)
  }

  // Cancellare il video da Ciak vuol dire cancellarlo dal disco, coi suoi
  // sottotitoli e le sue lingue (e, se la cartella resta vuota, con la
  // cartella). Non passa dal Cestino di Windows: la conferma lo dice.
  async function cancellaDalPc() {
    if (!window.confirm(`Vuoi cancellare «${titolo}» dal disco?\nVa via il file, coi suoi sottotitoli, dalla cartella «${cartellaCollegata()}». Non finisce nel Cestino: non si recupera.`)) return
    onErrore(null)
    setCancellando(true)
    try {
      await cancellaDalDisco([fileId])
      if (scaricato) await eliminaFilm(fileId).catch(logFailure('Eliminazione del film salvato in Ciak'))
      navigate('/streaming', { replace: true, state: { cancellato: titolo } })
    } catch (e) {
      onErrore(e instanceof Error ? e.message : 'Cancellazione non riuscita.')
      logFailure('Cancellazione del video dal disco')(e)
    } finally {
      setCancellando(false)
    }
  }

  return (
    <>
      {(scaricato || aperto) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-theatre-800 bg-theatre-900/40 p-3 text-sm">
          {scaricato ? (
            <>
              <p className="flex-1 text-zinc-300">
                📱 Salvato in Ciak{locale?.dimensione ? ` (${taglia(locale.dimensione)})` : ''}: si vede anche senza il
                disco e senza rete. Quando l’hai visto, eliminalo per liberare spazio.
              </p>
              <button type="button" onClick={elimina} className="btn-ghost px-3 py-1.5">
                Elimina dal dispositivo
              </button>
            </>
          ) : (
            <>
              <p className="flex-1 text-zinc-400">
                {salvando
                  ? `💾 Lo copio in Ciak (${taglia(aperto?.file.size ?? 0)})…`
                  : 'Lo guardi dal file scelto. Sul tablet puoi copiarlo in Ciak, per vederlo poi anche senza il file a portata.'}
              </p>
              {offlineDisponibile() && (
                <button type="button" onClick={() => void salvaInCiak()} disabled={salvando} className="btn-ghost px-3 py-1.5">
                  {salvando ? 'Salvo…' : '💾 Salva in Ciak (per vederlo offline)'}
                </button>
              )}
            </>
          )}
          {erroreSalva && <p className="w-full text-red-400">{erroreSalva}</p>}
        </div>
      )}

      {/* Cancellare dal disco: i video della cartella collegata, dove il
          browser lascia modificarla (Chrome, Edge). */}
      {aperto?.origine === 'cartella' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-theatre-800 bg-theatre-900/40 p-3 text-sm">
          <p className="flex-1 text-zinc-400">
            {cancellabileDalDisco()
              ? 'Non lo vuoi più? Lo cancelli dal disco, coi suoi sottotitoli: sparisce dalla cartella e da Ciak. Non passa dal Cestino.'
              : 'Per cancellarlo dal disco apri Ciak con Chrome o Edge (questo browser lascia solo leggere i file), oppure usa Esplora file.'}
          </p>
          {cancellabileDalDisco() && (
            <button type="button" onClick={() => void cancellaDalPc()} disabled={cancellando} className="btn-ghost px-3 py-1.5">
              {cancellando ? 'Cancello…' : '🗑 Cancella dal disco'}
            </button>
          )}
        </div>
      )}
    </>
  )
}
