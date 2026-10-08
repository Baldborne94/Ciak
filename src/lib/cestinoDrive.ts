import { sottotitoliPerVideo, type FileCartella } from './sottotitoli'

// Cosa spostare nel cestino di Drive quando si cancella un video da Ciak.
// Logica pura, separata da googleDrive.ts per provarla senza rete.
//
// Col video vanno i suoi sottotitoli (gli stessi che il lettore gli
// attribuisce: vedi sottotitoliPerVideo), altrimenti restano .srt orfani
// che Ciak attribuirebbe al prossimo video della cartella. Se la cartella
// resta vuota ed è una cartella dedicata (quella del film, o una stagione),
// nel cestino va la cartella intera, e Drive porta con sé il contenuto: una
// cartella vuota non serve a nessuno. «Ciak» e le categorie subito sotto
// (FILM, SERIE TV…) restano sempre, perché le usa lo script e le aspetta
// l'elenco.

export interface CartellaDrive {
  id: string
  name: string
}

export interface PianoCestino {
  // I file da cestinare uno per uno (il video e i suoi sottotitoli)…
  file: string[]
  // …oppure la cartella intera, che li contiene e non contiene altro.
  cartella: string | null
}

export function pianoCestino(args: {
  // Il video da cancellare, o più video della stessa cartella (una stagione
  // intera, i film di una saga): allora la cartella si guarda una volta sola.
  video: { id: string; name: string } | { id: string; name: string }[]
  cartella: CartellaDrive | null
  // I file (non le cartelle) nella cartella del video, video compreso.
  vicini: FileCartella[]
  sottocartelle: number
  // Il nome della cartella sopra a quella del video; null se non si sa.
  nomeCartellaSopra: string | null
  // Il nome della cartella radice («Ciak»): si passa per non importare
  // googleDrive.ts da qui, che a sua volta importa questo modulo.
  radice: string
}): PianoCestino {
  const { cartella, vicini, sottocartelle, nomeCartellaSopra, radice } = args
  const video = Array.isArray(args.video) ? args.video : [args.video]
  const file = [...new Set(video.flatMap((v) => [v.id, ...sottotitoliPerVideo(v.name, vicini).map((s) => s.id)]))]
  const resta = vicini.some((f) => !file.includes(f.id)) || sottocartelle > 0
  const dedicata =
    cartella !== null &&
    cartella.name !== radice &&
    nomeCartellaSopra !== null &&
    nomeCartellaSopra !== radice
  if (cartella && dedicata && !resta) return { file: [], cartella: cartella.id }
  return { file, cartella: null }
}

// Dopo aver cestinato le stagioni, la cartella della serie sopra di loro può
// restare vuota: allora va anche lei, come la cartella di un film. Mai «Ciak»
// né una categoria (FILM, SERIE TV…), che lo script e l'elenco si aspettano.
export function cartellaDaChiudere(args: {
  nome: string
  nomeSopra: string | null
  file: number
  sottocartelle: number
  radice: string
}): boolean {
  const { nome, nomeSopra, file, sottocartelle, radice } = args
  return nome !== radice && nomeSopra !== null && nomeSopra !== radice && file === 0 && sottocartelle === 0
}
