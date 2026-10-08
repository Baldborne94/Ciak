import { useState } from 'react'
import { corrispondeRicerca } from '../lib/ricercaLista'
import { logFailure } from '../lib/logFailure'
import type { FilmDelloStudio } from '../lib/perStudio'

// Creare o cambiare una saga fatta a mano, o una raccolta: un nome e i titoli
// della videoteca che ci vanno dentro. I titoli sono quelli già riconosciuti
// (con un id di TMDB): la lista li ritrova per titolo, anche se il file cambia.
// Una saga raccoglie film; una raccolta anche serie e anime.
export interface FilmSceglibile {
  chiave: string // `movie-<id>` o `tv-<id>`
  titolo: string
  anno: string | null
  poster: string | null // indirizzo della locandina piccola
}

const PAROLE = {
  saga: { dentro: 'Nella saga', nome: 'Nome della saga', esempio: 'Es. Pixar anni 90', cerca: 'Cerca un film', uno: 'film', tanti: 'film', crea: 'Crea la saga', sciogli: 'Sciogli la saga', nessuno: 'Nessun film riconosciuto con questo nome.' },
  raccolta: { dentro: 'Nella raccolta', nome: 'Nome della raccolta', esempio: 'Es. Natale', cerca: 'Cerca un titolo', uno: 'titolo', tanti: 'titoli', crea: 'Crea la raccolta', sciogli: 'Elimina la raccolta', nessuno: 'Nessun titolo riconosciuto con questo nome.' },
}

