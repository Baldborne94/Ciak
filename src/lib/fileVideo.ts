import { analizzaNomeFilm, cartellaRaccolta, filmDaCercare, stagioneDaCartella } from './sottotitoli'

// I video della videoteca, da qualunque parte arrivino (la cartella del PC, i
// file aperti a mano, il server di casa): come si chiamano, in quale scheda
// stanno, quali si mostrano. Logica pura, provata senza rete.

// La cartella dei film: sul disco è quella che si collega (E:\Ciak).
export const CARTELLA_CIAK = 'Ciak'

export interface VideoFile {
  id: string
  name: string
  size: number | null
  mimeType: string
  // Nome della sottocartella che lo contiene (es. «Song of the Sea (2014)
  // [1080p]»), null se sta direttamente nella cartella Ciak o in una
  // cartella di categoria.
  cartella: string | null
  // La cartella di primo livello dentro Ciak (FILM, SERIE TV, ANIME…): è la
  // scheda della videoteca in cui compare. null se sta direttamente in Ciak.
  categoria?: string | null
  // La cartella della serie, quando il file sta in una cartella di stagione
  // («South Park» per South Park/Season 03/01 Rainforest….mp4).
  serie?: string | null
  // Quando è arrivato nella cartella (ISO), per «Aggiunti di recente».
  aggiunto?: string | null
}

// Il lettore di Ciak mostra solo i video che il browser sa riprodurre: MP4 (e
// i pochi WebM/M4V). Gli MKV, anche quando hanno video e audio compatibili,
// Chrome spesso li scarica senza mai aprirli — si convertono una volta con
// prepara-ciak, e l'MP4 prende il loro posto. Quelli nascosti
// si contano, così la pagina lo dice invece di farli sparire in silenzio.
const RIPRODUCIBILI = /\.(mp4|m4v|webm)$/i

export function soloRiproducibili(video: VideoFile[]): { visibili: VideoFile[]; nascosti: number } {
  // Quelli del server di casa (id «jf-») li converte Jellyfin al volo: si
  // vedono tutti, MKV compresi.
  const visibili = video.filter((v) => v.id.startsWith('jf-') || RIPRODUCIBILI.test(v.name))
  return { visibili, nascosti: video.length - visibili.length }
}

// Gli extra dei film: featurette, trailer, interviste, dietro le quinte, scene
// tagliate. Non sono titoli da guardare, e nella videoteca comparivano come
// film a sé («Featurettes», dalla cartella di Paprika). Si contano, come gli
// MKV. Gli «Extras» e gli speciali delle serie restano: sono la stagione 0.
const CARTELLA_EXTRA =
  /^\s*(?:featurettes?|trailers?|interviews?|interviste|behind[ ._-]?the[ ._-]?scenes|dietro le quinte|deleted[ ._-]?scenes|scene tagliate|making[ ._-]?of|samples?)\s*$/i

// Gli scarti delle release, accanto al film: l'anteprima («….Sample.mp4») e il
// promo di pochi MB del gruppo che l'ha fatta («ETRG.mp4»). Nessun film né
// episodio sta sotto i 5 MB; senza misura nota il file resta.
const ANTEPRIMA = /(?:^|[._ -])sample(?:$|[._ -])/i
const MINIMO_BYTE = 5 * 1024 * 1024

function scarto(v: Pick<VideoFile, 'cartella' | 'name' | 'size'>): boolean {
  if (v.cartella && CARTELLA_EXTRA.test(v.cartella)) return true
  if (ANTEPRIMA.test(v.name.replace(/\.[a-z0-9]{2,4}$/i, ''))) return true
  return v.size !== null && v.size < MINIMO_BYTE
}

export function senzaExtra<T extends Pick<VideoFile, 'cartella' | 'name' | 'size'>>(video: T[]): { visibili: T[]; extra: number } {
  const visibili = video.filter((v) => !scarto(v))
  return { visibili, extra: video.length - visibili.length }
}

// Le schede della videoteca, dalle cartelle di primo livello: nell'ordine in
// cui le si pensa (film, serie, anime, cartoni) e poi le altre in ordine
// alfabetico; «Altro» per i video messi direttamente in Ciak.
const ORDINE_CATEGORIE = ['film', 'serie tv', 'serie', 'anime', 'cartoni', 'cartoni animati']

export function nomeCategoria(cartella: string | null): string {
  if (!cartella) return 'Altro'
  const basso = cartella.trim().toLowerCase()
  if (basso === 'serie tv') return 'Serie TV'
  return basso.charAt(0).toUpperCase() + basso.slice(1)
}

export function schedeCategorie(video: Pick<VideoFile, 'categoria'>[]): { cartella: string | null; nome: string; quanti: number }[] {
  const conta = new Map<string | null, number>()
  for (const v of video) conta.set(v.categoria ?? null, (conta.get(v.categoria ?? null) ?? 0) + 1)
  const posto = (c: string | null) => {
    if (c === null) return 1000
    const i = ORDINE_CATEGORIE.indexOf(c.trim().toLowerCase())
    return i === -1 ? 100 : i
  }
  return [...conta.entries()]
    .map(([cartella, quanti]) => ({ cartella, nome: nomeCategoria(cartella), quanti }))
    .sort((a, b) => posto(a.cartella) - posto(b.cartella) || a.nome.localeCompare(b.nome, 'it'))
}

// Il titolo da mostrare: il nome della sottocartella se c'è (di solito il film,
// «Song of the Sea (2014) [1080p]»), altrimenti il nome del file senza
// estensione. Per un episodio, la serie con stagione ed episodio: senza, tutti
// gli episodi di una cartella avrebbero lo stesso nome.
export function titoloVideo(v: Pick<VideoFile, 'name' | 'cartella' | 'serie'>): string {
  const nome = filmDaCercare(v.name, v.cartella, v.serie ?? null)
  const episodio = nome.stagione !== undefined && nome.episodio !== undefined ? `S${nome.stagione}E${nome.episodio}` : null
  if (v.serie && stagioneDaCartella(v.cartella)) {
    // Il nome della serie ripulito: «South Park Season 1 to 26 Mp4 1080p» è
    // una raccolta, la serie è «South Park». L'anno resta: distingue i remake.
    const serie = analizzaNomeFilm(v.serie)
    return `${serie.anno !== undefined ? `${serie.titolo} (${serie.anno})` : serie.titolo} · ${episodio ?? v.cartella}`
  }
  // Il nome di un pacchetto («Transformers Complete Movie Collection») è
  // uguale per tutti i film che contiene: vale quello letto dal file.
  if (v.cartella && cartellaRaccolta(v.cartella) && !episodio) {
    return nome.anno !== undefined ? `${nome.titolo} (${nome.anno})` : nome.titolo
  }
  if (v.cartella) return episodio ? `${v.cartella} · ${episodio}` : v.cartella
  return v.name.replace(/\.[a-z0-9]{2,4}$/i, '')
}

// Gli id dei file sono fatti solo di lettere, cifre, «-» e «_»: tutto il
// resto viene rifiutato prima di finire in un URL.
export function idFileValido(id: string): boolean {
  return /^[\w-]{10,}$/.test(id)
}

export interface InfoFile {
  id: string
  name: string
  size: number | null
  mimeType: string
  parents: string[]
}
