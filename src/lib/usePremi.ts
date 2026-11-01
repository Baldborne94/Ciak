import { useEffect, useState } from 'react'
import { getFilmPerId } from './tmdb'
import { logFailure } from './logFailure'
import { mapLimit } from './mapLimit'
import { scaricaVincitori, trovaCategoria, usaCache, type CacheVincitori, type Premio, type Vincitore } from './premi'
import type { MediaItem } from './types'

// I vincitori di un premio, con la loro card di TMDB. La lista arriva da
// Wikidata (salvata per una settimana), le card una a una da TMDB: si mostrano
// man mano che arrivano, invece di far aspettare un centinaio di richieste.

const chiaveCache = (p: Premio) => `ciak-premi-${p}`

function leggiCache(p: Premio): CacheVincitori | null {
  try {
    const raw = localStorage.getItem(chiaveCache(p))
    return raw ? (JSON.parse(raw) as CacheVincitori) : null
  } catch (e) {
    logFailure('Copia salvata dei premi illeggibile')(e)
    return null
  }
}

function salvaCache(p: Premio, vincitori: Vincitore[]) {
  try {
    localStorage.setItem(chiaveCache(p), JSON.stringify({ salvato: Date.now(), vincitori }))
  } catch (e) {
    logFailure('Copia dei premi non salvata')(e)
  }
}

// Le card già chieste in questa visita: passando da un premio all'altro e
// ritorno non si richiedono.
const carte = new Map<number, MediaItem>()

// Una sola richiesta a Wikidata per premio, anche se la pagina la chiede due
// volte di fila (si torna su un premio prima che la prima abbia risposto).
const inCorso = new Map<Premio, Promise<Vincitore[]>>()
function chiediAWikidata(premio: Premio): Promise<Vincitore[]> {
  let p = inCorso.get(premio)
  if (!p) {
    p = scaricaVincitori(trovaCategoria(premio).categoria)
      .then((v) => {
        salvaCache(premio, v)
        return v
      })
      .finally(() => inCorso.delete(premio))
    inCorso.set(premio, p)
  }
  return p
}

export function usePremi(premio: Premio) {
  const [vincitori, setVincitori] = useState<Vincitore[] | null>(null)
  const [film, setFilm] = useState<Map<number, MediaItem>>(new Map(carte))
  const [errore, setErrore] = useState<string | null>(null)
  const [mancanti, setMancanti] = useState(0)

  useEffect(() => {
    let vivo = true
    setVincitori(null)
    setErrore(null)
    setMancanti(0)
    const salvata = leggiCache(premio)
    const lista = usaCache(salvata, Date.now(), navigator.onLine)
      ? Promise.resolve(salvata!.vincitori)
      : chiediAWikidata(premio).catch((e: Error) => {
          // Wikidata non risponde: meglio la lista della settimana scorsa.
          if (salvata) return salvata.vincitori
          throw e
        })

    lista
      .then(async (v) => {
        if (!vivo) return
        setVincitori(v)
        let falliti = 0
        let ultimo: unknown = null
        await mapLimit(
          v.filter((x) => !carte.has(x.tmdbId)),
          6,
          async (x) => {
            if (!vivo) return
            try {
              carte.set(x.tmdbId, await getFilmPerId(x.tmdbId))
              if (vivo) setFilm(new Map(carte))
            } catch (e) {
              falliti++
              ultimo = e
            }
          },
        )
        if (falliti > 0) {
          // Una volta col totale, non a ogni film.
          logFailure(`Schede TMDB dei premi: ${falliti} su ${v.length} non arrivate`)(ultimo)
          if (vivo) setMancanti(falliti)
        }
      })
      .catch((e: Error) => vivo && setErrore(e.message))

    return () => {
      vivo = false
    }
  }, [premio])

  return { vincitori, film, errore, mancanti }
}
