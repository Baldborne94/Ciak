import { mapLimit } from './mapLimit'
import { logFailure } from './logFailure'
import { fetchOriginalTitle, isReadableTitle, searchMulti } from './tmdb'
import { filmDaCercare } from './sottotitoli'
import { abbinamentoDa, salvaStreaming, scegliAbbinamento, type VoceStreaming } from './streaming'
import type { DriveVideo } from './googleDrive'
import type { MediaItem } from './types'

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
const VERSIONE_RICONOSCIMENTO = 2
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
): Promise<Map<string, VoceStreaming>> {
  const senzaTitolo = (v: DriveVideo) => {
    const r = noti.get(v.id)
    return !!r && !r.tmdb_id && !r.abbinato_a_mano && !giaRiprovato(v.id)
  }
  const daFare = video.filter((v) => !noti.has(v.id) || senzaTitolo(v))
  const esito = new Map(noti)
  let falliti = 0
  await mapLimit(daFare, 3, async (v) => {
    const nome = filmDaCercare(v.name, v.cartella, v.serie ?? null)
    let campi: Partial<VoceStreaming> = { nome_file: v.name }
    try {
      const scelto = scegliAbbinamento(nome, await searchMulti(nome.titolo))
      if (scelto) {
        campi = { ...campi, ...abbinamentoDa(scelto, nome), titolo: await titoloDaSalvare(scelto) }
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
  await mapLimit(daCorreggere, 3, async (r) => {
    try {
      const titolo = await fetchOriginalTitle(r.media_type as 'movie' | 'tv', r.tmdb_id as number)
      if (titolo && titolo !== r.titolo) {
        await salvaStreaming(userId, r.drive_file_id, { titolo })
        esito.set(r.drive_file_id, { ...r, titolo })
      }
      segnaControllato(r.drive_file_id)
    } catch {
      falliti++
    }
  })
  // Una volta col totale, non a ogni file.
  if (falliti > 0) logFailure('Riconoscimento dei film di Drive')(new Error(`${falliti} file su ${daFare.length} non riconosciuti per errore`))
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
