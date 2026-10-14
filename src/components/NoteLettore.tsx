// Sotto il lettore, due note su da dove arriva il video e da dove i
// sottotitoli: dal server di casa o dal dispositivo.
export default function NoteLettore({ casa, diretto }: { casa: boolean; diretto: boolean }) {
  return (
    <div className="grid gap-3 text-sm text-zinc-400 sm:grid-cols-2">
      {casa ? (
        <>
          <div className="rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
            <p className="mb-1 font-medium text-zinc-200">🏠 Dal server di casa</p>
            <p>
              {diretto
                ? 'Il file arriva dal disco del PC così com’è, alla sua qualità piena.'
                : 'Jellyfin converte il video al volo per il browser (formato o lingua): il PC lavora mentre guardi.'}{' '}
              Le altre lingue dell’audio si scelgono dal pulsante 🗣, i sottotitoli dal CC.
            </p>
          </div>
          <div className="rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
            <p className="mb-1 font-medium text-zinc-200">💬 Da dove arrivano i sottotitoli</p>
            <p>
              Quelli che Jellyfin conosce: i file <code>.srt</code> accanto al video e quelli dentro il
              file. Il plugin OpenSubtitles di Jellyfin li scarica da sé per quelli che mancano.
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
            <p className="mb-1 font-medium text-zinc-200">💽 Dal dispositivo</p>
            <p>
              Il browser legge il file dal disco man mano, senza caricarlo da nessuna parte. MP4 e WebM
              partono ovunque; un MKV spesso no: convertilo prima con prepara-ciak. Le lingue dell’audio
              preparate da prepara-ciak si scelgono dal pulsante 🗣.
            </p>
          </div>
          <div className="rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
            <p className="mb-1 font-medium text-zinc-200">💬 Sottotitoli</p>
            <p>
              Prima i file <code>.srt</code> accanto al video (o scelti insieme al film): un nome che
              finisce in <code>.it.srt</code> o <code>.en.srt</code> dice la lingua. Se manca una lingua,
              OpenSubtitles, e quello trovato si salva accanto al video per la volta dopo.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
