import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { cartellaCollegata, ErroreCartella, fileDallaCartella } from './cartellaLocale'
import { copiaFilmInCiak } from './copiaInCiak'
import { eliminaFilm, offlineDisponibile, SpazioFinito, type FilmOffline } from './filmOffline'
import { eLocale } from './filmLocali'
import { logFailure } from './logFailure'
import {
  cambiaLiberaDopoVisione,
  EVENTO_SERIE_IN_CIAK,
  lasciaSerieInCiak,
  leggiSerieInCiak,
  pianoSerieInCiak,
  tieniSerieInCiak,
  type EpisodioDaCopiare,
} from './serieInCiak'
import type { VideoFile } from './fileVideo'
import type { VoceStreaming } from './streaming'
import { raggruppaSerie, type GruppoSerie } from './videoteca'

// Le serie tenute in Ciak (vedi serieInCiak): a ogni lettura della cartella
// si copiano gli episodi nuovi, e appena si sa che uno è stato visto se ne
// toglie la copia. Il lavoro va avanti in sottofondo, un episodio alla volta.

// Cosa si sta copiando, e cosa si è dovuto lasciare a metà, per serie. Sta
// fuori dal componente: uscendo dalla videoteca la copia continua, e
// rientrando non deve partirne una seconda sugli stessi episodi.
interface Lavoro {
  copia: { cartella: string; titolo: string; n: number; totale: number } | null
  avvisi: Map<string, string>
}
let lavoro: Lavoro = { copia: null, avvisi: new Map() }
let occupato = false
const ascoltatori = new Set<() => void>()
function aggiorna(nuovo: Lavoro) {
  lavoro = nuovo
  for (const a of ascoltatori) a()
}
function ascolta(cb: () => void) {
  ascoltatori.add(cb)
  return () => ascoltatori.delete(cb)
}

async function lavora(daLiberare: string[], daCopiare: EpisodioDaCopiare[]) {
  occupato = true
  const avvisi = new Map(lavoro.avvisi)
  for (const c of daCopiare) avvisi.delete(c.cartella)
  try {
    for (const id of daLiberare) await eliminaFilm(id).catch(logFailure('Copia in Ciak di un episodio già visto'))
    let falliti = 0
    let ultimo: unknown = null
    for (const [i, ep] of daCopiare.entries()) {
      // Smessa di tenere mentre la si copiava: il resto non serve più.
      if (!leggiSerieInCiak()[ep.cartella]) continue
      const suoi = daCopiare.filter((c) => c.cartella === ep.cartella)
      aggiorna({ copia: { cartella: ep.cartella, titolo: ep.titolo, n: suoi.indexOf(ep) + 1, totale: suoi.length }, avvisi })
      try {
        const film = await fileDallaCartella(ep.id)
        if (film) await copiaFilmInCiak(film, ep.titolo, ep.serie)
      } catch (e) {
        // Il permesso da ridare e lo spazio finito valgono per tutti quelli
        // che restano: ci si ferma e lo si dice, invece di provarli uno a uno.
        const resto = daCopiare.slice(i)
        if (e instanceof ErroreCartella && e.permesso) {
          for (const c of resto) avvisi.set(c.cartella, 'Per copiare gli episodi nuovi riapri la cartella, in cima alla pagina.')
          break
        }
        if (e instanceof SpazioFinito) {
          for (const c of resto) {
            const mancano = resto.filter((r) => r.cartella === c.cartella).length
            avvisi.set(c.cartella, `Spazio finito sul dispositivo: ${mancano === 1 ? 'manca 1 episodio' : `mancano ${mancano} episodi`}. Libera spazio e premi «Aggiorna».`)
          }
          break
        }
        falliti++
        ultimo = e
      }
    }
    // Una volta col totale, non a ogni episodio.
    if (falliti > 0) logFailure(`Copia in Ciak degli episodi: ${falliti} su ${daCopiare.length} non riusciti`)(ultimo)
  } finally {
    occupato = false
    aggiorna({ copia: null, avvisi })
  }
}

