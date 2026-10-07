import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from './auth'
import { logFailure } from './logFailure'
import { addDiaryEntry, quickRate, updateDiaryEntry } from './diary'
import { listWatchedEpisodes, markEpisode, syncSeriesStatus } from './episodes'
import { getDetail } from './tmdb'
import { titoloDaSalvare } from './riconoscimento'
import { getUserTitle, upsertUserTitle } from './userTitles'
import { leggiPresenti, soloPresenti } from './videoPresenti'
import { elencaFilmOffline } from './filmOffline'
import {
  abbinamentoDa,
  contaComeVisto,
  episodiDellaSerie,
  leggiPosizioneLocale,
  posizionePiuRecente,
  prossimoEpisodio,
  puntoDiRipresa,
  salvaStreaming,
  scriviPosizioneLocale,
  SECONDI_PER_IN_CORSO,
  voceStreaming,
  type VoceStreaming,
} from './streaming'
import type { NomeFilm } from './sottotitoli'
import type { DiaryEntry, MediaItem } from './types'

// Il lettore e l'archivio, collegati: mentre guardi, Ciak si segna dove sei;
// dopo cinque minuti il film passa «in corso»; alla fine va nel diario (o
// l'episodio viene spuntato) e ti chiede il voto.

export type Visto =
  | { tipo: 'film'; voce: DiaryEntry | null }
  | { tipo: 'episodio'; seriesFinita: false }
  | { tipo: 'serie' }

// Ogni quanto si salva la posizione mentre il film va.
const OGNI_MS = 15_000
// Fin qui il film si considera «appena partito»: se l'archivio risponde tardi
// si salta ancora al punto salvato. Oltre, è chi guarda ad averlo spostato.
const APPENA_PARTITO = 60

function oggi(): string {
  return new Date().toISOString().slice(0, 10)
}

