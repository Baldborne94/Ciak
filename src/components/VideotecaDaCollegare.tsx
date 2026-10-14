import ApriFilmLocale from './ApriFilmLocale'
import CollegaJellyfin from './CollegaJellyfin'
import ScegliCartella from './ScegliCartella'
import { cartellaDisponibile } from '../lib/cartellaLocale'

// La videoteca senza fonti collegate: le tre strade per guardare i film del
// disco (la cartella del PC, un film alla volta, il server di casa).
export default function VideotecaDaCollegare({
  onCartellaPronta,
  onErrore,
  moduloCasa,
  onModuloCasa,
  onCasaCollegata,
}: {
  onCartellaPronta: () => void
  onErrore: (messaggio: string) => void
  moduloCasa: boolean
  onModuloCasa: (aperto: boolean) => void
  onCasaCollegata: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dashed border-theatre-700 p-8 text-center">
        <p className="mb-4 text-zinc-400">
          Collega la cartella dei film del PC (per esempio <code>E:\Ciak</code>, con dentro FILM,
          SERIE TV, ANIME…): Ciak la legge come una videoteca, con le serie divise in stagioni,
          l’episodio dopo e i sottotitoli accanto ai video. I file restano dove sono.
        </p>
        <ScegliCartella etichetta="📂 Collega la cartella dei film" className="btn-primary" onFatto={onCartellaPronta} onErrore={onErrore} />
        {!cartellaDisponibile() && (
          <p className="mt-3 text-xs text-zinc-500">
            In questo browser la cartella va scelta a ogni visita (il browser chiede se «caricare» i
            file: non si carica niente, Ciak li legge dal disco). Con Chrome o Edge basta sceglierla una volta.
          </p>
        )}
      </div>
      <div className="rounded-2xl border border-dashed border-theatre-700 p-8 text-center">
        <p className="mb-4 text-zinc-400">
          Oppure un film alla volta: scegline uno dal disco del PC o dalla
          memoria del tablet (con i suoi sottotitoli .srt, se li hai): parte nel lettore di Ciak,
          senza caricarlo da nessuna parte. Sul tablet puoi salvarlo in Ciak per vederlo anche offline.
        </p>
        <ApriFilmLocale grande />
      </div>
      <div className="rounded-2xl border border-dashed border-theatre-700 p-8 text-center">
        <p className="mb-4 text-zinc-400">
          Oppure i film del disco di casa: con Jellyfin acceso sul PC a cui è attaccato, Ciak li
          legge da lì, in casa e fuori (con Tailscale).
        </p>
        {moduloCasa ? (
          <CollegaJellyfin onCollegato={onCasaCollegata} onAnnulla={() => onModuloCasa(false)} />
        ) : (
          <button onClick={() => onModuloCasa(true)} className="btn-ghost">
            🏠 Collega il server di casa
          </button>
        )}
      </div>
    </div>
  )
}
