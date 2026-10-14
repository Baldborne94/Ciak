import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  PUNTI_VUOTI,
  arrivoSalto,
  codaSiglaRaggiunta,
  DURATA_SIGLA_PREDEFINITA,
  durataDaPunti,
  fineDaCorrezione,
  inSiglaFinale,
  inizioSiglaRaggiunto,
  leggiDurataSigla,
  leggiPuntiSigla,
  leggiSaltaSigle,
  pulsanteSigla,
  salvaPuntiSigla,
  salvaSaltaSigle,
  secondiAllaFine,
  type PuntiSigla,
  type Salto,
  type SaltaSigle,
} from './sigle'
import { sigleEpisodio, type SigleEpisodio } from './sigleOnline'
import { formattaTempo, type VoceStreaming } from './streaming'

// Le sigle nel lettore: «Salta sigla», il salto da solo, il conto alla rovescia
// dai titoli di coda e i tempi imparati per la serie (vedi lib/sigle), o quelli
// esatti dell'episodio quando TheIntroDB li ha (lib/sigleOnline).
//
// Il <video> chiama `suTempo` a ogni timeupdate e `suSalto` a ogni seeked;
// `finito` lo segnano onEnded e onPlay.
export function useSigleLettore(
  videoRef: RefObject<HTMLVideoElement>,
  voce: VoceStreaming | null,
  conProssimo: boolean,
  vaiAlProssimo: () => void,
) {
  // Dove si è nell'episodio: all'inizio (si può saltare la sigla), nella sigla
  // finale, finito. Si aggiornano solo quando cambiano, non a ogni timeupdate.
  // «Salta sigla» fisso, solo toccando, o niente (vedi `pulsanteSigla`).
  const [pulsante, setPulsante] = useState<'fisso' | 'con-comandi' | null>('con-comandi')
  const [inCoda, setInCoda] = useState(false)
  const [finito, setFinito] = useState(false)
  const [siglaSaltata, setSiglaSaltata] = useState(false)
  // Le caselle «salta sempre»: valgono per tutte le serie.
  const [scelte, setScelte] = useState<SaltaSigle>(leggiSaltaSigle)
  // Saltata da sola: da dove, per poterci tornare se il punto era sbagliato.
  const [rivedi, setRivedi] = useState<number | null>(null)
  useEffect(() => {
    if (rivedi === null) return
    const via = setTimeout(() => setRivedi(null), 8000)
    return () => clearTimeout(via)
  }, [rivedi])
  // Il conto alla rovescia partito dalla sigla finale, senza aspettare la fine.
  const [codaAutomatica, setCodaAutomatica] = useState(false)
  // L'ultimo «Salta sigla»: la barra trascinata subito dopo insegna dove
  // finisce (vedi `fineDaCorrezione`, in `suSalto`).
  const ultimoSalto = useRef<Salto | null>(null)

  const serie = voce?.media_type === 'tv' && voce.tmdb_id ? `tv-${voce.tmdb_id}` : null
  const [durataBase, setDurataBase] = useState<number | null>(null)
  useEffect(() => setDurataBase(serie ? leggiDurataSigla(serie) : null), [serie])
  const [punti, setPunti] = useState<PuntiSigla>(PUNTI_VUOTI)
  useEffect(() => setPunti(serie ? leggiPuntiSigla(serie) : PUNTI_VUOTI), [serie])
  // Quanto dura la sigla iniziale: dai tempi della serie, se ci sono, se no
  // quella di base. null fuori dalle serie: lì non si salta niente.
  const durataSigla = durataBase === null ? null : durataDaPunti(punti, durataBase)
  // Si salva subito, non dentro l'aggiornamento dello stato: passando
  // all'episodio dopo la pagina sparisce prima che quello venga eseguito.
  const imparaPunti = useCallback(
    (nuovi: Partial<PuntiSigla>) => {
      if (!serie) return
      const aggiornati = { ...punti, ...nuovi }
      salvaPuntiSigla(serie, aggiornati)
      setPunti(aggiornati)
    },
    [serie, punti],
  )
  // I tempi esatti di questo episodio, se TheIntroDB li ha: valgono più del
  // punto imparato per la serie, perché ogni episodio ha i suoi.
  const [esatte, setEsatte] = useState<SigleEpisodio | null>(null)
  const voceTv = voce?.media_type === 'tv' ? voce : null
  useEffect(() => {
    if (!voceTv?.tmdb_id || voceTv.stagione == null || voceTv.episodio == null) return
    let vivo = true
    void sigleEpisodio(voceTv.tmdb_id, voceTv.stagione, voceTv.episodio).then((s) => vivo && setEsatte(s))
    return () => {
      vivo = false
    }
  }, [voceTv?.tmdb_id, voceTv?.stagione, voceTv?.episodio])
  const siglaEsatta = esatte?.inizio ?? null
  const codaEsatta = esatte?.finale ?? null

  // Premuto a mano durante la sigla finale: quanto mancava alla fine è dove
  // comincia la sigla finale di questa serie, per saltarla da sola. Un punto
  // già impostato (a mano o così) non si tocca: si cambia dalle «Sigle».
  const prossimoDallaSigla = useCallback(() => {
    const v = videoRef.current
    if (v && !finito && !codaAutomatica && punti.coda === null) {
      const coda = secondiAllaFine(v.currentTime, Number.isFinite(v.duration) ? v.duration : null)
      if (coda !== null) imparaPunti({ coda })
    }
    vaiAlProssimo()
  }, [videoRef, finito, codaAutomatica, punti.coda, imparaPunti, vaiAlProssimo])

  const siglaSaltabile = durataSigla !== null && pulsante !== null && !siglaSaltata && !finito

  // A mano insegna anche dove comincia la sigla in questa serie; da sola
  // (`automatica`) lascia per qualche secondo «↩ Rivedi la sigla». Il salto
  // si ricorda in `ultimoSalto`.
  function saltaSigla(automatica = false) {
    const v = videoRef.current
    if (!v || durataSigla === null) return
    const da = v.currentTime
    const a = arrivoSalto(da, punti, durataSigla, Number.isFinite(v.duration) ? v.duration : null, siglaEsatta)
    v.currentTime = a
    if (!siglaEsatta) ultimoSalto.current = { da, a, quando: Date.now() }
    setSiglaSaltata(true)
    if (automatica) setRivedi(da)
    // Con i tempi esatti non c'è niente da imparare, e un inizio già noto non
    // lo sposta un salto premuto in ritardo: si parte da «Reimpara».
    else if (!siglaEsatta && punti.inizio === null) imparaPunti({ inizio: Math.round(da) })
  }

  function rivediSigla() {
    if (videoRef.current && rivedi !== null) videoRef.current.currentTime = rivedi
    setRivedi(null)
  }

  function cambiaScelte(nuove: Partial<SaltaSigle>) {
    const aggiornate = { ...scelte, ...nuove }
    salvaSaltaSigle(aggiornate)
    setScelte(aggiornate)
  }

  // Con i tempi esatti dell'episodio il pulsante è fisso durante la sigla e
  // la coda parte coi titoli; senza, il punto imparato per la serie e i primi
  // minuti.
  function suTempo(v: HTMLVideoElement) {
    const t = v.currentTime
    const ora = pulsanteSigla(t, { esatta: siglaEsatta, punti, durata: durataSigla ?? DURATA_SIGLA_PREDEFINITA })
    if (ora !== pulsante) setPulsante(ora)
    const durataVideo = Number.isFinite(v.duration) ? v.duration : null
    const coda = codaEsatta ? t >= codaEsatta.da : inSiglaFinale(t, durataVideo)
    if (coda !== inCoda) setInCoda(coda)
    const partenzaSigla = siglaEsatta ? siglaEsatta.da : punti.inizio
    if (scelte.inizio && !siglaSaltata && inizioSiglaRaggiunto(t, partenzaSigla)) saltaSigla(true)
    // Dalla sigla finale parte il conto alla rovescia; tornando indietro si
    // ferma, invece di cambiare episodio a metà scena.
    const nellaCoda =
      scelte.fine && conProssimo && (codaEsatta ? t >= codaEsatta.da : codaSiglaRaggiunta(t, durataVideo, punti.coda))
    if (nellaCoda !== codaAutomatica) setCodaAutomatica(nellaCoda)
  }

  function suSalto(t: number) {
    const fine = fineDaCorrezione(ultimoSalto.current, t, Date.now())
    if (fine !== null) {
      ultimoSalto.current = null
      imparaPunti({ fine })
    }
  }

  // Per il pannello «Sigle»: i tempi esatti, quando valgono loro.
  const testoEsatte =
    esatte && (esatte.inizio || esatte.finale)
      ? `Per questo episodio valgono i tempi esatti di TheIntroDB${
          esatte.inizio ? `: sigla da ${formattaTempo(esatte.inizio.da)} a ${formattaTempo(esatte.inizio.a)}` : ''
        }${esatte.finale ? `${esatte.inizio ? ',' : ':'} titoli di coda da ${formattaTempo(esatte.finale.da)}` : ''}.`
      : null

  return {
    serie,
    durataSigla,
    punti,
    imparaPunti,
    scelte,
    cambiaScelte,
    pulsante,
    inCoda,
    finito,
    setFinito,
    codaAutomatica,
    rivedi,
    rivediSigla,
    siglaSaltabile,
    saltaSigla,
    prossimoDallaSigla,
    suTempo,
    suSalto,
    conEsatteInizio: siglaEsatta !== null,
    conEsatteFine: codaEsatta !== null,
    testoEsatte,
  }
}
