import { useState } from 'react'
import { fileDaScelta, leggiExport } from '../lib/letterboxd'
import { abbinaFilm, eseguiImport, preparaImport } from '../lib/letterboxdImporta'
import type { PianoImport } from '../lib/letterboxdPiano'
import { logFailure } from '../lib/logFailure'

// Importare da Letterboxd: si sceglie l'esportazione (lo ZIP che Letterboxd
// manda), Ciak cerca i film su TMDB e dice cosa importerebbe; solo dopo la
// conferma scrive. Ciò che hai già in Ciak resta com'è (vedi letterboxdPiano).

type Fase =
  | { tipo: 'scegli' }
  | { tipo: 'cerco'; fatti: number; totale: number }
  | { tipo: 'pronto'; piano: PianoImport }
  | { tipo: 'scrivo'; testo: string }
  | { tipo: 'fatto'; piano: PianoImport }

function riassunto(c: PianoImport['conteggi']): string[] {
  const voci: [number, string, string][] = [
    [c.visti, 'film visto', 'film visti'],
    [c.daVedere, 'film da vedere', 'film da vedere'],
    [c.voti, 'voto', 'voti'],
    [c.preferiti, 'preferito', 'preferiti'],
    [c.note, 'recensione come nota', 'recensioni come note'],
    [c.visioni, 'visione nel diario', 'visioni nel diario'],
    [c.liste, 'lista', 'liste'],
  ]
  return voci.filter(([n]) => n > 0).map(([n, uno, tanti]) => `${n} ${n === 1 ? uno : tanti}`)
}

export default function ImportaLetterboxd({ userId }: { userId: string }) {
  const [fase, setFase] = useState<Fase>({ tipo: 'scegli' })
  const [errore, setErrore] = useState<string | null>(null)

  async function scelti(file: File[]) {
    setErrore(null)
    try {
      const e = leggiExport(await fileDaScelta(file))
      setFase({ tipo: 'cerco', fatti: 0, totale: 0 })
      const abbinati = await abbinaFilm(e, (fatti, totale) => setFase({ tipo: 'cerco', fatti, totale }))
      if (abbinati.size === 0) {
        setFase({ tipo: 'scegli' })
        setErrore('In questi file non ho trovato film: scegli lo ZIP che Letterboxd ti ha mandato (o i suoi CSV).')
        return
      }
      setFase({ tipo: 'pronto', piano: await preparaImport(userId, e, abbinati) })
    } catch (err) {
      setFase({ tipo: 'scegli' })
      setErrore(`Non riesco a leggere l'esportazione: ${(err as Error).message}`)
      logFailure('Lettura dell’esportazione di Letterboxd')(err)
    }
  }

  async function importa(piano: PianoImport) {
    setErrore(null)
    try {
      await eseguiImport(userId, piano, (testo) => setFase({ tipo: 'scrivo', testo }))
      setFase({ tipo: 'fatto', piano })
    } catch (err) {
      // Ciò che è già scritto resta: rifacendo l'importazione si aggiunge solo il resto.
      setFase({ tipo: 'pronto', piano })
      setErrore(`Importazione interrotta: ${(err as Error).message}. Riprova: ciò che è già entrato non si duplica.`)
      logFailure('Importazione da Letterboxd')(err)
    }
  }

  return (
    <div className="space-y-3 text-sm text-zinc-400">
      {fase.tipo === 'scegli' && (
        <>
          <p>
            Su <strong className="text-zinc-200">letterboxd.com</strong>: Settings → Import &amp; Export → <em>Export your data</em>. Letterboxd ti fa scaricare uno ZIP:
            sceglilo qui. Entrano visti, voti, diario, watchlist, «mi piace» (come preferiti), recensioni (come note) e liste.
          </p>
          <label className="btn-ghost inline-block cursor-pointer">
            📥 Scegli l'esportazione di Letterboxd
            <input
              type="file"
              accept=".zip,.csv"
              multiple
              className="sr-only"
              aria-label="Esportazione di Letterboxd"
              onChange={(ev) => {
                const file = [...(ev.target.files ?? [])]
                ev.target.value = ''
                if (file.length > 0) void scelti(file)
              }}
            />
          </label>
        </>
      )}
      {fase.tipo === 'cerco' && (
        <p role="status">
          Cerco i film su TMDB{fase.totale > 0 ? `: ${fase.fatti} di ${fase.totale}` : ''}… Con tanti film ci vuole qualche minuto.
        </p>
      )}
      {fase.tipo === 'pronto' && (
        <>
          <p className="text-zinc-200">
            {riassunto(fase.piano.conteggi).length > 0
              ? `Pronti da importare: ${riassunto(fase.piano.conteggi).join(', ')}.`
              : 'Niente di nuovo da importare: in Ciak c’è già tutto.'}
          </p>
          <p>Ciò che hai già in Ciak resta com’è: un visto non torna da vedere, i tuoi voti e le tue note non si sovrascrivono.</p>
          {fase.piano.nonTrovati.length > 0 && (
            <details>
              <summary className="cursor-pointer">{fase.piano.nonTrovati.length} film non trovati su TMDB, che restano fuori</summary>
              <ul className="mt-2 max-h-48 overflow-y-auto">
                {fase.piano.nonTrovati.map((f) => (
                  <li key={`${f.nome}|${f.anno}`}>
                    {f.nome}
                    {f.anno ? ` (${f.anno})` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            {riassunto(fase.piano.conteggi).length > 0 && (
              <button type="button" className="btn-primary" onClick={() => void importa(fase.piano)}>
                📥 Importa in Ciak
              </button>
            )}
            <button type="button" className="btn-ghost" onClick={() => setFase({ tipo: 'scegli' })}>
              Annulla
            </button>
          </div>
        </>
      )}
      {fase.tipo === 'scrivo' && <p role="status">{fase.testo}</p>}
      {fase.tipo === 'fatto' && (
        <>
          <p role="status" className="text-zinc-200">
            ✓ Importato da Letterboxd: {riassunto(fase.piano.conteggi).join(', ')}.
          </p>
          <button type="button" className="btn-ghost" onClick={() => setFase({ tipo: 'scegli' })}>
            Importa un’altra esportazione
          </button>
        </>
      )}
      {errore && <p className="text-red-400">{errore}</p>}
    </div>
  )
}
