import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { driveConfigurato } from '../lib/googleDrive'
import { rinnovaDrive } from '../lib/driveAutomatico'

// Rinnova il permesso di Drive da solo: cambiando pagina, tornando all'app
// (che sul telefono resta aperta in sottofondo per ore) e, ogni minuto, se
// sta per scadere. Prima dal server di Ciak, senza che si veda niente; se
// non c'è, col redirect verso Google, mai a film in corso.
const OGNI_MS = 60_000

export default function DriveSempreCollegato() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  useEffect(() => {
    if (!user || !driveConfigurato()) return
    void rinnovaDrive()
  }, [user, pathname])
  useEffect(() => {
    if (!user || !driveConfigurato()) return
    const tornato = () => {
      if (document.visibilityState === 'visible') void rinnovaDrive()
    }
    document.addEventListener('visibilitychange', tornato)
    const giro = setInterval(tornato, OGNI_MS)
    return () => {
      document.removeEventListener('visibilitychange', tornato)
      clearInterval(giro)
    }
  }, [user])
  return null
}
