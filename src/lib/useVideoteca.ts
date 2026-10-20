import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import { logFailure } from './logFailure'
import { jellyfinCollegato } from './jellyfin'
import { cartellaCollegata } from './cartellaLocale'
import { conDiario, elencaStreaming, type VoceStreaming } from './streaming'
import { listAllWatchedEpisodes } from './episodes'
import { elencaFilmOffline } from './filmOffline'
import { leggiPresenti, soloPresenti } from './videoPresenti'

// I film della videoteca (i file già collegati ai titoli), letti una
// volta e condivisi: una lista «Da vedere» con cento card non deve fare cento
// richieste. La copia vale un minuto — abbastanza per navigare fra le pagine,
// poco per non mostrare un file appena aggiunto.
const VALIDITA_MS = 60_000
let copia: { userId: string; quando: number; righe: Promise<VoceStreaming[]> } | null = null

function leggi(userId: string): Promise<VoceStreaming[]> {
  if (copia && copia.userId === userId && Date.now() - copia.quando < VALIDITA_MS) return copia.righe
  const diario = listAllWatchedEpisodes(userId).catch((e) => {
    logFailure('Episodi visti per «Guarda ora»')(e)
    return new Map<string, string>()
  })
  const righe = Promise.all([elencaStreaming(userId), diario])
    .then(([r, d]) => conDiario(r, d))
    .catch((e) => {
      logFailure('Videoteca per «Guarda ora»')(e)
      copia = null
      return [] as VoceStreaming[]
    })
  copia = { userId, quando: Date.now(), righe }
  return righe
}

// Dopo il riconoscimento i file hanno un titolo nuovo: la copia di prima
// lascerebbe la scheda della serie senza «Guarda» fino a un minuto.
export function dimenticaVideoteca(): void {
  copia = null
}

export function useVideoteca(): VoceStreaming[] {
  const { user } = useAuth()
  const [righe, setRighe] = useState<VoceStreaming[]>([])
  useEffect(() => {
    // Una videoteca c'è con la cartella del PC o col server di casa.
    if (!user || !(cartellaCollegata() || jellyfinCollegato())) return
    let vivo = true
    // Solo i file ancora nella cartella (secondo l'ultimo elenco della videoteca) o
    // scaricati qui: un pulsante verso un file cancellato porta a un errore.
    void Promise.all([leggi(user.id), elencaFilmOffline()]).then(([r, offline]) => {
      const scaricati = new Set(offline.filter((f) => f.stato === 'completo').map((f) => f.id))
      if (vivo) setRighe(soloPresenti(r, leggiPresenti(), scaricati))
    })
    return () => {
      vivo = false
    }
  }, [user])
  return righe
}
