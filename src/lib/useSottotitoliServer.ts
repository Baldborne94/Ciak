import { useMemo } from 'react'
import { BLOCCO_HASH, hashOpenSubtitles, type TitoloNoto } from './sottotitoli'
import { flussoDiretto, type InfoJellyfin } from './jellyfin'
import type { FilmAperto } from './filmLocali'
import { logFailure } from './logFailure'
import { useSottotitoliCasa } from './useLettoreCasa'
import { useSottotitoli } from './useSottotitoli'

// I sottotitoli di un video del server di casa: prima quelli che conosce
// Jellyfin (dentro il file e accanto); se non ne ha, si cercano online come per
// i file del disco, e quelli trovati restano in Ciak. Prima Samurai Jack, un AVI
// senza .srt accanto, partiva muto di sottotitoli con un «aggiungili tu».

// L'impronta di OpenSubtitles letta dal server: due richieste per i primi e gli
// ultimi 64 KB del file, invece di scaricarlo. Se il server non lascia leggere
// a pezzi, la ricerca va avanti per nome.
const ATTESA_MS = 4000

export async function hashDalServer(fileId: string, info: InfoJellyfin): Promise<string | undefined> {
  const dimensione = info.dimensione
  const url = flussoDiretto(fileId)
  if (!dimensione || dimensione < 2 * BLOCCO_HASH || !url) return undefined
  try {
    const pezzo = async (da: number) => {
      // Con un tetto: un server lento non deve tenere i sottotitoli in attesa.
      const res = await fetch(url, { headers: { Range: `bytes=${da}-${da + BLOCCO_HASH - 1}` }, signal: AbortSignal.timeout(ATTESA_MS) })
      // Un 200 sarebbe il file intero: meglio senza impronta che scaricarlo.
      if (res.status !== 206) throw new Error(`HTTP ${res.status}`)
      const dati = await res.arrayBuffer()
      if (dati.byteLength !== BLOCCO_HASH) throw new Error(`${dati.byteLength} byte invece di ${BLOCCO_HASH}`)
      return dati
    }
    const [inizio, fine] = await Promise.all([pezzo(0), pezzo(dimensione - BLOCCO_HASH)])
    return hashOpenSubtitles(dimensione, inizio, fine)
  } catch (e) {
    logFailure('Impronta del video del server di casa per OpenSubtitles')(e)
    return undefined
  }
}

export function useSottotitoliServer(fileId: string, info: InfoJellyfin | null, noto: TitoloNoto | null | undefined) {
  const delServer = useSottotitoliCasa(fileId, info)
  // Il video come lo vede la ricerca online: nome e cartelle dal percorso sul
  // NAS, nessun file accanto, niente da scrivere (i trovati restano in Ciak).
  const senzaSottotitoli = delServer.stato === 'nessuno' || delServer.stato === 'errore'
  const virtuale = useMemo<FilmAperto | undefined>(
    () =>
      info && senzaSottotitoli
        ? {
            id: fileId,
            file: new File([], info.nome),
            vicini: [],
            origine: 'scelto',
            cartella: info.cartella,
            serie: info.serie,
            scrivi: null,
            hash: () => hashDalServer(fileId, info),
          }
        : undefined,
    [fileId, info, senzaSottotitoli],
  )
  const online = useSottotitoli(virtuale, noto)
  return virtuale ? { ...online, info: delServer.info } : delServer
}
