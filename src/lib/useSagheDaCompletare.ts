import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import { listAll } from './userTitles'
import { alertIds } from './alerts'
import { getCollection, sagaDelFilm } from './tmdb'
import { logFailure } from './logFailure'
import { mapLimit } from './mapLimit'
import { daChiedere, ordinaSaghe, riepilogoSaga, type CacheSaghe, type RiepilogoSaga } from './sagheDaCompletare'

// Le saghe dei film che hai visto, con quanto ti manca e cosa deve uscire. La
// saga di ogni film si chiede a TMDB una volta e si ricorda per un mese
// (vedi daChiedere): con centinaia di film visti, la prima visita è lenta e
// lo dice («Controllo 120 film su 600»), le altre partono subito.

const CHIAVE = 'ciak-saga-dei-film'

function leggiCache(): CacheSaghe {
  try {
    return JSON.parse(localStorage.getItem(CHIAVE) ?? '{}') as CacheSaghe
  } catch (e) {
    logFailure('Saghe dei film salvate illeggibili')(e)
    return {}
  }
}

function salvaCache(c: CacheSaghe) {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(c))
  } catch (e) {
    logFailure('Saghe dei film non salvate')(e)
  }
}

export function useSagheDaCompletare() {
  const { user } = useAuth()
  const [saghe, setSaghe] = useState<RiepilogoSaga[] | null>(null)
  const [avvisi, setAvvisi] = useState<Set<string>>(new Set())
  const [progresso, setProgresso] = useState<{ fatti: number; totale: number } | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let vivo = true
    setSaghe(null)
    setErrore(null)
    alertIds(user.id)
      .then((a) => vivo && setAvvisi(a))
      .catch(logFailure('Avvisi per le saghe'))

    async function carica() {
      const titoli = await listAll(user!.id)
      const visti = new Set(titoli.filter((t) => t.media_type === 'movie' && t.status === 'watched').map((t) => t.tmdb_id))
      const cache = leggiCache()
      const adesso = Date.now()
      const nuovi = daChiedere([...visti], cache, adesso)
      let fatti = 0
      let falliti = 0
      let ultimo: unknown = null
      if (nuovi.length > 0) setProgresso({ fatti: 0, totale: nuovi.length })
      await mapLimit(nuovi, 6, async (id) => {
        if (!vivo) return
        try {
          cache[id] = { saga: await sagaDelFilm(id), quando: adesso }
        } catch (e) {
          // Non si salva: la prossima visita lo richiede.
          falliti++
          ultimo = e
        }
        fatti++
        if (vivo && fatti % 10 === 0) setProgresso({ fatti, totale: nuovi.length })
      })
      if (falliti > 0) logFailure(`Saghe dei film visti: ${falliti} su ${nuovi.length} non lette`)(ultimo)
      salvaCache(cache)

      const idSaghe = [...new Set([...visti].map((id) => cache[id]?.saga).filter((s): s is number => typeof s === 'number'))]
      const oggi = new Date().toISOString().slice(0, 10)
      let saghePerse = 0
      const riepiloghi = await mapLimit(idSaghe, 4, async (id) => {
        try {
          return riepilogoSaga(await getCollection(id), visti, oggi)
        } catch (e) {
          saghePerse++
          ultimo = e
          return null
        }
      })
      if (saghePerse > 0) logFailure(`Saghe da completare: ${saghePerse} su ${idSaghe.length} non lette`)(ultimo)
      return ordinaSaghe(riepiloghi.filter((r): r is RiepilogoSaga => r !== null))
    }

    carica()
      .then((s) => vivo && setSaghe(s))
      .catch((e: Error) => vivo && setErrore(e.message))
      .finally(() => vivo && setProgresso(null))
    return () => {
      vivo = false
    }
  }, [user])

  return { saghe, avvisi, progresso, errore }
}
