import { mapLimit } from './mapLimit'
import { logFailure } from './logFailure'
import { searchMulti } from './tmdb'
import { filmDaCercare } from './sottotitoli'
import { abbinamentoDa, salvaStreaming, scegliAbbinamento, type VoceStreaming } from './streaming'
import type { DriveVideo } from './googleDrive'

// Collega ai titoli di TMDB i file di Drive che non lo sono ancora. Si prova
// una volta sola per file: se non si trova niente la riga resta senza titolo,
// e l'abbinamento si sceglie a mano dal lettore. Riprovare a ogni apertura
// della lista vorrebbe dire le stesse ricerche inutili ogni volta.
export async function riconosciNuovi(
  userId: string,
  video: DriveVideo[],
  noti: Map<string, VoceStreaming>,
): Promise<Map<string, VoceStreaming>> {
  const daFare = video.filter((v) => !noti.has(v.id))
  const esito = new Map(noti)
  let falliti = 0
  await mapLimit(daFare, 3, async (v) => {
    const nome = filmDaCercare(v.name, v.cartella)
    let campi: Partial<VoceStreaming> = { nome_file: v.name }
    try {
      const scelto = scegliAbbinamento(nome, await searchMulti(nome.titolo))
      if (scelto) campi = { ...campi, ...abbinamentoDa(scelto, nome) }
      await salvaStreaming(userId, v.id, campi)
      esito.set(v.id, voceVuota(v.id, campi))
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
