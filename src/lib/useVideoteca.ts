import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import { logFailure } from './logFailure'
import { driveConfigurato } from './googleDrive'
import { elencaStreaming, type VoceStreaming } from './streaming'

// I film della videoteca (i file di Drive già collegati ai titoli), letti una
// volta e condivisi: una lista «Da vedere» con cento card non deve fare cento
// richieste. La copia vale un minuto — abbastanza per navigare fra le pagine,
// poco per non mostrare un file appena aggiunto.
const VALIDITA_MS = 60_000
let copia: { userId: string; quando: number; righe: Promise<VoceStreaming[]> } | null = null

function leggi(userId: string): Promise<VoceStreaming[]> {
  if (copia && copia.userId === userId && Date.now() - copia.quando < VALIDITA_MS) return copia.righe
  const righe = elencaStreaming(userId).catch((e) => {
    logFailure('Videoteca per «Guarda ora»')(e)
    copia = null
    return [] as VoceStreaming[]
  })
  copia = { userId, quando: Date.now(), righe }
  return righe
}

export function useVideoteca(): VoceStreaming[] {
  const { user } = useAuth()
  const [righe, setRighe] = useState<VoceStreaming[]>([])
  useEffect(() => {
    if (!user || !driveConfigurato()) return
    let vivo = true
    void leggi(user.id).then((r) => vivo && setRighe(r))
    return () => {
      vivo = false
    }
  }, [user])
  return righe
}