// Ciò che la riga di una serie mostra e fa (vedi SerieInCiak).
export interface RigaInCiak {
  tenuta: boolean
  liberaDopoVisione: boolean
  salvati: number
  episodi: number
  dimensione: number
  copia: { titolo: string; n: number; totale: number } | null
  avviso: string | null
  onSalva: () => void
  onLibera: (libera: boolean) => void
  onSmetti: () => void
}

export function useSerieInCiak(p: {
  video: VideoFile[]
  archivio: Map<string, VoceStreaming>
  offline: FilmOffline[]
  scaricati: Set<string>
  // Quante letture fresche della cartella (useElencoVideoteca): ognuna è il
  // via a copiare gli episodi nuovi.
  letture: number
}) {
  const { video, archivio, offline, scaricati, letture } = p
  const [tenute, setTenute] = useState(leggiSerieInCiak)
  useEffect(() => {
    const cambiate = () => setTenute(leggiSerieInCiak())
    window.addEventListener(EVENTO_SERIE_IN_CIAK, cambiate)
    return () => window.removeEventListener(EVENTO_SERIE_IN_CIAK, cambiate)
  }, [])
  const stato = useSyncExternalStore(ascolta, () => lavoro)
  // Le serie di tutta la videoteca, non solo della scheda mostrata.
  const gruppi = useMemo(
    () => raggruppaSerie(video.map((v) => ({ id: v.id, name: v.name, cartella: v.cartella, serie: v.serie ?? null, voce: archivio.get(v.id) }))).serie,
    [video, archivio],
  )

  // Il via a copiare: una lettura fresca della cartella o «Salva la serie».
  // Uno già servito non si ripete da solo: un episodio che non si copia non
  // deve riprovare a ogni giro, aspetta il prossimo «Aggiorna».
  const [chiesti, setChiesti] = useState(0)
  const via = letture + chiesti
  const [servito, setServito] = useState(0)
  useEffect(() => {
    if (occupato || stato.copia) return
    const piano = pianoSerieInCiak(gruppi, tenute, scaricati)
    const daCopiare = via > servito && cartellaCollegata() !== null ? piano.daCopiare : []
    if (piano.daLiberare.length === 0 && daCopiare.length === 0) return
    if (daCopiare.length > 0) setServito(via)
    void lavora(piano.daLiberare, daCopiare)
  }, [gruppi, tenute, scaricati, via, servito, stato])

  function rigaDi(g: GruppoSerie): RigaInCiak | null {
    const locali = new Set(g.ids.filter(eLocale))
    // Solo i video del disco hanno un file da copiare.
    if (!offlineDisponibile() || locali.size === 0) return null
    const tenuta = tenute[g.cartella]
    const salvati = offline.filter((f) => f.stato === 'completo' && locali.has(f.id))
    return {
      tenuta: !!tenuta,
      liberaDopoVisione: tenuta?.liberaDopoVisione ?? true,
      salvati: salvati.length,
      episodi: locali.size,
      dimensione: salvati.reduce((t, f) => t + (f.dimensione ?? 0), 0),
      copia: stato.copia?.cartella === g.cartella ? stato.copia : null,
      avviso: stato.avvisi.get(g.cartella) ?? null,
      onSalva: () => {
        tieniSerieInCiak(g.cartella, g.titolo)
        setChiesti((n) => n + 1)
      },
      onLibera: (libera) => cambiaLiberaDopoVisione(g.cartella, libera),
      // Le copie vanno via, i file della cartella restano dove sono.
      onSmetti: () => {
        lasciaSerieInCiak(g.cartella)
        for (const f of salvati) void eliminaFilm(f.id).catch(logFailure('Copie in Ciak di una serie lasciata'))
      },
    }
  }

  return { rigaDi }
}
