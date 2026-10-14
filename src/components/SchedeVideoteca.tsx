// Le schede della videoteca: «Tutto» e una per cartella di primo livello
// (FILM, SERIE TV, ANIME…), col numero di video di ciascuna.
export default function SchedeVideoteca({
  schede,
  totale,
  scelta,
  onScegli,
}: {
  schede: { cartella: string | null; nome: string; quanti: number }[]
  totale: number
  scelta: string
  onScegli: (valore: string) => void
}) {
  return (
    <div role="tablist" aria-label="Categorie della videoteca" className="mb-3 flex flex-wrap gap-1">
      {[{ valore: '*', nome: 'Tutto', quanti: totale }, ...schede.map((c) => ({ valore: c.cartella ?? '', nome: c.nome, quanti: c.quanti }))].map((c) => (
        <button
          key={c.valore}
          type="button"
          role="tab"
          aria-selected={scelta === c.valore}
          onClick={() => onScegli(c.valore)}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
            scelta === c.valore ? 'bg-theatre-800 text-projector' : 'text-zinc-400 hover:text-zinc-100'
          }`}
        >
          {c.nome} <span className="text-zinc-500">{c.quanti}</span>
        </button>
      ))}
    </div>
  )
}
