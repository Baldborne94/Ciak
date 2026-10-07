import { mapLimit } from './mapLimit'
import { logFailure } from './logFailure'
import { fetchAlternativeTitles, fetchOriginalTitle, isReadableTitle, searchMulti } from './tmdb'
import { filmDaCercare } from './sottotitoli'
import { chiaveSerie } from './videoteca'
import { abbinamentoDa, contaComeVisto, salvaStreaming, scegliAbbinamento, type VoceStreaming } from './streaming'
import { markEpisode } from './episodes'
import { progressiDaEreditare } from './progressiEreditati'
import type { DriveVideo } from './googleDrive'
import type { MediaItem } from './types'
import type { NomeFilm } from './sottotitoli'

// Il titolo da salvare: quello originale del film, che è poi quello del file
// che si guarda; tradotto solo se è in un alfabeto che non si legge. La
// ricerca unisce risultati in italiano e in inglese, e prima si salvava il
// titolo di chi rispondeva per primo: metà lista tradotta e metà no.
export async function titoloDaSalvare(item: MediaItem): Promise<string> {
  if (isReadableTitle(item.originalTitle)) return item.originalTitle as string
  try {
    return await fetchOriginalTitle(item.mediaType, item.id)
  } catch {
    return item.title
  }
}

// I titoli già salvati prima di questa correzione si ricontrollano una volta
// per dispositivo: rifarlo a ogni apertura della lista vorrebbe dire una
// richiesta a TMDB per file, ogni volta.
const CHIAVE_TITOLO_IT = 'ciak:titolo-originale-v1:'
function giaControllato(fileId: string): boolean {
  try {
    return localStorage.getItem(CHIAVE_TITOLO_IT + fileId) === '1'
  } catch {
    return true
  }
}
function segnaControllato(fileId: string): void {
  try {
    localStorage.setItem(CHIAVE_TITOLO_IT + fileId, '1')
  } catch {
    /* pazienza: si ricontrollerà */
  }
}

// Quando Ciak impara a leggere meglio i nomi (le cartelle di stagione delle
// serie, per esempio), i file rimasti senza titolo meritano un nuovo tentativo:
// uno solo per versione e per dispositivo.
// v3: i file provati prima che si leggessero i titoli alternativi.
// v4: gli episodi nelle raccolte («South Park Season 1 to 26 Mp4 1080p»).
// v5: gli anime coi nomi «[Gruppo] titolo - 05», e gli speciali in cartelle
// scritte male («Speicals»).
// v6: i film finiti sotto una serie di un altro anno («Memories of Murder
// (2003)» abbinato a «Gap Dong», 2014).
// v7: gli anime senza trattini («[Gruppo]Titolo_17v2_[BD_720p]…»).
const VERSIONE_RICONOSCIMENTO = 7
const CHIAVE_RIPROVATO = `ciak:riconoscimento-v${VERSIONE_RICONOSCIMENTO}:`
function giaRiprovato(fileId: string): boolean {
  try {
    return localStorage.getItem(CHIAVE_RIPROVATO + fileId) === '1'
  } catch {
    return true
  }
}
function segnaRiprovato(fileId: string): void {
  try {
    localStorage.setItem(CHIAVE_RIPROVATO + fileId, '1')
  } catch {
    /* pazienza: si riproverà */
  }
}

