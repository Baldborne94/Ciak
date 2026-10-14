import { nomeLingua } from '../lib/sottotitoli'

// Sotto il lettore: quali sottotitoli ci sono (o perché no), la scelta anche
// senza aprire il CC, e «Prova un altro» per una traccia fuori sincrono.
export default function RigaSottotitoli({
  testo,
  nomi,
  chiavi,
  scelto,
  onScegli,
  altri,
  onProvaAltro,
}: {
  testo: string
  nomi: string[]
  // Una per traccia, per React: l'indirizzo della traccia.
  chiavi: string[]
  scelto: number
  onScegli: (indice: number) => void
  // Le tracce trovate online che hanno un altro candidato da provare.
  altri: { chiave: string; lingua: string | null }[]
  onProvaAltro: (chiave: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <p className="text-zinc-300">💬 {testo}</p>
      {nomi.length > 0 && (
        <label className="flex items-center gap-2 text-zinc-400">
          Mostra
          <select
            value={scelto}
            onChange={(e) => onScegli(Number(e.target.value))}
            className="rounded-lg border border-theatre-700 bg-theatre-950 px-2 py-1 text-zinc-100"
          >
            <option value={-1}>Nessun sottotitolo</option>
            {nomi.map((nome, i) => (
              <option key={chiavi[i]} value={i}>
                {nome}
              </option>
            ))}
          </select>
        </label>
      )}
      {altri.map((t) => (
        <button key={t.chiave} type="button" onClick={() => onProvaAltro(t.chiave)} className="btn-ghost px-3 py-1.5">
          {nomeLingua(t.lingua)} fuori sincrono? Prova un altro
        </button>
      ))}
    </div>
  )
}
