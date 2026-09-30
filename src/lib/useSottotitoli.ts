import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { logFailure } from './logFailure'
import {
  CARTELLA_CIAK,
  cestinaFile,
  creaFileTesto,
  fileNellaCartella,
  infoFile,
  scaricaByte,
  type InfoFile,
} from './googleDrive'
import {
  BLOCCO_HASH,
  decodificaTesto,
  filmDaCercare,
  hashOpenSubtitles,
  nomeLingua,
  nomeSottotitoloSalvato,
  sottotitoliPerVideo,
  srtAVtt,
  type SottotitoloDrive,
} from './sottotitoli'

// I sottotitoli del lettore di Ciak, in quest'ordine:
//   1. un .srt/.vtt accanto al video nella cartella su Drive;
//   2. se manca, OpenSubtitles (italiano, poi inglese) — e quello trovato si
//      salva nella cartella, così la volta dopo è già lì e non costa download.
// «Prova un altro» passa al candidato successivo, per quando la sincronia è
// sbagliata; se quello scartato l'aveva salvato Ciak, finisce nel cestino.

export interface Traccia {
  url: string // blob: con il WebVTT, per il <track>
  lingua: string | null
  etichetta: string // es. «Italiano · da OpenSubtitles»
}

export type StatoSottotitoli = 'cerco' | 'pronti' | 'nessuno' | 'errore'

interface CandidatoOnline {
  fileId: number
  lingua: string
  nome: string
}

type Fonte = { tipo: 'drive'; sub: SottotitoloDrive } | { tipo: 'online'; sub: CandidatoOnline }

class ErroreApi extends Error {
  nonConfigurato = false
}

async function apiSottotitoli<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase non è configurato.')
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Accedi per cercare i sottotitoli.')
  const res = await fetch('/api/sottotitoli', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; nonConfigurato?: boolean }
  if (!res.ok) {
    const e = new ErroreApi(data.error ?? `Ricerca dei sottotitoli non disponibile (HTTP ${res.status}).`)
    e.nonConfigurato = !!data.nonConfigurato
    throw e
  }
  return data as T
}

// L'hash di OpenSubtitles: due pezzi da 64 KB, il primo e l'ultimo. Best
// effort — senza si cerca solo per titolo.
async function hashDelVideo(info: InfoFile): Promise<string | undefined> {
  if (!info.size || info.size < 2 * BLOCCO_HASH) return undefined
  try {
    const [inizio, fine] = await Promise.all([
      scaricaByte(info.id, [0, BLOCCO_HASH - 1]),
      scaricaByte(info.id, [info.size - BLOCCO_HASH, info.size - 1]),
    ])
    return hashOpenSubtitles(info.size, inizio, fine)
  } catch (e) {
    logFailure('Hash del video per OpenSubtitles')(e)
    return undefined
  }
}

