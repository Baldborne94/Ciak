import { useEffect, useState } from 'react'
import { formattaTempo } from '../lib/streaming'
import { leggiTempo, type PuntiSigla, type SaltaSigle } from '../lib/sigle'

// Le sigle di una serie, impostate da chi guarda. Ogni serie ha le sue, e
// impararle solo dai salti a mano voleva dire sbagliarne la durata (90
// secondi di base) e non poter correggere un punto preso male. Qui si
// segnano mentre si guarda («📍 adesso», con un tocco) o si scrivono.

interface Props {
  punti: PuntiSigla
  onCambia: (nuovi: Partial<PuntiSigla>) => void
  // Dove è il video adesso, per i pulsanti «📍 adesso».
  adesso: () => number | null
  durataVideo: number | null
  scelte: SaltaSigle
  onScelte: (nuove: Partial<SaltaSigle>) => void
  // I tempi esatti di TheIntroDB per questo episodio, già scritti: valgono
  // più di quelli della serie.
  esatte: string | null
}

export default function SigleSerie({ punti, onCambia, adesso, durataVideo, scelte, onScelte, esatte }: Props) {
  // La sigla finale si ricorda dalla fine (gli episodi non durano uguale), ma
  // si mostra e si scrive come tempo dall'inizio di questo episodio.
  const codaDaInizio = punti.coda !== null && durataVideo ? Math.max(0, durataVideo - punti.coda) : null
  const segnaCoda = (t: number | null) =>
    onCambia({ coda: t === null ? null : durataVideo ? Math.max(0, Math.round(durataVideo - t)) : null })
  const segnaAdesso = (cosa: 'inizio' | 'fine' | 'coda') => {
    const t = adesso()
    if (t === null) return
    if (cosa === 'coda') segnaCoda(t)
    else onCambia({ [cosa]: Math.round(t) })
  }
  const fineSbagliata = punti.inizio !== null && punti.fine !== null && punti.fine <= punti.inizio
  const qualcosa = punti.inizio !== null || punti.fine !== null || punti.coda !== null

  return (
    <section aria-label="Sigle di questa serie" className="space-y-3 rounded-xl border border-theatre-800 bg-theatre-950/60 p-3 text-sm text-zinc-300">
      <h2 className="font-medium text-zinc-200">⏭ Sigle di questa serie</h2>
      {esatte && <p className="text-xs text-zinc-500">{esatte}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <span className="w-28 text-zinc-400">Sigla iniziale</span>
        <span>da</span>
        <CampoTempo etichetta="Inizio della sigla iniziale" valore={punti.inizio} onImposta={(t) => onCambia({ inizio: t })} />
        <Adesso etichetta="La sigla iniziale comincia adesso" onClick={() => segnaAdesso('inizio')} />
        <span>a</span>
        <CampoTempo etichetta="Fine della sigla iniziale" valore={punti.fine} onImposta={(t) => onCambia({ fine: t })} />
        <Adesso etichetta="La sigla iniziale finisce adesso" onClick={() => segnaAdesso('fine')} />
      </div>
      {fineSbagliata && (
        <p role="alert" className="text-xs text-amber-300">
          La fine della sigla viene prima dell’inizio: «Salta sigla» andrà avanti della durata di base.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="w-28 text-zinc-400">Sigla finale</span>
        <span>da</span>
        <CampoTempo
          etichetta="Inizio della sigla finale"
          valore={codaDaInizio}
          onImposta={segnaCoda}
          disabilitato={!durataVideo}
        />
        <Adesso etichetta="La sigla finale comincia adesso" onClick={() => segnaAdesso('coda')} />
        {punti.coda !== null && <span className="text-xs text-zinc-500">(gli ultimi {formattaTempo(punti.coda)} di ogni episodio)</span>}
      </div>

      <div className="space-y-2 border-t border-theatre-800 pt-3">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={scelte.inizio} onChange={(e) => onScelte({ inizio: e.target.checked })} />
          Salta sempre la sigla iniziale
        </label>
        <fieldset className="space-y-1">
          <legend className="text-zinc-400">Alla sigla finale</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="sigla-finale" checked={scelte.fine} onChange={() => onScelte({ fine: true })} />
            Passa subito al prossimo episodio
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="sigla-finale" checked={!scelte.fine} onChange={() => onScelte({ fine: false })} />
            Guardala fino alla fine, poi passa al prossimo
          </label>
        </fieldset>
      </div>

      {!qualcosa && (
        <p className="text-xs text-zinc-500">
          Premi «📍» quando la sigla comincia e quando finisce: Ciak li ricorda per tutti gli episodi di questa serie.
          Anche premere «⏭ Salta sigla» insegna dove comincia.
        </p>
      )}
      {qualcosa && (
        <button
          type="button"
          onClick={() => onCambia({ inizio: null, fine: null, coda: null })}
          className="text-xs text-projector underline-offset-2 hover:underline"
        >
          Cancella i tempi di questa serie
        </button>
      )}
    </section>
  )
}

function Adesso({ etichetta, onClick }: { etichetta: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={etichetta} title={etichetta} className="btn-ghost min-h-9 px-2 py-1">
      📍 adesso
    </button>
  )
}

// Un tempo da scrivere: «1:35». Si conferma uscendo dal campo o con Invio; uno
// vuoto cancella il punto, uno che non si capisce torna com'era.
function CampoTempo({
  etichetta,
  valore,
  onImposta,
  disabilitato = false,
}: {
  etichetta: string
  valore: number | null
  onImposta: (t: number | null) => void
  disabilitato?: boolean
}) {
  const scritto = valore === null ? '' : formattaTempo(valore)
  const [testo, setTesto] = useState(scritto)
  useEffect(() => setTesto(scritto), [scritto])
  const conferma = () => {
    if (testo.trim() === '') return valore !== null && onImposta(null)
    const t = leggiTempo(testo)
    if (t === null) setTesto(scritto)
    else if (t !== valore) onImposta(t)
  }
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={etichetta}
      placeholder="–:––"
      value={testo}
      disabled={disabilitato}
      onChange={(e) => setTesto(e.target.value)}
      onBlur={conferma}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className="w-20 rounded-lg border border-theatre-700 bg-theatre-900 px-2 py-1 text-center text-zinc-100 disabled:opacity-50"
    />
  )
}
