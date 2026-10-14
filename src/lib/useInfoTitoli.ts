import { useEffect, useState } from 'react'
import { logFailure } from './logFailure'
import { getGenres, getReleaseYears, getSearchTitles, getTitleGenres, getTitleSagas } from './tmdb'
import type { Collection } from './types'
import type { VoceStreaming } from './streaming'

export interface InfoTitoli {
  anni: Map<string, string | null>
  generi: Map<string, number[]>
  titoli: Map<string, string[]>
  saghe: Map<string, Collection | null>
}

// Anno, generi, titoli originali e saga dei titoli riconosciuti della
// videoteca (chiave composta `${tipo}-${id}`), per ordinare, filtrare e
// cercare; e i nomi italiani dei generi. Una richiesta per titolo la prima
// volta, poi dalla cache del dispositivo. Si ricarica solo quando cambiano i
// titoli riconosciuti, non a ogni salvataggio.
export function useInfoTitoli(archivio: Map<string, VoceStreaming>) {
  const [info, setInfo] = useState<InfoTitoli>({ anni: new Map(), generi: new Map(), titoli: new Map(), saghe: new Map() })
  const [nomiGeneri, setNomiGeneri] = useState<Map<number, string>>(new Map())
  const chiaviTitoli = [...new Set([...archivio.values()].filter((v) => v.tmdb_id && v.media_type).map((v) => `${v.media_type}-${v.tmdb_id}`))]
    .sort()
    .join(',')
  useEffect(() => {
    if (!chiaviTitoli) return
    const refs = chiaviTitoli.split(',').map((k) => {
      const [tipo, id] = k.split('-')
      return { tmdbId: Number(id), mediaType: tipo === 'tv' ? ('tv' as const) : ('movie' as const) }
    })
    let vivo = true
    Promise.all([
      getReleaseYears(refs),
      getTitleGenres(refs),
      getSearchTitles(refs),
      // Le saghe ce le hanno solo i film.
      getTitleSagas(refs.filter((r) => r.mediaType === 'movie')),
    ])
      .then(([anni, { generi, falliti: f1 }, { titoli, falliti: f2 }, { saghe, falliti: f3 }]) => {
        if (vivo) setInfo({ anni, generi, titoli, saghe })
        const falliti = Math.max(f1, f2, f3)
        if (falliti > 0) logFailure('Dettagli dei titoli della videoteca')(new Error(`${falliti} titoli su ${refs.length} senza generi o titoli originali`))
      })
      .catch(logFailure('Dettagli dei titoli della videoteca'))
    return () => {
      vivo = false
    }
  }, [chiaviTitoli])
  useEffect(() => {
    if (!navigator.onLine) return
    Promise.all([getGenres('movie'), getGenres('tv')])
      .then(([film, serie]) => setNomiGeneri(new Map([...serie, ...film].map((g) => [g.id, g.name]))))
      .catch(logFailure('Nomi dei generi per la videoteca'))
  }, [])
  return { info, nomiGeneri }
}
