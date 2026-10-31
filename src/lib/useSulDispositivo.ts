import { useCallback, useEffect, useMemo, useState } from 'react'
import { ascoltaFilmOffline, elencaFilmOffline, offlineDisponibile, spazio, type FilmOffline } from './filmOffline'

// I film salvati sul dispositivo, per la videoteca: si vedono anche senza
// rete, ed è il motivo per cui esistono. Si controlla `onLine` prima di
// tentare la rete: aspettare un timeout offline vuol dire fissare una pagina
// vuota per secondi.
export function useSulDispositivo() {
  const [offline, setOffline] = useState<FilmOffline[]>([])
  const [senzaRete, setSenzaRete] = useState(typeof navigator !== 'undefined' && !navigator.onLine)
  const [spazioUsato, setSpazioUsato] = useState<number | null>(null)
  // L'elenco è stato letto almeno una volta: prima, «nessun film salvato» vuol
  // dire solo «non lo so ancora» (vedi useSerieInCiak).
  const [offlineLetto, setOfflineLetto] = useState(!offlineDisponibile())

  const caricaOffline = useCallback(async () => {
    if (!offlineDisponibile()) return
    setOffline(await elencaFilmOffline())
    setOfflineLetto(true)
    setSpazioUsato((await spazio())?.usato ?? null)
  }, [])
  useEffect(() => {
    void caricaOffline()
    return ascoltaFilmOffline(() => void caricaOffline())
  }, [caricaOffline])
  useEffect(() => {
    const aggiorna = () => setSenzaRete(!navigator.onLine)
    window.addEventListener('online', aggiorna)
    window.addEventListener('offline', aggiorna)
    return () => {
      window.removeEventListener('online', aggiorna)
      window.removeEventListener('offline', aggiorna)
    }
  }, [])
  // Gli id dei film già salvati per intero. Lo stesso insieme finché l'elenco
  // non cambia: chi tiene le serie in Ciak ci ricalcola il da farsi.
  const scaricati = useMemo(() => new Set(offline.filter((f) => f.stato === 'completo').map((f) => f.id)), [offline])
  return { offline, offlineLetto, senzaRete, spazioUsato, scaricati }
}
