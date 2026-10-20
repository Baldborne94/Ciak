import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/auth-js'
import { logFailure } from './logFailure'
import { senzaExtra, soloRiproducibili, type VideoFile } from './fileVideo'
import { chiaveVideotecaArchivio, chiaveVideoteca, leggiCopia, salvaCopia } from './offlineCache'
import { eJellyfin, elencaVideoJellyfin, ErroreJellyfin, EVENTO_JELLYFIN, jellyfinCollegato, scollegaJellyfin, unisciFonti } from './jellyfin'
import { cartellaCollegata, elencaVideoCartella, ErroreCartella, EVENTO_CARTELLA, scollegaCartella } from './cartellaLocale'
import { eLocale } from './filmLocali'
import { riconosciNuovi } from './riconoscimento'
import { elencaStreaming, type VoceStreaming } from './streaming'
import { listAllWatchedEpisodes } from './episodes'
import { salvaPresenti } from './videoPresenti'
import { dimenticaVideoteca } from './useVideoteca'

// L'elenco della videoteca: i video della cartella collegata del PC e del
// server di casa (Jellyfin), insieme, e il legame di ognuno col suo titolo
// (locandina, «visto», punto di ripresa). Si parte dalla copia dell'ultima
// volta, se c'è, e la si sostituisce appena le fonti rispondono.
export function useElencoVideoteca(user: User | null) {
  // Il legame di ogni file col suo titolo.
  const [archivio, setArchivio] = useState<Map<string, VoceStreaming>>(new Map())
  // Gli episodi spuntati nel diario delle serie: visti anche in videoteca,
  // come nella Sala (vedi raggruppaSerie).
  const [vistiNelDiario, setVistiNelDiario] = useState<Map<string, string>>(new Map())
  // Senza il diario la videoteca resta quella dei soli file: non deve cadere con lui.
  const leggiDiario = useCallback(
    (userId: string) =>
      listAllWatchedEpisodes(userId).catch((e: unknown) => {
        logFailure('Episodi visti per la videoteca')(e)
        return new Map<string, string>()
      }),
    [],
  )
  // Il server di casa (Jellyfin), accanto o al posto della cartella.
  const [casaCollegata, setCasaCollegata] = useState(jellyfinCollegato())
  // La cartella del PC collegata (E:\Ciak). Riaprendo il browser ne va ridato
  // il permesso con un clic (`cartellaDaRiaprire`).
  const [cartella, setCartella] = useState(cartellaCollegata())
  const [cartellaDaRiaprire, setCartellaDaRiaprire] = useState(false)
  const [video, setVideo] = useState<VideoFile[]>([])
  const [nascosti, setNascosti] = useState(0)
  const [extra, setExtra] = useState(0)
  // L'elenco mostrato è quello salvato l'ultima volta (quando): la cartella si
  // sta rileggendo in sottofondo. null quando è quello fresco.
  const [copiaDel, setCopiaDel] = useState<string | null>(null)
  const [caricato, setCaricato] = useState(false)
  const [caricando, setCaricando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  // Quante volte la cartella è stata riletta, titoli compresi: le serie tenute
  // in Ciak copiano gli episodi nuovi a ogni lettura (vedi useSerieInCiak).
  const [letture, setLetture] = useState(0)

  // Si parte dall'elenco dell'ultima volta, se c'è: compare subito, invece di
  // una pagina vuota finché la cartella non è stata letta tutta.
  const daCopia = useRef(false)
  // La cartella ha già risposto: la copia arriverebbe tardi, e sarebbe più vecchia.
  const freschi = useRef(false)
  useEffect(() => {
    if (!user || daCopia.current || freschi.current || (!jellyfinCollegato() && !cartellaCollegata())) return
    daCopia.current = true
    const copia = leggiCopia<VideoFile>(chiaveVideoteca(user.id))
    if (!copia || copia.dati.length === 0) return
    const archivioSalvato = leggiCopia<VoceStreaming>(chiaveVideotecaArchivio(user.id))
    const { visibili: mp4, nascosti: altri } = soloRiproducibili(copia.dati)
    const { visibili, extra: daParte } = senzaExtra(mp4)
    setVideo((attuali) => (attuali.length > 0 ? attuali : visibili))
    setNascosti(altri)
    setExtra(daParte)
    if (archivioSalvato) setArchivio((attuale) => (attuale.size > 0 ? attuale : new Map(archivioSalvato.dati.map((v) => [v.drive_file_id, v]))))
    setCopiaDel(copia.salvatoIl)
  }, [user])

  const carica = useCallback(async () => {
    setErrore(null)
    setCaricando(true)
    try {
      // La cartella del PC e il server di casa insieme: uno che non risponde
      // (il PC spento) non deve nascondere l'altro.
      const daCasa = jellyfinCollegato()
      const daCartella = cartellaCollegata() !== null
      const [aCasa, inCartella] = await Promise.allSettled([
        daCasa ? elencaVideoJellyfin() : Promise.resolve([] as VideoFile[]),
        daCartella ? elencaVideoCartella() : Promise.resolve([] as VideoFile[]),
      ])
      if (aCasa.status === 'rejected') {
        // Un token che il server non riconosce più va ricollegato, non riprovato.
        if (aCasa.reason instanceof ErroreJellyfin && aCasa.reason.sessione) {
          scollegaJellyfin()
          setCasaCollegata(false)
        }
        logFailure('Elenco del server di casa')(aCasa.reason)
      }
      // Il permesso della cartella da ridare non è un guasto: serve un clic.
      const permessoCartella = inCartella.status === 'rejected' && inCartella.reason instanceof ErroreCartella && inCartella.reason.permesso
      setCartellaDaRiaprire(permessoCartella)
      if (inCartella.status === 'rejected' && !permessoCartella) logFailure('Elenco della cartella collegata')(inCartella.reason)
      const riuscite = (daCasa && aCasa.status === 'fulfilled') || (daCartella && inCartella.status === 'fulfilled')
      const problema = aCasa.status === 'rejected' ? aCasa.reason : inCartella.status === 'rejected' && !permessoCartella ? inCartella.reason : null
      if (!riuscite && problema) throw problema
      // Solo la cartella, in attesa del permesso: resta l'elenco dell'ultima
      // volta, che si guarda appena lo si ridà. I «visto» però si rileggono:
      // dicono quali copie in Ciak togliere, e sul tablet il permesso si
      // ridà solo quando servono gli episodi nuovi.
      if (!riuscite) {
        if (user && permessoCartella) {
          await Promise.all([elencaStreaming(user.id), leggiDiario(user.id)])
            .then(([voci, diario]) => {
              setArchivio(new Map(voci.map((v) => [v.drive_file_id, v])))
              setVistiNelDiario(diario)
            })
            .catch(logFailure('Titoli della videoteca, con la cartella da riaprire'))
        }
        return
      }
      if (problema) setErrore((problema as Error).message)
      const casa = aCasa.status === 'fulfilled' ? aCasa.value : []
      const sulPc = inCartella.status === 'fulfilled' ? inCartella.value : []
      const esito = { video: unisciFonti(sulPc, casa) }
      // Per i pulsanti «Guarda» del resto dell'app: un file cancellato dalla
      // cartella non deve più portare al lettore.
      salvaPresenti(esito.video.map((v) => v.id))
      const { visibili: mp4, nascosti: altri } = soloRiproducibili(esito.video)
      const { visibili, extra: daParte } = senzaExtra(mp4)
      setVideo(visibili)
      setNascosti(altri)
      setExtra(daParte)
      freschi.current = true
      setCaricato(true)
      setCopiaDel(null)
      if (user) salvaCopia(chiaveVideoteca(user.id), esito.video)
      // Locandine e titoli: prima ciò che è già collegato, poi si riconoscono
      // i file nuovi. Best effort: senza, la lista resta quella dei file.
      if (user) {
        try {
          const [voci, diario] = await Promise.all([elencaStreaming(user.id), leggiDiario(user.id)])
          const noti = new Map(voci.map((v) => [v.drive_file_id, v]))
          setArchivio(noti)
          setVistiNelDiario(diario)
          const riconosciuti = await riconosciNuovi(user.id, visibili, noti, new Set(esito.video.map((v) => v.id)))
          setArchivio(riconosciuti)
          salvaCopia(chiaveVideotecaArchivio(user.id), [...riconosciuti.values()])
          dimenticaVideoteca()
        } catch (e) {
          logFailure('Titoli dei film della videoteca')(e)
        }
      }
      setLetture((n) => n + 1)
    } catch (e) {
      setErrore((e as Error).message)
    } finally {
      setCaricando(false)
    }
  }, [user, leggiDiario])

  // Già collegati (token ancora valido in questa scheda): elenco subito, senza
  // chiedere di nuovo il permesso.
  useEffect(() => {
    if ((jellyfinCollegato() || cartellaCollegata()) && navigator.onLine) void carica()
  }, [carica])
  // La cartella collegata o tolta (anche da un'altra scheda).
  useEffect(() => {
    const cambiato = () => setCartella(cartellaCollegata())
    window.addEventListener(EVENTO_CARTELLA, cambiato)
    return () => window.removeEventListener(EVENTO_CARTELLA, cambiato)
  }, [])
  // Il server di casa collegato o tolto (anche da un'altra pagina).
  useEffect(() => {
    const cambiato = () => setCasaCollegata(jellyfinCollegato())
    window.addEventListener(EVENTO_JELLYFIN, cambiato)
    return () => window.removeEventListener(EVENTO_JELLYFIN, cambiato)
  }, [])

  // La cartella collegata o riaperta (vedi ScegliCartella): si rilegge.
  async function cartellaPronta() {
    setErrore(null)
    setCartella(cartellaCollegata())
    await carica()
  }

  async function scollegaLaCartella() {
    await scollegaCartella().catch(logFailure('Scollegamento della cartella dei film'))
    setCartella(null)
    setCartellaDaRiaprire(false)
    setVideo((attuali) => attuali.filter((v) => !eLocale(v.id)))
  }

  async function casaPronta() {
    setCasaCollegata(true)
    await carica()
  }

  function scollegaCasa() {
    scollegaJellyfin()
    setCasaCollegata(false)
    setVideo((attuali) => attuali.filter((v) => !eJellyfin(v.id)))
  }

  return {
    archivio,
    setArchivio,
    vistiNelDiario,
    video,
    nascosti,
    extra,
    copiaDel,
    caricato,
    caricando,
    letture,
    errore,
    setErrore,
    carica,
    cartella,
    cartellaDaRiaprire,
    cartellaPronta,
    scollegaLaCartella,
    casaCollegata,
    casaPronta,
    scollegaCasa,
  }
}
