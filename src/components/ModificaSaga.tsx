import { useState } from 'react'
import { corrispondeRicerca } from '../lib/ricercaLista'

// Creare o cambiare una saga fatta a mano: un nome e i film della videoteca
// che ci vanno dentro. I film sono quelli già riconosciuti (con un titolo di
// TMDB): la saga li ritrova per titolo, anche se il file cambia.
export interface FilmSceglibile {
  chiave: string // `movie-<id>`
  titolo: string
  anno: string | null
  poster: string | null // indirizzo della locandina piccola
}

export default function ModificaSaga({
  film,
  iniziale,
  onSalva,
  onSciogli,
  salvando = false,
}: {
  film: FilmSceglibile[]
  iniziale?: { nome: string; chiavi: Set<string> }
  onSalva: (nome: string, chiavi: string[]) => void
  onSciogli?: () => void
  salvando?: boolean
}) {
  const [nome, setNome] = useState(iniziale?.nome ?? '')
  const [scelti, setScelti] = useState<Set<string>>(() => new Set(iniziale?.chiavi ?? []))
  const [cerca, setCerca] = useState('')
  const visibili = film.filter((f) => corrispondeRicerca(cerca, [f.titolo]))
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
          Nome della saga
        </label>
        <input id="nome-saga" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Pixar anni 90" className="input-cine w-full" />
      </div>
      <div>
        <label htmlFor="cerca-saga" className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
          Cerca un film
        </label>
        <input id="cerca-saga" value={cerca} onChange={(e) => setCerca(e.target.value)} className="input-cine w-full" />
      </div>
      <p className="text-xs text-zinc-500">{scelti.size === 1 ? '1 film scelto' : `${scelti.size} film scelti`}</p>
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
        {visibili.length === 0 && <li className="px-2 text-sm text-zinc-500">Nessun film riconosciuto con questo nome.</li>}
      </ul>
      <div className="flex flex-wrap items-center gap-3 border-t border-theatre-800 pt-3">
        <button type="button" disabled={!pronta} onClick={() => onSalva(nome.trim(), [...scelti])} className="btn-primary px-4 py-1.5">
          {salvando ? 'Salvo…' : iniziale ? 'Salva' : 'Crea la saga'}
        </button>
        {onSciogli && (
          // I file restano: torna solo ogni film al suo posto nell'elenco.
          <button type="button" onClick={onSciogli} className="text-xs text-zinc-500 transition hover:text-red-400">
            Sciogli la saga
          </button>
        )}
      </div>
    </div>
  )
}
