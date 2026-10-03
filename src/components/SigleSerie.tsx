import { formattaTempo } from '../lib/streaming'
import type { PuntiSigla, SaltaSigle } from '../lib/sigle'

// Le sigle di una serie: cosa fare quando arrivano, e dove stanno. I tempi non
// si scrivono: Ciak li impara da chi guarda (l'inizio dal primo «Salta
// sigla», la fine dalla barra trascinata subito dopo, la finale da «Prossimo
// episodio») e qui si vedono, con «Reimpara» se erano sbagliati.

interface Props {
  punti: PuntiSigla
  onReimpara: () => void
  scelte: SaltaSigle
  onScelte: (nuove: Partial<SaltaSigle>) => void
  // I tempi esatti di TheIntroDB per questo episodio, già scritti.
  esatte: string | null
  // Con i tempi esatti quelli della serie non si usano, e non si mostrano.
  conEsatteInizio: boolean
  conEsatteFine: boolean
}

export default function SigleSerie({ punti, onReimpara, scelte, onScelte, esatte, conEsatteInizio, conEsatteFine }: Props) {
  const inizio = conEsatteInizio ? null : punti.inizio
  const fine = conEsatteInizio ? null : punti.fine
  const coda = conEsatteFine ? null : punti.coda
  const qualcosa = inizio !== null || coda !== null

  return (
    <section aria-label="Sigle di questa serie" className="space-y-2 text-sm text-zinc-400">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={scelte.inizio} onChange={(e) => onScelte({ inizio: e.target.checked })} />
          Salta sempre la sigla iniziale
        </label>
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <legend className="float-left mr-1">Alla sigla finale:</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="sigla-finale" checked={scelte.fine} onChange={() => onScelte({ fine: true })} />
            passa subito al prossimo episodio
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="sigla-finale" checked={!scelte.fine} onChange={() => onScelte({ fine: false })} />
            guardala fino alla fine, poi passa al prossimo
          </label>
        </fieldset>
      </div>
      {esatte && <p className="text-xs text-zinc-500">{esatte}</p>}
      {inizio === null && !conEsatteInizio && (
        <p className="text-xs text-zinc-500">
          La prima volta premi «⏭ Salta sigla» quando la sigla parte: Ciak ricorda il punto per questa serie. Se salta troppo o
          troppo poco, trascina subito la barra dove la sigla finisce davvero: impara anche quello.
        </p>
      )}
      {scelte.fine && coda === null && !conEsatteFine && (
        <p className="text-xs text-zinc-500">
          La prima volta premi «⏭ Prossimo episodio» quando parte la sigla finale: Ciak ricorda il punto per questa serie.
        </p>
      )}
      {qualcosa && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          In questa serie
          {inizio !== null && ` la sigla iniziale parte a ${formattaTempo(inizio)}`}
          {inizio !== null && fine !== null && fine > inizio && ` e finisce a ${formattaTempo(fine)}`}
          {inizio !== null && coda !== null && ','}
          {coda !== null && ` la finale negli ultimi ${formattaTempo(coda)}`}.
          <button type="button" onClick={onReimpara} className="text-projector underline-offset-2 hover:underline">
            Reimpara
          </button>
        </p>
      )}
    </section>
  )
}