// Collega ai titoli di TMDB i file di Drive che non lo sono ancora. Si prova
// una volta sola per file: se non si trova niente la riga resta senza titolo,
// e l'abbinamento si sceglie a mano dal lettore. Riprovare a ogni apertura
// della lista vorrebbe dire le stesse ricerche inutili ogni volta.
export async function riconosciNuovi(
  userId: string,
  video: DriveVideo[],
  noti: Map<string, VoceStreaming>,
  // Tutti i file su Drive, anche quelli che la videoteca non mostra: un file
  // che c'è ancora non è «sostituito», e non cede i suoi progressi.
  presenti: Set<string> = new Set(video.map((v) => v.id)),
): Promise<Map<string, VoceStreaming>> {
  const esito = new Map(noti)
  let falliti = 0
  // Quando Ciak impara a leggere meglio un nome, le righe già abbinate si
  // allineano: «S01E13.5» salvato come S1E13 diventa uno speciale. Una
  // scrittura solo per le righe che non tornano, e mai su una scelta a mano.
  const daRileggere = video.flatMap((v) => {
    const r = noti.get(v.id)
    if (r?.media_type !== 'tv' || !r.tmdb_id || r.abbinato_a_mano) return []
    const letto = filmDaCercare(v.name, v.cartella, v.serie ?? null)
    if (letto.stagione === undefined) return []
    const campi = { stagione: letto.stagione, episodio: letto.episodio ?? null }
    return r.stagione === campi.stagione && r.episodio === campi.episodio ? [] : [{ r, campi }]
  })
  await mapLimit(daRileggere, 3, async ({ r, campi }) => {
    try {
      await salvaStreaming(userId, r.drive_file_id, campi)
      esito.set(r.drive_file_id, { ...r, ...campi })
    } catch {
      falliti++
    }
  })
  // Un episodio prende la serie dai suoi vicini di cartella già riconosciuti,
  // senza cercare niente, anche se un tentativo l'aveva già fatto: S1E1 provato
  // prima che Ciak sapesse leggere «Shingeki no Kyojin» restava scoperto per
  // sempre, e la pagina della serie proponeva di cominciare da S1E2.
  const serieNote = new Map<string, VoceStreaming>()
  for (const v of video) {
    const r = noti.get(v.id)
    if (r?.media_type === 'tv' && r.tmdb_id && !serieNote.has(chiaveSerie(v))) serieNote.set(chiaveSerie(v), r)
  }
  const ereditati = new Set<string>()
  await mapLimit(
    video.filter((v) => {
      const r = noti.get(v.id)
      return !r?.tmdb_id && !r?.abbinato_a_mano && serieNote.has(chiaveSerie(v))
    }),
    3,
    async (v) => {
      const nome = filmDaCercare(v.name, v.cartella, v.serie ?? null)
      const serie = serieNote.get(chiaveSerie(v)) as VoceStreaming
      if (nome.stagione === undefined) return
      const campi: Partial<VoceStreaming> = {
        nome_file: v.name,
        tmdb_id: serie.tmdb_id,
        media_type: 'tv',
        titolo: serie.titolo,
        poster_path: serie.poster_path,
        stagione: nome.stagione,
        episodio: nome.episodio ?? null,
      }
      try {
        await salvaStreaming(userId, v.id, campi)
        esito.set(v.id, { ...(noti.get(v.id) ?? voceVuota(v.id)), ...campi })
        ereditati.add(v.id)
        segnaRiprovato(v.id)
        // Il titolo è quello del fratello: se il suo è già verificato, lo è anche questo.
        if (giaControllato(serie.drive_file_id)) segnaControllato(v.id)
      } catch {
        falliti++
      }
    },
  )

  const senzaTitolo = (v: DriveVideo) => {
    const r = noti.get(v.id)
    return !!r && !r.tmdb_id && !r.abbinato_a_mano && !giaRiprovato(v.id)
  }
  // Un file che non è un episodio ma è abbinato a una serie: con le regole di
  // prima un film poteva finire sotto una serie omonima di un altro anno. Si
  // riprova una volta per versione; una scelta a mano non si tocca.
  const filmSottoSerie = (v: DriveVideo) => {
    const r = noti.get(v.id)
    if (r?.media_type !== 'tv' || !r.tmdb_id || r.abbinato_a_mano || giaRiprovato(v.id)) return false
    return filmDaCercare(v.name, v.cartella, v.serie ?? null).stagione === undefined
  }
  const daFare = video.filter((v) => !ereditati.has(v.id) && (!noti.has(v.id) || senzaTitolo(v) || filmSottoSerie(v)))
  // Gli episodi di una serie cercano tutti la stessa cosa («South Park»): una
  // ricerca e un titolo originale per serie, non uno per file. Con 264
  // episodi erano 264 ricerche identiche, e il riconoscimento non finiva mai.
  const ricerche = new Map<string, Promise<MediaItem[]>>()
  const cerca = (q: string) => {
    const k = q.trim().toLowerCase()
    let p = ricerche.get(k)
    if (!p) {
      p = searchMulti(q)
      // Una ricerca fallita si riprova al file dopo, invece di far fallire tutti.
      p.catch(() => ricerche.delete(k))
      ricerche.set(k, p)
    }
    return p
  }
  // Se nessun titolo combacia, gli altri nomi dei primi risultati: TMDB li
  // trova cercando («Shingeki no Kyojin» porta ad Attack on Titan) ma non li
  // riporta. Una richiesta per candidato, solo quando serve, e una sola volta
  // per serie.
  const alternativi = new Map<string, Promise<string[]>>()
  const conAltriTitoli = async (nome: NomeFilm, risultati: MediaItem[]): Promise<MediaItem | null> => {
    const episodio = nome.stagione !== undefined
    const candidati = risultati.filter((r) => !episodio || r.mediaType === 'tv').slice(0, 3)
    if (candidati.length === 0) return null
    const altri = new Map<string, string[]>()
    for (const c of candidati) {
      const k = `${c.mediaType}-${c.id}`
      let p = alternativi.get(k)
      if (!p) {
        p = fetchAlternativeTitles(c.mediaType, c.id).catch(() => [] as string[])
        alternativi.set(k, p)
      }
      altri.set(k, await p)
    }
    return scegliAbbinamento(nome, risultati, altri)
  }
  const titoli = new Map<string, Promise<string>>()
  const titoloDi = (item: MediaItem) => {
    const k = `${item.mediaType}-${item.id}`
    let p = titoli.get(k)
    if (!p) {
      p = titoloDaSalvare(item)
      titoli.set(k, p)
    }
    return p
  }
  await mapLimit(daFare, 3, async (v) => {
    const nome = filmDaCercare(v.name, v.cartella, v.serie ?? null)
    // Un abbinamento di prima si toglie, se la nuova ricerca non ne trova uno.
    const azzera: Partial<VoceStreaming> = noti.get(v.id)?.tmdb_id
      ? { tmdb_id: null, media_type: null, titolo: null, poster_path: null, stagione: null, episodio: null }
      : {}
    let campi: Partial<VoceStreaming> = { nome_file: v.name, ...azzera }
    try {
      const risultati = await cerca(nome.titolo)
      const scelto = scegliAbbinamento(nome, risultati) ?? (await conAltriTitoli(nome, risultati))
      if (scelto) {
        campi = { ...campi, ...abbinamentoDa(scelto, nome), titolo: await titoloDi(scelto) }
        segnaControllato(v.id)
      }
      await salvaStreaming(userId, v.id, campi)
      esito.set(v.id, { ...(noti.get(v.id) ?? voceVuota(v.id)), ...campi })
      segnaRiprovato(v.id)
    } catch {
      falliti++
    }
  })
  // I titoli salvati prima, forse tradotti: una verifica sola per file. Vale
  // anche per quelli scelti a mano, di cui cambia solo la lingua del titolo.
  const daCorreggere = [...esito.values()].filter(
    (r) => r.tmdb_id && r.media_type && !giaControllato(r.drive_file_id),
  )
  // Anche qui una richiesta per titolo, non per episodio.
  const originali = new Map<string, Promise<string>>()
  await mapLimit(daCorreggere, 3, async (r) => {
    try {
      const k = `${r.media_type}-${r.tmdb_id}`
      let p = originali.get(k)
      if (!p) {
        p = fetchOriginalTitle(r.media_type as 'movie' | 'tv', r.tmdb_id as number)
        p.catch(() => originali.delete(k))
        originali.set(k, p)
      }
      const titolo = await p
      if (titolo && titolo !== r.titolo) {
        await salvaStreaming(userId, r.drive_file_id, { titolo })
        esito.set(r.drive_file_id, { ...r, titolo })
      }
      segnaControllato(r.drive_file_id)
    } catch {
      falliti++
    }
  })
  // I file sostituiti su Drive (ricodificati, ricaricati): il nuovo prende
  // «visto» e posizione dal vecchio. Dopo il riconoscimento, perché serve
  // sapere di che titolo ed episodio è il file nuovo.
  await mapLimit(progressiDaEreditare([...esito.values()], presenti), 3, async ({ fileId, campi }) => {
    try {
      await salvaStreaming(userId, fileId, campi)
      esito.set(fileId, { ...(esito.get(fileId) ?? voceVuota(fileId)), ...campi })
    } catch {
      falliti++
    }
  })
  // Gli episodi visti fino in fondo prima di essere riconosciuti: a fine
  // episodio il lettore non sapeva cosa spuntare, e la videoteca proponeva
  // «Riprendi» su un episodio finito. Si spunta ora, come avrebbe fatto lui.
  const daSpuntare = [...esito.values()].filter(
    (r) =>
      r.media_type === 'tv' &&
      r.tmdb_id &&
      r.stagione != null &&
      r.episodio != null &&
      !r.visto_il &&
      contaComeVisto(r.posizione, r.durata, r.secondi_visti ?? 0),
  )
  await mapLimit(daSpuntare, 3, async (r) => {
    try {
      await markEpisode(userId, r.tmdb_id as number, r.stagione as number, r.episodio as number)
      const visto_il = new Date().toISOString()
      await salvaStreaming(userId, r.drive_file_id, { visto_il })
      esito.set(r.drive_file_id, { ...r, visto_il })
    } catch {
      falliti++
    }
  })
  // Una volta col totale, non a ogni file.
  if (falliti > 0) logFailure('Riconoscimento dei film di Drive')(new Error(`${falliti} file su ${daFare.length} non riconosciuti per errore`))
  return esito
}

