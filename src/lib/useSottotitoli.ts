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
  analizzaNomeFilm,
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

// I sottotitoli del lettore di Ciak, una traccia per lingua (italiano e
// inglese, più quelle della cartella di cui non si capisce la lingua):
//   1. per ogni lingua, prima un .srt/.vtt accanto al video su Drive;
//   2. le lingue che mancano si cercano su OpenSubtitles — una ricerca sola per
//      tutte — e quello trovato si salva nella cartella, così la volta dopo è
//      già lì e non costa download.
// «Prova un altro» vale per una lingua: passa al suo candidato successivo, per
// quando la sincronia è sbagliata; se quello scartato l'aveva salvato Ciak,
// finisce nel cestino.

// Le lingue che il lettore offre sempre, se si trovano.
export const LINGUE_VOLUTE = ['it', 'en'] as const
// La corsia dei sottotitoli della cartella di cui non si capisce la lingua.
const ALTRO = 'altro'

export interface Traccia {
  chiave: string // 'it' | 'en' | 'altro'
  url: string // blob: con il WebVTT, per il <track>
  lingua: string | null
  etichetta: string // es. «Italiano · da OpenSubtitles»
  vtt: string // il testo, per salvarlo con il film scaricato
}

export type StatoSottotitoli = 'cerco' | 'pronti' | 'nessuno' | 'errore'

interface CandidatoOnline {
  fileId: number
  lingua: string
  nome: string
}

type Fonte = { tipo: 'drive'; sub: SottotitoloDrive } | { tipo: 'online'; sub: CandidatoOnline }

interface Corsia {
  fonti: Fonte[]
  indice: number
  salvatoDaCiak: string | null
}

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

function corsiaDi(lingua: string | null): string {
  return lingua === 'it' || lingua === 'en' ? lingua : ALTRO
}

const ORDINE_CORSIE = ['it', 'en', ALTRO]

