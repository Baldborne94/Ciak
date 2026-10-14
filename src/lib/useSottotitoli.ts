import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import { logFailure } from './logFailure'
import type { InfoFile } from './fileVideo'
import type { FilmAperto } from './filmLocali'
import {
  BLOCCO_HASH,
  decodificaTesto,
  filmDaCercare,
  hashOpenSubtitles,
  nomeLingua,
  nomeSottotitoloSalvato,
  sottotitoliPerVideo,
  srtAVtt,
  type SottotitoloAccanto,
} from './sottotitoli'
import { leggiSottotitoliSalvati, salvaSottotitolo, togliSottotitolo, type SottotitoloSalvato } from './sottotitoliSalvati'

// I sottotitoli del lettore di Ciak, una traccia per lingua (italiano e
// inglese, più quelle della cartella di cui non si capisce la lingua):
//   1. per ogni lingua, prima un .srt/.vtt accanto al video (nella sua
//      cartella, o scelto insieme al film);
//   2. poi uno già trovato online le volte prima e tenuto in Ciak;
//   3. le lingue che mancano si cercano su OpenSubtitles — una ricerca sola per
//      tutte — e quello trovato si salva accanto al video (o in Ciak, dove il
//      browser non lascia scrivere), così la volta dopo è già lì e non costa
//      download.
// «Prova un altro» vale per una lingua: passa al suo candidato successivo, per
// quando la sincronia è sbagliata; se quello scartato l'aveva salvato Ciak,
// lo si toglie.

// Le lingue che il lettore offre sempre, se si trovano.
const LINGUE_VOLUTE = ['it', 'en'] as const
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

type Fonte =
  | { tipo: 'accanto'; sub: SottotitoloAccanto }
  | { tipo: 'salvato'; sub: SottotitoloSalvato }
  | { tipo: 'online'; sub: CandidatoOnline }