export function useArchivioStreaming(fileId: string, attivo: boolean) {
  const { user } = useAuth()
  const [voce, setVoce] = useState<VoceStreaming | null>(null)
  const [tutte, setTutte] = useState<VoceStreaming[]>([])
  // I film scaricati qui: si guardano anche se su Drive non ci sono più.
  const [scaricati, setScaricati] = useState<Set<string>>(new Set())
  useEffect(() => {
    let vivo = true
    elencaFilmOffline()
      .then((f) => vivo && setScaricati(new Set(f.filter((x) => x.stato === 'completo').map((x) => x.id))))
      .catch(logFailure('Film scaricati, per il prossimo episodio'))
    return () => {
      vivo = false
    }
  }, [])
  const [caricata, setCaricata] = useState(false)
  const [puntoRipresa, setPuntoRipresa] = useState(0)
  const [ripresoDa, setRipresoDa] = useState<number | null>(null)
  const [visto, setVisto] = useState<Visto | null>(null)
  const [votoSalvato, setVotoSalvato] = useState<number | null>(null)
  const [erroreArchivio, setErroreArchivio] = useState<string | null>(null)

  // Ciò che non disegna la pagina: contatori della visione in corso.
  const stato = useRef({
    ultimoTempo: -1,
    secondiBase: 0,
    secondiOra: 0,
    ultimoSalvataggio: 0,
    inCorsoFatto: false,
    marcato: false,
    ripresaFatta: false,
    durata: null as number | null,
    posizione: 0,
    // Il file di cui si sono già letti i dati: il rinnovo della sessione
    // (ogni ora) rilegge l'archivio, ma non deve azzerare la visione in corso.
    lettoPer: null as string | null,
  })

  useEffect(() => {
    if (!attivo || !user) return
    let vivo = true
    const s = stato.current
    const nuovo = s.lettoPer !== fileId
    if (nuovo) {
      Object.assign(s, { ultimoTempo: -1, secondiOra: 0, inCorsoFatto: false, marcato: false, ripresaFatta: false })
      setVisto(null)
      setVotoSalvato(null)
      setRipresoDa(null)
    }
    const locale = leggiPosizioneLocale(fileId)
    // Solo la riga di questo file: da lì si riprende, e subito. Gli altri
    // episodi della serie (per il prossimo) arrivano dopo, senza fretta.
    const carica = navigator.onLine ? voceStreaming(user.id, fileId) : Promise.resolve(null)
    carica
      .then((mia) => {
        if (!vivo) return
        setVoce(mia)
        if (mia?.media_type === 'tv' && mia.tmdb_id) {
          episodiDellaSerie(user.id, mia.tmdb_id)
            .then((righe) => vivo && setTutte(righe))
            .catch(logFailure('Episodi della serie nel lettore'))
        }
        if (!nuovo) return
        s.lettoPer = fileId
        s.secondiBase = mia?.secondi_visti ?? 0
        s.durata = mia?.durata ?? null
        setPuntoRipresa(puntoDiRipresa(posizionePiuRecente(mia, locale), mia?.durata ?? null))
      })
      .catch((e) => {
        logFailure('Lettura del film in streaming')(e)
        // Senza server resta la copia del dispositivo.
        if (!vivo || !nuovo) return
        s.lettoPer = fileId
        setPuntoRipresa(puntoDiRipresa(locale?.posizione ?? 0, null))
      })
      .finally(() => vivo && setCaricata(true))
    return () => {
      vivo = false
    }
  }, [fileId, attivo, user])

  const salva = useCallback(
    (campi: Partial<VoceStreaming>) => {
      if (!user) return
      scriviPosizioneLocale(fileId, stato.current.posizione)
      if (!navigator.onLine) return
      salvaStreaming(user.id, fileId, campi).catch(logFailure('Posizione del film non salvata'))
    },
    [fileId, user],
  )

  const salvaPosizione = useCallback(() => {
    const s = stato.current
    // Prima di sapere da dove riprendere, la posizione è quella dei primi
    // istanti: salvarla cancellerebbe il punto buono, che non si è ancora letto.
    if (!s.ripresaFatta) return
    s.ultimoSalvataggio = Date.now()
    salva({ posizione: s.posizione, durata: s.durata, secondi_visti: Math.round(s.secondiBase + s.secondiOra) })
  }, [salva])

  // Salva uscendo dalla pagina o chiudendo la scheda.
  useEffect(() => {
    if (!attivo) return
    const suUscita = () => {
      if (stato.current.posizione > 0) salvaPosizione()
    }
    window.addEventListener('pagehide', suUscita)
    return () => {
      window.removeEventListener('pagehide', suUscita)
      suUscita()
    }
  }, [attivo, salvaPosizione])

  const mettiInCorso = useCallback(async () => {
    if (!user || !voce?.tmdb_id || voce.media_type !== 'movie' || !voce.titolo) return
    const attuale = await getUserTitle(user.id, voce.tmdb_id, 'movie')
    // Un film già visto (una rivisione) o già in corso non si tocca.
    if (attuale && attuale.status !== 'to_watch') return
    await upsertUserTitle(
      user.id,
      { tmdbId: voce.tmdb_id, mediaType: 'movie', title: voce.titolo, posterPath: voce.poster_path, genreIds: [] },
      { status: 'in_progress' },
    )
  }, [user, voce])

  const segnaVisto = useCallback(async () => {
    if (!user || !voce?.tmdb_id || !voce.titolo || !voce.media_type) return
    const s = stato.current
    salva({ visto_il: new Date().toISOString(), posizione: s.posizione, durata: s.durata, secondi_visti: Math.round(s.secondiBase + s.secondiOra) })
    try {
      if (voce.media_type === 'movie') {
        const ref = { tmdbId: voce.tmdb_id, mediaType: 'movie' as const, title: voce.titolo, posterPath: voce.poster_path }
        const entry = await addDiaryEntry(user.id, ref, { watchedOn: oggi(), rating: null, note: null })
        // Il diario crea la scheda ma non cambia uno stato esistente: un film
        // «da vedere» o «in corso» va spostato a mano fra i visti.
        await upsertUserTitle(user.id, { ...ref, genreIds: [] }, { status: 'watched', watched_at: oggi() })
        setVisto({ tipo: 'film', voce: entry })
      } else if (voce.stagione != null && voce.episodio != null) {
        await markEpisode(user.id, voce.tmdb_id, voce.stagione, voce.episodio)
        const [visti, dettaglio] = await Promise.all([listWatchedEpisodes(user.id, voce.tmdb_id), getDetail('tv', voce.tmdb_id)])
        const totale = dettaglio.seasons.filter((st) => st.seasonNumber > 0).reduce((n, st) => n + st.episodeCount, 0)
        await syncSeriesStatus(
          user.id,
          { tmdbId: voce.tmdb_id, title: voce.titolo, posterPath: voce.poster_path, genreIds: dettaglio.genreIds },
          visti.size,
          totale,
        )
        setVisto(totale > 0 && visti.size >= totale ? { tipo: 'serie' } : { tipo: 'episodio', seriesFinita: false })
      }
    } catch (e) {
      logFailure('Film non segnato come visto')(e)
      setErroreArchivio('Non sono riuscito a segnarlo come visto: puoi farlo dalla sua scheda.')
    }
  }, [user, voce, salva])

  // Da chiamare a ogni timeupdate del video.
  const suTempo = useCallback(
    (v: HTMLVideoElement) => {
      const s = stato.current
      const t = v.currentTime
      if (Number.isFinite(v.duration) && v.duration > 0) s.durata = v.duration
      // Solo il tempo che scorre davvero: un salto non conta come «guardato».
      if (!v.paused && s.ultimoTempo >= 0) {
        const delta = t - s.ultimoTempo
        if (delta > 0 && delta < 2) s.secondiOra += delta
      }
      s.ultimoTempo = t
      s.posizione = t
      if (Date.now() - s.ultimoSalvataggio > OGNI_MS) salvaPosizione()
      if (!s.inCorsoFatto && s.secondiOra >= SECONDI_PER_IN_CORSO) {
        s.inCorsoFatto = true
        void mettiInCorso().catch(logFailure('Film non messo «in corso»'))
      }
      if (!s.marcato && voce?.tmdb_id && contaComeVisto(t, s.durata, s.secondiBase + s.secondiOra)) {
        s.marcato = true
        void segnaVisto()
      }
    },
    [voce, salvaPosizione, mettiInCorso, segnaVisto],
  )

  // Riprende dal punto salvato, una volta sola per apertura: un video che si
  // ricarica dopo un errore ha già la sua ripresa.
  const applicaRipresa = useCallback(
    (v: HTMLVideoElement) => {
      const s = stato.current
      if (s.ripresaFatta || !caricata) return
      s.ripresaFatta = true
      if (puntoRipresa > 0 && v.currentTime < Math.min(puntoRipresa, APPENA_PARTITO)) {
        v.currentTime = puntoRipresa
        setRipresoDa(puntoRipresa)
      }
    },
    [caricata, puntoRipresa],
  )

  const vota = useCallback(
    async (voto: number | null) => {
      if (!user || !voce?.tmdb_id || !voce.titolo || !voce.media_type) return
      try {
        if (visto?.tipo === 'film' && visto.voce) await updateDiaryEntry(user.id, visto.voce, { rating: voto })
        else
          await quickRate(
            user.id,
            { tmdbId: voce.tmdb_id, mediaType: voce.media_type, title: voce.titolo, posterPath: voce.poster_path },
            voto,
          )
        setVotoSalvato(voto)
      } catch (e) {
        logFailure('Voto dal lettore non salvato')(e)
        setErroreArchivio('Voto non salvato: riprova dalla scheda del titolo.')
      }
    },
    [user, voce, visto],
  )

  const cambiaAbbinamento = useCallback(
    async (item: MediaItem, nome: NomeFilm) => {
      if (!user) return
      const campi = { ...abbinamentoDa(item, nome), titolo: await titoloDaSalvare(item), abbinato_a_mano: true }
      await salvaStreaming(user.id, fileId, campi)
      setVoce((prima) => ({ ...(prima ?? ({ drive_file_id: fileId } as VoceStreaming)), ...campi }) as VoceStreaming)
      // Una serie scelta ora: i suoi episodi, per proporre il prossimo.
      if (campi.media_type === 'tv' && campi.tmdb_id) {
        episodiDellaSerie(user.id, campi.tmdb_id).then(setTutte).catch(logFailure('Episodi della serie nel lettore'))
      }
    },
    [user, fileId],
  )

  return {
    voce,
    caricata,
    ripresoDa,
    visto,
    votoSalvato,
    erroreArchivio,
    // Solo fra i file che ci sono ancora, come i pulsanti «Guarda»: un
    // episodio ricodificato ha un id nuovo, e il vecchio portava a un 404 con
    // il lettore fermo su 0:00.
    prossimo: voce ? prossimoEpisodio(voce, soloPresenti(tutte, leggiPresenti(), scaricati)) : null,
    suTempo,
    suPausa: salvaPosizione,
    applicaRipresa,
    vota,
    cambiaAbbinamento,
  }
}