export function useSottotitoli(fileId: string, attivo: boolean) {
  const [info, setInfo] = useState<InfoFile | null>(null)
  const [cartella, setCartella] = useState<string | null>(null)
  const [tracce, setTracce] = useState<Traccia[]>([])
  const [cercando, setCercando] = useState(true)
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  // Per ogni corsia: se c'è un altro candidato da provare.
  const [altri, setAltri] = useState<Record<string, boolean>>({})

  // Lo stato della ricerca che non serve a disegnare la pagina.
  const lavoro = useRef<{
    info: InfoFile | null
    cartella: string | null
    corsie: Map<string, Corsia>
    onlineCercati: boolean
    annullato: boolean
  }>({ info: null, cartella: null, corsie: new Map(), onlineCercati: false, annullato: false })

  const urlTracce = useRef(new Map<string, string>())

  const aggiornaAltri = useCallback(() => {
    const l = lavoro.current
    const esito: Record<string, boolean> = {}
    for (const [chiave, c] of l.corsie) esito[chiave] = c.indice + 1 < c.fonti.length || !l.onlineCercati
    setAltri(esito)
  }, [])

  const mostra = useCallback((chiave: string, testo: string, lingua: string | null, origine: string) => {
    const vtt = srtAVtt(testo)
    const url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))
    const prima = urlTracce.current.get(chiave)
    if (prima) URL.revokeObjectURL(prima)
    urlTracce.current.set(chiave, url)
    const nuova: Traccia = { chiave, url, lingua, etichetta: `${nomeLingua(lingua)} · ${origine}`, vtt }
    setTracce((attuali) =>
      [...attuali.filter((t) => t.chiave !== chiave), nuova].sort(
        (a, b) => ORDINE_CORSIE.indexOf(a.chiave) - ORDINE_CORSIE.indexOf(b.chiave),
      ),
    )
  }, [])

  const corsia = (chiave: string): Corsia => {
    const l = lavoro.current
    let c = l.corsie.get(chiave)
    if (!c) {
      c = { fonti: [], indice: -1, salvatoDaCiak: null }
      l.corsie.set(chiave, c)
    }
    return c
  }

  // Una ricerca sola, per tutte le lingue: i candidati finiscono ciascuno nella
  // corsia della sua lingua, in coda a quelli trovati su Drive.
  const cercaOnline = useCallback(async () => {
    const l = lavoro.current
    l.onlineCercati = true
    if (!l.info) return
    const film = filmDaCercare(l.info.name, l.cartella)
    const hash = await hashDelVideo(l.info)
    const { candidati } = await apiSottotitoli<{ candidati: CandidatoOnline[] }>({ azione: 'cerca', ...film, query: film.titolo, hash })
    for (const sub of candidati) corsia(corsiaDi(sub.lingua)).fonti.push({ tipo: 'online', sub })
  }, [])

  // Carica la fonte numero `indice` di una corsia, cercando online se quelle
  // su Drive sono finite. Torna false se non c'era niente da caricare.
  const caricaFonte = useCallback(
    async (chiave: string, indice: number): Promise<boolean> => {
      const l = lavoro.current
      const c = corsia(chiave)
      if (indice >= c.fonti.length && !l.onlineCercati && chiave !== ALTRO) await cercaOnline()
      if (l.annullato) return false
      const fonte = c.fonti[indice]
      if (!fonte) return false
      c.indice = indice
      if (fonte.tipo === 'drive') {
        const testo = decodificaTesto(await scaricaByte(fonte.sub.id))
        if (l.annullato) return false
        mostra(chiave, testo, fonte.sub.lingua, 'dalla cartella su Drive')
      } else {
        const { testo } = await apiSottotitoli<{ testo: string }>({ azione: 'scarica', fileId: fonte.sub.fileId })
        if (l.annullato) return false
        let origine = 'da OpenSubtitles'
        const idCartella = l.info?.parents[0]
        if (l.info && idCartella) {
          try {
            c.salvatoDaCiak = await creaFileTesto(idCartella, nomeSottotitoloSalvato(l.info.name, fonte.sub.lingua), testo)
            origine = 'da OpenSubtitles, salvato nella cartella'
          } catch (e) {
            logFailure('Salvataggio del sottotitolo su Drive')(e)
          }
        }
        mostra(chiave, testo, fonte.sub.lingua, origine)
      }
      return true
    },
    [cercaOnline, mostra],
  )

  const gestisciErrore = useCallback((e: unknown) => {
    if (lavoro.current.annullato) return
    if (e instanceof ErroreApi && e.nonConfigurato) {
      setMessaggio('La ricerca online dei sottotitoli non è ancora configurata: uso solo quelli nella cartella.')
    } else {
      setErrore(e instanceof Error ? e.message : 'Sottotitoli non disponibili.')
    }
  }, [])

  useEffect(() => {
    if (!attivo) return
    const l = lavoro.current
    l.annullato = false
    l.corsie = new Map()
    l.onlineCercati = false
    setTracce([])
    setCercando(true)
    setMessaggio(null)
    setErrore(null)
    ;(async () => {
      const video = await infoFile(fileId)
      const idCartella = video.parents[0]
      const [nomeCartella, vicini] = idCartella
        ? await Promise.all([infoFile(idCartella).then((c) => c.name), fileNellaCartella(idCartella)])
        : [null, []]
      if (l.annullato) return
      l.info = video
      // La cartella «Ciak» non dice niente del film: conta solo una sottocartella.
      // Né «Ciak» né una categoria (FILM, ANIME…) dicono qualcosa del film: conta
      // solo una cartella dedicata, che di solito porta l'anno.
      l.cartella =
        nomeCartella && nomeCartella !== CARTELLA_CIAK && analizzaNomeFilm(nomeCartella).anno !== undefined
          ? nomeCartella
          : null
      setInfo(video)
      setCartella(l.cartella)
      for (const sub of sottotitoliPerVideo(video.name, vicini)) {
        corsia(corsiaDi(sub.lingua)).fonti.push({ tipo: 'drive', sub })
      }
      // Le lingue volute ci sono sempre come corsie, anche vuote: così una
      // lingua che manca su Drive fa partire la ricerca online.
      for (const lingua of LINGUE_VOLUTE) corsia(lingua)
      const mancanti: string[] = []
      for (const chiave of ORDINE_CORSIE) {
        if (!l.corsie.has(chiave)) continue
        try {
          const trovata = await caricaFonte(chiave, 0)
          if (!trovata && chiave !== ALTRO) mancanti.push(nomeLingua(chiave).toLowerCase())
        } catch (e) {
          gestisciErrore(e)
          // Una ricerca online non configurata non va ripetuta per ogni lingua.
          if (e instanceof ErroreApi && e.nonConfigurato) l.onlineCercati = true
        }
        if (l.annullato) return
      }
      if (mancanti.length > 0 && l.onlineCercati) {
        setMessaggio((m) => m ?? `Nessun sottotitolo in ${mancanti.join(' né in ')}, né nella cartella né su OpenSubtitles.`)
      }
      aggiornaAltri()
      setCercando(false)
    })().catch((e) => {
      gestisciErrore(e)
      setCercando(false)
    })
    return () => {
      l.annullato = true
    }
  }, [fileId, attivo, caricaFonte, gestisciErrore, aggiornaAltri])

  // Libera i blob delle tracce quando si lascia la pagina.
  useEffect(
    () => () => {
      for (const url of urlTracce.current.values()) URL.revokeObjectURL(url)
    },
    [],
  )

  const provaAltro = useCallback(
    (chiave: string) => {
      const l = lavoro.current
      const c = l.corsie.get(chiave)
      if (!c) return
      const scartato = c.salvatoDaCiak
      c.salvatoDaCiak = null
      if (scartato) cestinaFile(scartato).catch(logFailure('Cestino del sottotitolo scartato'))
      setCercando(true)
      caricaFonte(chiave, c.indice + 1)
        .then((trovata) => {
          if (!trovata) setMessaggio(`Non ci sono altri sottotitoli in ${nomeLingua(chiave).toLowerCase()} da provare.`)
        })
        .catch(gestisciErrore)
        .finally(() => {
          aggiornaAltri()
          setCercando(false)
        })
    },
    [caricaFonte, gestisciErrore, aggiornaAltri],
  )

  const stato: StatoSottotitoli = cercando
    ? 'cerco'
    : tracce.length > 0
      ? 'pronti'
      : errore
        ? 'errore'
        : 'nessuno'

  return { info, cartella, tracce, stato, messaggio: errore ?? messaggio, altri, provaAltro }
}
