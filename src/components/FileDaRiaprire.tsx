import ApriFilmLocale from './ApriFilmLocale'
import ScegliCartella from './ScegliCartella'
import { cartellaCollegata, cartellaScelta } from '../lib/cartellaLocale'

// Sopra il lettore, quando il file del disco non c'è più: riaprendo Ciak (o
// dalla cronologia) il browser non lascia riaprirlo da solo. Con la cartella
// collegata basta ridargli il permesso; senza, il file va scelto di nuovo.
export default function FileDaRiaprire({
  cartellaDaRiaprire,
  nomeFile,
  onRiaperta,
}: {
  cartellaDaRiaprire: boolean
  nomeFile: string | undefined
  onRiaperta: () => void
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center text-sm text-zinc-300">
      {cartellaDaRiaprire ? (
        <>
          <p>
            {cartellaScelta()
              ? 'Questo browser lascia leggere la cartella dei film solo per una visita: sceglila di nuovo.'
              : 'Il browser chiede di nuovo il permesso di leggere la cartella dei film.'}
          </p>
          <ScegliCartella
            riapri
            etichetta={`📂 Riapri la cartella «${cartellaCollegata()}»`}
            className="btn-primary"
            onFatto={onRiaperta}
          />
        </>
      ) : (
        <>
          <p>
            {cartellaCollegata()
              ? `Questo video${nomeFile ? ` (${nomeFile})` : ''} non è più nella cartella collegata: è stato spostato o cancellato? Puoi sceglierlo a mano.`
              : `Questo film è sul tuo dispositivo${nomeFile ? ` (${nomeFile})` : ''}: sceglilo di nuovo per guardarlo, il browser non lascia riaprire un file da solo.`}
          </p>
          <ApriFilmLocale grande />
        </>
      )}
    </div>
  )
}
