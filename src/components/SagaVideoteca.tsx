import { useState, type ReactNode } from 'react'

// Una saga della videoteca (Alien, Harry Potter…): una riga con la locandina
// della collezione e quanti film ci sono; aperta, i film in ordine di uscita.
// I film li disegna la pagina (`children`), uguali a quelli dell'elenco.
export default function SagaVideoteca({
  nome,
  poster,
  quanti,
  visti,
  anni,
  apertaSempre = false,
  children,
}: {
  nome: string
  poster: string | null
  quanti: number
  visti: number
  anni: string | null // «1979–2017»
  // Mentre si cerca: la saga compare perché un suo film corrisponde, e
  // chiusa nasconderebbe proprio quello.
  apertaSempre?: boolean
  children: ReactNode
}) {
  const [apertaQui, setApertaQui] = useState(false)
  const aperta = apertaSempre || apertaQui
  const idElenco = `saga-${nome.replace(/\W+/g, '-')}`
  return (
    <>
      <button
        type="button"
        onClick={() => setApertaQui((a) => !a)}
        aria-expanded={aperta}
        aria-controls={idElenco}
        className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition hover:bg-theatre-800/60"
      >
        {poster ? (
          <img src={poster} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded object-cover" />
        ) : (
          <span aria-hidden="true" className="flex h-14 w-10 shrink-0 items-center justify-center text-xl">
            🗂️
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-zinc-100">
            {nome} <span className="text-zinc-500">{aperta ? '▾' : '▸'}</span>
          </span>
          <span className="block truncate text-xs text-zinc-500">
            Saga · {quanti} film
            {anni && ` · ${anni}`}
            {visti > 0 && ` · ${visti === quanti ? 'tutti visti' : `${visti} visti`}`}
          </span>
        </span>
      </button>
      {aperta && (
        <ul id={idElenco} aria-label={`Film di ${nome}`} className="divide-y divide-theatre-800 border-t border-theatre-800 bg-theatre-950/40 pl-6">
          {children}
        </ul>
      )}
    </>
  )
}