export default function ModificaSaga({
  film,
  iniziale,
  onSalva,
  onSciogli,
  salvando = false,
  tipo = 'saga',
  onCercaStudio,
}: {
  film: FilmSceglibile[]
  iniziale?: { nome: string; chiavi: Set<string> }
  onSalva: (nome: string, chiavi: string[]) => void
  onSciogli?: () => void
  salvando?: boolean
  tipo?: 'saga' | 'raccolta'
  // «Studio Ghibli» → i suoi film: spuntati in un colpo quelli che sono qui.
  onCercaStudio?: (nome: string) => Promise<FilmDelloStudio | null>
}) {
  const p = PAROLE[tipo]
  const [nome, setNome] = useState(iniziale?.nome ?? '')
  const [scelti, setScelti] = useState<Set<string>>(() => new Set(iniziale?.chiavi ?? []))
  const [cerca, setCerca] = useState('')
  // Con 131 film spuntati e gli altri in mezzo, in ordine alfabetico, quelli
  // da aggiungere non si trovavano: l'elenco si divide in chi c'è e chi no.
  // Una nuova parte da «Tutti»; una esistente da quelli da aggiungere.
  const [vista, setVista] = useState<'tutti' | 'dentro' | 'fuori'>(iniziale ? 'fuori' : 'tutti')
  // Chi è dentro, fissato quando si sceglie la vista: togliendo la spunta in
  // «Nella saga» il film resta lì (spuntato o no) invece di sparire sotto il dito.
  const [base, setBase] = useState<Set<string>>(() => new Set(iniziale?.chiavi ?? []))
  const scegliVista = (v: typeof vista) => {
    setBase(new Set(scelti))
    setVista(v)
    setCerca('')
  }
  // Cercando, si cerca fra tutti: il film cercato potrebbe essere dall'altra parte.
  const cercando = cerca.trim() !== ''
  const visibili = film.filter((f) =>
    cercando ? corrispondeRicerca(cerca, [f.titolo]) : vista === 'tutti' || (vista === 'dentro') === base.has(f.chiave),
  )
  const quantiDentro = film.filter((f) => scelti.has(f.chiave)).length
  const [studio, setStudio] = useState('')
  const [esitoStudio, setEsitoStudio] = useState<string | null>(null)
  const [cercandoStudio, setCercandoStudio] = useState(false)
  async function aggiungiStudio() {
    if (!onCercaStudio || !studio.trim()) return
    setCercandoStudio(true)
    setEsitoStudio(null)
    try {
      const trovato = await onCercaStudio(studio.trim())
      if (!trovato) {
        setEsitoStudio(`Nessuno studio «${studio.trim()}» su TMDB.`)
        return
      }
      const suoi = film.filter((f) => trovato.chiavi.has(f.chiave)).map((f) => f.chiave)
      const nuovi = suoi.filter((k) => !scelti.has(k))
      setScelti((prima) => new Set([...prima, ...suoi]))
      // Una nuova senza nome prende quello dello studio.
      if (!nome.trim()) setNome(trovato.studio)
      setEsitoStudio(
        suoi.length === 0
          ? `Nessun film di ${trovato.studio} fra quelli riconosciuti qui.`
          : nuovi.length === 0
            ? `I ${suoi.length} film di ${trovato.studio} che sono qui c’erano già tutti.`
            : `${trovato.studio}: ${nuovi.length === 1 ? 'aggiunto 1 film' : `aggiunti ${nuovi.length} film`}.`,
      )
    } catch (e) {
      setEsitoStudio('TMDB non risponde: riprova fra poco.')
      logFailure('Film di uno studio per una saga o raccolta')(e)
    } finally {
      setCercandoStudio(false)
    }
  }
  const alterna = (chiave: string) =>
    setScelti((prima) => {
      const dopo = new Set(prima)
      if (dopo.has(chiave)) dopo.delete(chiave)
      else dopo.add(chiave)
      return dopo
    })
  const pronta = nome.trim() !== '' && scelti.size > 0 && !salvando

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="nome-saga" className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
          {p.nome}
        </label>
        <input id="nome-saga" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={p.esempio} className="input-cine w-full" />
      </div>
      <div>
        <label htmlFor="cerca-saga" className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
          {p.cerca}
        </label>
        <input id="cerca-saga" value={cerca} onChange={(e) => setCerca(e.target.value)} className="input-cine w-full" />
      </div>
      {onCercaStudio && (
        <div>
          <label htmlFor="studio-saga" className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
            Aggiungi i film di uno studio
          </label>
          <div className="flex gap-2">
            <input
              id="studio-saga"
              value={studio}
              onChange={(e) => setStudio(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void aggiungiStudio()
                }
              }}
              placeholder="Es. Studio Ghibli"
              className="input-cine min-w-0 flex-1"
            />
            <button type="button" onClick={() => void aggiungiStudio()} disabled={!studio.trim() || cercandoStudio} className="btn-ghost px-3 py-1.5 text-sm">
              {cercandoStudio ? 'Cerco…' : 'Aggiungi'}
            </button>
          </div>
          {esitoStudio && (
            <p role="status" className="mt-1 text-xs text-zinc-400">
              {esitoStudio}
            </p>
          )}
        </div>
      )}
      <div role="group" aria-label="Quali mostrare" className="flex flex-wrap gap-2">
        {(
          [
            ['fuori', `Da aggiungere (${film.length - quantiDentro})`],
            ['dentro', `${p.dentro} (${quantiDentro})`],
            ['tutti', `Tutti (${film.length})`],
          ] as const
        ).map(([v, etichetta]) => (
          <button
            key={v}
            type="button"
            aria-pressed={!cercando && vista === v}
            onClick={() => scegliVista(v)}
            className={`rounded-full border px-3 py-1 text-xs transition ${!cercando && vista === v ? 'border-projector bg-projector/15 text-zinc-100' : 'border-theatre-700 text-zinc-400 hover:text-zinc-100'}`}
          >
            {etichetta}
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-500">
        <span>{scelti.size === 1 ? `1 ${p.uno} scelto` : `${scelti.size} ${p.tanti} scelti`}</span> · spunta per aggiungere, togli la
        spunta per togliere.
      </p>
      <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
        {visibili.map((f) => (
          <li key={f.chiave}>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-theatre-800/60">
              <input type="checkbox" checked={scelti.has(f.chiave)} onChange={() => alterna(f.chiave)} className="accent-projector" />
              {f.poster ? (
                <img src={f.poster} alt="" loading="lazy" className="h-10 w-7 shrink-0 rounded object-cover" />
              ) : (
                <span aria-hidden="true" className="flex h-10 w-7 shrink-0 items-center justify-center">
                  🎬
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                {f.titolo}
                {f.anno && <span className="text-zinc-500"> · {f.anno}</span>}
              </span>
            </label>
          </li>
        ))}
        {visibili.length === 0 && (
          <li className="px-2 text-sm text-zinc-500">
            {cercando ? p.nessuno : vista === 'fuori' ? 'Non c’è altro da aggiungere: sono già tutti dentro.' : 'Ancora vuota: scegli da «Da aggiungere».'}
          </li>
        )}
      </ul>
      <div className="flex flex-wrap items-center gap-3 border-t border-theatre-800 pt-3">
        <button type="button" disabled={!pronta} onClick={() => onSalva(nome.trim(), [...scelti])} className="btn-primary px-4 py-1.5">
          {salvando ? 'Salvo…' : iniziale ? 'Salva' : p.crea}
        </button>
        {onSciogli && (
          // I file restano: sparisce solo la lista.
          <button type="button" onClick={onSciogli} className="text-xs text-zinc-500 transition hover:text-red-400">
            {p.sciogli}
          </button>
        )}
      </div>
    </div>
  )
}
