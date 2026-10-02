import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { driveConfigurato } from '../lib/googleDrive'
import { annotaAccountDrive, rinnovaDriveDaSolo } from '../lib/driveAutomatico'

// Rinnova il permesso di Drive da solo: cambiando pagina e tornando all'app
// (che sul telefono resta aperta in sottofondo per ore). Mai a film in corso.
export default function DriveSempreCollegato() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  useEffect(() => {
    if (!user || !driveConfigurato()) return
    if (!rinnovaDriveDaSolo()) void annotaAccountDrive()
  }, [user, pathname])
  useEffect(() => {
    if (!user || !driveConfigurato()) return
    const tornato = () => {
      if (document.visibilityState === 'visible') rinnovaDriveDaSolo()
    }
    document.addEventListener('visibilitychange', tornato)
    return () => document.removeEventListener('visibilitychange', tornato)
  }, [user])
  return null
}
