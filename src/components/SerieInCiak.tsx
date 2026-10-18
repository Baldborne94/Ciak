import { taglia } from '../lib/filmOffline'
import type { RigaInCiak } from '../lib/useSerieInCiak'

// In fondo a una serie aperta: tenerla in Ciak, sul dispositivo. Gli episodi
// si copiano da soli (anche quelli che arrivano dopo nella cartella), e quelli
// visti si tolgono se lo si sceglie: lo spazio di un tablet finisce presto.
export default function SerieInCiak({ riga, titolo }: { riga: RigaInCiak; titolo: string }) {
  if (!riga.tenuta) {
    return (
      <div className="mt-3 rounded-xl border border-theatre-800 p-3 text-xs text-zinc-400">
        <p className="mb-2">
          Copiala in Ciak per guardarla anche senza la cartella e senza rete: gli episodi che aggiungi dopo si copiano da soli quando la videoteca rilegge la
          cartella.
        </p>
        <button type="button" onClick={riga.onSalva} className="btn-ghost px-3 py-1.5">
          📱 Salva la serie in Ciak
        </button>
      </div>
    )
  }

  function smetti() {
    const quante = riga.salvati === 1 ? 'la copia dell’episodio salvato' : `le copie dei ${riga.salvati} episodi salvati`
    if (riga.salvati > 0 && !window.confirm(`Smetti di tenere «${titolo}» in Ciak?\nVanno via ${quante}; i file nella cartella restano dove sono.`)) return
    riga.onSmetti()
  }

  return (
    <div className="mt-3 rounded-xl border border-theatre-800 p-3 text-xs text-zinc-400">
      <p className="text-zinc-300">
        📱 Tenuta in Ciak: {riga.salvati} di {riga.episodi} episodi{riga.dimensione > 0 && ` (${taglia(riga.dimensione)})`}
      </p>
      {riga.copia && (
        <p role="status" className="mt-1">
          Copio {riga.copia.titolo} ({riga.copia.n} di {riga.copia.totale})…
        </p>
      )}
      {riga.avviso && <p className="mt-1 text-amber-300">{riga.avviso}</p>}
      <label className="mt-2 flex items-center gap-2">
        <input type="checkbox" checked={riga.liberaDopoVisione} onChange={(e) => riga.onLibera(e.target.checked)} />
        Togli dal dispositivo gli episodi visti (il file nella cartella resta)
      </label>
      <button type="button" onClick={smetti} className="mt-2 text-zinc-500 transition hover:text-red-400">
        Smetti di tenerla in Ciak
      </button>
    </div>
  )
}