export function useSottotitoli(fileId: string, attivo: boolean) {
  const [info, setInfo] = useState<InfoFile | null>(null)
  const [cartella, setCartella] = useState<string | null>(null)
  const [traccia, setTraccia] = useState<Traccia | null>(null)
  const [stato, setStato] = useState<StatoSottotitoli>('cerco')
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const [altriPossibili, setAltriPossibili] = useState(false)

  // Lo stato della ricerca che non serve a disegnare la pagina.
  const lavoro = useRef<{
    info: InfoFile | null
    cartella: string | null
    fonti: Fonte[]
    indice: number
    onlineCercati: boolean
    salvatoDaCiak: string | null
    annullato: boolean
  }>({ info: null, cartella: null, fonti: [], indice: -1, onlineCercati: false, salvatoDaCiak: null, annullato: false })

  const urlTraccia = useRef<string | null>(null)

  const mostra = useCallback((testo: string, lingua: string | null, origine: string) => {
    const url = URL.createObjectURL(new Blob([srtAVtt(testo)], { type: 'text/vtt' }))
    if (urlTraccia.current) URL.revokeObjectURL(urlTraccia.current)
    urlTraccia.current = url
    setTraccia({ url, lingua, etichetta: `${nomeLingua(lingua)} · ${origine}` })
    setStato('pronti')
    setMessaggio(null)
  }, [])

  const cercaOnline = useCallback(async () => {
    const l = lavoro.current
    l.onlineCercati = true
    if (!l.info) return
    const film = filmDaCercare(l.info.name, l.cartella)
    const hash = await hashDelVideo(l.info)
    const { candidati } = await apiSottotitoli<{ candidati: CandidatoOnline[] }>({ azione: 'cerca', ...film, query: film.titolo, hash })
    l.fonti.push(...candidati.map((sub) => ({ tipo: 'online' as const, sub })))
  }, [])

  // Carica la fonte numero `indice`, cercando online se le fonti su Drive sono finite.
  const caricaFonte = useCallback(
    async (indice: number) => {
      const l = lavoro.current
      if (indice >= l.fonti.length && !l.onlineCercati) await cercaOnline()
      if (l.annullato) return
      const fonte = l.fonti[indice]
      l.indice = indice
      if (!fonte) {
        setStato('nessuno')
        setAltriPossibili(false)
        return
      }
      if (fonte.tipo === 'drive') {
        const testo = decodificaTesto(await scaricaByte(fonte.sub.id))
        if (l.annullato) return
        mostra(testo, fonte.sub.lingua, 'dalla cartella su Drive')
      } else {
        const { testo } = await apiSottotitoli<{ testo: string }>({ azione: 'scarica', fileId: fonte.sub.fileId })
        if (l.annullato) return
        let origine = 'da OpenSubtitles'
        const idCartella = l.info?.parents[0]
        if (l.info && idCartella) {
          try {
            l.salvatoDaCiak = await creaFileTesto(idCartella, nomeSottotitoloSalvato(l.info.name, fonte.sub.lingua), testo)
            origine = 'da OpenSubtitles, salvato nella cartella'
          } catch (e) {
            logFailure('Salvataggio del sottotitolo su Drive')(e)
          }
        }
        mostra(testo, fonte.sub.lingua, origine)
      }
      setAltriPossibili(indice + 1 < l.fonti.length || !l.onlineCercati)
    },
    [cercaOnline, mostra],
  )

  const gestisciErrore = useCallback((e: unknown) => {
    if (lavoro.current.annullato) return
    if (e instanceof ErroreApi && e.nonConfigurato) {
      setStato('nessuno')
      setMessaggio('Nessun sottotitolo nella cartella, e la ricerca online non è ancora configurata.')
    } else {
      setStato('errore')
      setMessaggio(e instanceof Error ? e.message : 'Sottotitoli non disponibili.')
    }
    setAltriPossibili(false)
  }, [])

  useEffect(() => {
    if (!attivo) return
    const l = lavoro.current
    l.annullato = false
    l.fonti = []
    l.indice = -1
    l.onlineCercati = false
    l.salvatoDaCiak = null
    setStato('cerco')
    setMessaggio(null)
    ;(async () => {
      const video = await infoFile(fileId)
      const idCartella = video.parents[0]
      const [nomeCartella, vicini] = idCartella
        ? await Promise.all([infoFile(idCartella).then((c) => c.name), fileNellaCartella(idCartella)])
        : [null, []]
      if (l.annullato) return
      l.info = video
      // La cartella «Ciak» non dice niente del film: conta solo una sottocartella.
      l.cartella = nomeCartella && nomeCartella !== CARTELLA_CIAK ? nomeCartella : null
      setInfo(video)
      setCartella(l.cartella)
      l.fonti = sottotitoliPerVideo(video.name, vicini).map((sub) => ({ tipo: 'drive' as const, sub }))
      await caricaFonte(0)
    })().catch(gestisciErrore)
    return () => {
      l.annullato = true
    }
  }, [fileId, attivo, caricaFonte, gestisciErrore])

  // Libera il blob dell'ultima traccia quando si lascia la pagina.
  useEffect(
    () => () => {
      if (urlTraccia.current) URL.revokeObjectURL(urlTraccia.current)
    },
    [],
  )

  const provaAltro = useCallback(() => {
    const l = lavoro.current
    const scartato = l.salvatoDaCiak
    l.salvatoDaCiak = null
    if (scartato) cestinaFile(scartato).catch(logFailure('Cestino del sottotitolo scartato'))
    setStato('cerco')
    caricaFonte(l.indice + 1).catch(gestisciErrore)
  }, [caricaFonte, gestisciErrore])

  return { info, cartella, traccia, stato, messaggio, altriPossibili, provaAltro }
}
