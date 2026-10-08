import { useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toastCtx'
import { logFailure } from '../lib/logFailure'
import { segnoTitoliItaliani, uniformaTitoli } from '../lib/titoliItaliani'

// Una volta per persona e dispositivo, in sottofondo: i titoli salvati in
// un'altra lingua (diario, collezione, liste) diventano italiani, come quelli
// che Ciak mostra da qui in poi.
// Già partito in questa sessione: la pagina si ridisegna mentre aspetta TMDB,
// e il lavoro non deve ricominciare a ogni giro.
const avviati = new Set<string>()

function giaFatto(userId: string): boolean {
  try {
    return localStorage.getItem(segnoTitoliItaliani(userId)) === '1'
  } catch {
    // Senza memoria del dispositivo si rifarebbe a ogni apertura: meglio di no.
    return true
  }
}

export default function TitoliItaliani() {
  const { user } = useAuth()
  const { showToast } = useToast()
  useEffect(() => {
    if (!user || giaFatto(user.id) || avviati.has(user.id)) return
    avviati.add(user.id)
    uniformaTitoli(user.id)
      .then((cambiate) => {
        try {
          localStorage.setItem(segnoTitoliItaliani(user.id), '1')
        } catch (e) {
          logFailure('Titoli in italiano: segno non salvato')(e)
        }
        if (cambiate > 0) {
          showToast(cambiate === 1 ? 'Ho messo in italiano 1 titolo salvato.' : `Ho messo in italiano ${cambiate} titoli salvati.`, 'success')
        }
      })
      .catch(logFailure('Titoli in italiano'))
  }, [user, showToast])
  return null
}
