// Una raccolta della videoteca come le collezioni di TMDB: un riquadro largo
// con l'immagine scelta (o, finché non se ne sceglie una, un mosaico con le
// locandine dei primi titoli), sfumata in basso, e sopra il nome. Toccandolo
// si apre sotto la fila, coi titoli.
export default function RiquadroRaccolta({
  nome,
  copertina,
  mosaico,
  quanti,
  visti,
  aperta,
  onApri,
}: {
  nome: string
  copertina: string | null // l'indirizzo dell'immagine scelta
  mosaico: string[] // le locandine per il mosaico, già come indirizzi
  quanti: number
  visti: number
  aperta: boolean
  onApri: () => void
}) {
  const locandine = mosaico.slice(0, 4)
  return (
    <button
      type="button"
      onClick={onApri}
      aria-expanded={aperta}
      className={`group relative aspect-video w-72 shrink-0 snap-start overflow-hidden rounded-xl border text-left shadow-reel transition sm:w-80 ${
        aperta ? 'border-projector ring-2 ring-projector/60' : 'border-theatre-800 hover:border-projector/50'
      }`}
    >
      {copertina ? (
        <img src={copertina} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      ) : locandine.length > 0 ? (
        <span className="absolute inset-0 grid grid-cols-4 bg-theatre-900">
          {locandine.map((src) => (
            <img key={src} src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
          ))}
        </span>
      ) : (
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-theatre-900 text-4xl">
          🗂️
        </span>
      )}
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
      <span className="absolute inset-x-0 bottom-0 p-3">
        <span className="block truncate font-display text-2xl tracking-wide text-white drop-shadow">{nome}</span>
        <span className="block text-xs text-zinc-300">
          {quanti === 1 ? '1 titolo' : `${quanti} titoli`}
          {visti > 0 && ` · ${visti === 1 ? '1 visto' : `${visti} visti`}`}
        </span>
      </span>
    </button>
  )
}