// Il titolo scelto a mano dalla videoteca, per tutti i file di una serie (o
// per un film): ogni episodio tiene stagione ed episodio letti dal suo nome.
// A mano vuol dire per sempre: il riconoscimento non ci torna sopra.
export async function abbinaAMano(
  userId: string,
  video: Pick<DriveVideo, 'id' | 'name' | 'cartella' | 'serie'>[],
  item: MediaItem,
): Promise<Map<string, Partial<VoceStreaming>>> {
  const titolo = await titoloDaSalvare(item)
  const esito = new Map<string, Partial<VoceStreaming>>()
  let falliti = 0
  await mapLimit(video, 3, async (v) => {
    const nome = filmDaCercare(v.name, v.cartella, v.serie ?? null)
    const campi = { nome_file: v.name, ...abbinamentoDa(item, nome), titolo, abbinato_a_mano: true }
    try {
      await salvaStreaming(userId, v.id, campi)
      esito.set(v.id, campi)
      segnaControllato(v.id)
    } catch {
      falliti++
    }
  })
  if (falliti > 0) {
    const errore = new Error(`${falliti} file su ${video.length} non salvati`)
    logFailure('Titolo scelto dalla videoteca')(errore)
    if (esito.size === 0) throw errore
  }
  return esito
}

export function voceVuota(fileId: string, campi: Partial<VoceStreaming> = {}): VoceStreaming {
  return {
    drive_file_id: fileId,
    nome_file: null,
    tmdb_id: null,
    media_type: null,
    titolo: null,
    poster_path: null,
    stagione: null,
    episodio: null,
    abbinato_a_mano: false,
    posizione: 0,
    durata: null,
    secondi_visti: 0,
    visto_il: null,
    ...campi,
  }
}