interface Corsia {
  fonti: Fonte[]
  indice: number
  // Dove l'ha salvato Ciak, per toglierlo se lo si scarta: un file accanto al
  // video, o una voce in Ciak.
  salvatoDaCiak: { accanto: string } | { inCiak: string } | null
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

// L'hash di OpenSubtitles: due pezzi da 64 KB, il primo e l'ultimo, letti dal
// disco. Best effort — senza si cerca solo per titolo.
async function hashDelVideo(file: File): Promise<string | undefined> {
  if (file.size < 2 * BLOCCO_HASH) return undefined
  try {
    const [inizio, fine] = await Promise.all([
      file.slice(0, BLOCCO_HASH).arrayBuffer(),
      file.slice(file.size - BLOCCO_HASH).arrayBuffer(),
    ])
    return hashOpenSubtitles(file.size, inizio, fine)
  } catch (e) {
    logFailure('Hash del video per OpenSubtitles')(e)
    return undefined
  }
}

function corsiaDi(lingua: string | null): string {
  return lingua === 'it' || lingua === 'en' ? lingua : ALTRO
}

const ORDINE_CORSIE = ['it', 'en', ALTRO]

export function useSottotitoli(film: FilmAperto | undefined) {
  const [tracce, setTracce] = useState<Traccia[]>([])
  const [cercando, setCercando] = useState(true)
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  // Per ogni corsia: se c'è un altro candidato da provare.
  const [altri, setAltri] = useState<Record<string, boolean>>({})

  // Lo stato della ricerca che non serve a disegnare la pagina.
  const lavoro = useRef<{
    film: FilmAperto | null
    corsie: Map<string, Corsia>
    onlineCercati: boolean
    annullato: boolean
  }>({ film: null, corsie: new Map(), onlineCercati: false, annullato: false })

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
  // corsia della sua lingua, in coda a quelli che c'erano già.
  const cercaOnline = useCallback(async () => {
    const l = lavoro.current
    l.onlineCercati = true
    if (!l.film) return
    const cercato = filmDaCercare(l.film.file.name, l.film.cartella, l.film.serie)
    const hash = await hashDelVideo(l.film.file)
    const { candidati } = await apiSottotitoli<{ candidati: CandidatoOnline[] }>({ azione: 'cerca', ...cercato, query: cercato.titolo, hash })
    for (const sub of candidati) corsia(corsiaDi(sub.lingua)).fonti.push({ tipo: 'online', sub })
  }, [])

  // Carica la fonte numero `indice` di una corsia, cercando online se quelle
  // che c'erano sono finite. Torna false se non c'era niente da caricare.
  const caricaFonte = useCallback(
    async (chiave: string, indice: number): Promise<boolean> => {
      const l = lavoro.current
      const c = corsia(chiave)
      if (indice >= c.fonti.length && !l.onlineCercati && chiave !== ALTRO) await cercaOnline()
      if (l.annullato) return false
      const fonte = c.fonti[indice]
      if (!fonte) return false
      c.indice = indice
      const film = l.film
      if (!film) return false
      if (fonte.tipo === 'accanto') {
        const file = film.vicini.find((f) => f.name === fonte.sub.name)
        if (!file) return false
        // I .srt italiani sono spesso in Windows-1252: si decodificano a mano.
        const testo = decodificaTesto(await file.arrayBuffer())
        if (l.annullato) return false
        mostra(chiave, testo, fonte.sub.lingua, film.origine === 'cartella' ? 'dalla cartella' : 'dal file scelto')
      } else if (fonte.tipo === 'salvato') {
        mostra(chiave, fonte.sub.testo, fonte.sub.lingua, 'da OpenSubtitles, salvato in Ciak')
      } else {
        const { testo } = await apiSottotitoli<{ testo: string }>({ azione: 'scarica', fileId: fonte.sub.fileId })
        if (l.annullato) return false
        let origine = 'da OpenSubtitles'
        try {
          if (film.scrivi) {
            const nome = nomeSottotitoloSalvato(film.file.name, fonte.sub.lingua)
            await film.scrivi.salva(nome, testo)
            c.salvatoDaCiak = { accanto: nome }
            origine = 'da OpenSubtitles, salvato nella cartella'
          } else {
            await salvaSottotitolo(film.id, chiave, fonte.sub.lingua, testo)
            c.salvatoDaCiak = { inCiak: chiave }
            origine = 'da OpenSubtitles, salvato in Ciak'
          }
        } catch (e) {
          logFailure('Salvataggio del sottotitolo trovato online')(e)
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
    if (!film) return
    const l = lavoro.current
    l.annullato = false
    l.film = film
    l.corsie = new Map()
    l.onlineCercati = false
    setTracce([])
    setCercando(true)
    setMessaggio(null)
    setErrore(null)
    ;(async () => {
      const vicini = film.vicini.map((f) => ({ id: f.name, name: f.name, mimeType: f.type }))
      for (const sub of sottotitoliPerVideo(film.file.name, vicini)) {
        corsia(corsiaDi(sub.lingua)).fonti.push({ tipo: 'accanto', sub })
      }
      for (const sub of await leggiSottotitoliSalvati(film.id).catch((e: unknown) => {
        logFailure('Sottotitoli salvati in Ciak')(e)
        return []
      })) {
        corsia(sub.chiave).fonti.push({ tipo: 'salvato', sub })
      }
      if (l.annullato) return
      // Le lingue volute ci sono sempre come corsie, anche vuote: così una
      // lingua che manca accanto al video fa partire la ricerca online.
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
        setMessaggio((m) => m ?? `Nessun sottotitolo in ${mancanti.join(' né in ')}, né accanto al video né su OpenSubtitles.`)
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
  }, [film, caricaFonte, gestisciErrore, aggiornaAltri])

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
      // Prima via quello scartato, poi il prossimo: accanto al video hanno lo
      // stesso nome, e toglierlo dopo vorrebbe dire cancellare il nuovo.
      const togli =
        scartato && 'accanto' in scartato
          ? (l.film?.scrivi?.togli(scartato.accanto) ?? Promise.resolve()).catch(logFailure('Sottotitolo scartato, accanto al video'))
          : scartato && l.film
            ? togliSottotitolo(l.film.id, scartato.inCiak).catch(logFailure('Sottotitolo scartato, in Ciak'))
            : Promise.resolve()
      setCercando(true)
      togli
        .then(() => caricaFonte(chiave, c.indice + 1))
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

  // Quello che il lettore usa per il titolo, quando il video non è ancora
  // riconosciuto: il nome del file e le sue cartelle.
  const info = useMemo<InfoFile | null>(
    () => (film ? { id: film.id, name: film.file.name, size: film.file.size, mimeType: film.file.type, parents: [] } : null),
    [film],
  )
  return { info, cartella: film?.cartella ?? null, serie: film?.serie ?? null, tracce, stato, messaggio: errore ?? messaggio, altri, provaAltro }
}
