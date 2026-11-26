import { describe, expect, it, vi } from 'vitest'

// Il lettore chiede gli episodi della serie per «episodio precedente» e
// «prossimo». Supabase dà al più mille righe per richiesta, senza dire che ha
// tagliato: South Park, con le righe del Drive di una volta, della cartella
// del PC e di Jellyfin, le superava, e le righe arrivate per ultime (quelle
// di Jellyfin) restavano fuori. Da S23E4 il «precedente» diventava S11E5.

const righe = vi.hoisted(() => [] as Record<string, unknown>[])

// Un client finto che si comporta come PostgREST: filtri «eq», ordine se
// chiesto, e mai più di mille righe per risposta.
vi.mock('./supabase', () => {
  function query() {
    const filtri: [string, unknown][] = []
    let ordine: string | null = null
    let intervallo: [number, number] | null = null
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (filtri.push([c, v]), q),
      order: (c: string) => ((ordine = c), q),
      range: (da: number, a: number) => ((intervallo = [da, a]), q),
      then: (ok: (r: { data: unknown[]; error: null }) => unknown) => {
        let r = righe.filter((x) => filtri.every(([c, v]) => x[c] === v))
        if (ordine) r = [...r].sort((a, b) => String(a[ordine!]).localeCompare(String(b[ordine!])))
        if (intervallo) r = r.slice(intervallo[0], intervallo[1] + 1)
        return Promise.resolve({ data: r.slice(0, 1000), error: null }).then(ok)
      },
    }
    return q
  }
  return { supabase: { from: () => query() } }
})

const { episodiDellaSerie, episodioPrecedente } = await import('./streaming')
type Voce = Parameters<typeof episodioPrecedente>[0]

describe('episodiDellaSerie', () => {
  it('legge tutte le righe della serie, anche oltre le mille', async () => {
    righe.length = 0
    // Le copie vecchie (Drive, cartella del PC) prima, quelle di Jellyfin dopo:
    // nell'ordine in cui sono state scritte.
    for (const prefisso of ['drive', 'loc', 'jf']) {
      for (let s = 1; s <= 23; s++) {
        for (let e = 1; e <= 15; e++) {
          righe.push({ user_id: 'u', drive_file_id: `${prefisso}-${s}-${e}`, media_type: 'tv', tmdb_id: 2190, stagione: s, episodio: e })
        }
      }
    }
    righe.push({ user_id: 'u', drive_file_id: 'jf-altra', media_type: 'tv', tmdb_id: 1, stagione: 1, episodio: 1 })

    const tutte = (await episodiDellaSerie('u', 2190)) as Voce[]
    expect(tutte).toHaveLength(3 * 23 * 15)

    // Dal file di Jellyfin di S23E4, il precedente fra i file di Jellyfin.
    const jellyfin = tutte.filter((v) => v.drive_file_id.startsWith('jf-'))
    const qui = jellyfin.find((v) => v.stagione === 23 && v.episodio === 4)!
    expect(episodioPrecedente(qui, jellyfin)).toMatchObject({ stagione: 23, episodio: 3 })
  })
})
