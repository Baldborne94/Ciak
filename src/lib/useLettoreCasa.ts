import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { logFailure } from './logFailure'
import { infoVideoJellyfin, sottotitoloJellyfin, type InfoJellyfin } from './jellyfin'
import { nomeLingua } from './sottotitoli'
import type { StatoSottotitoli, Traccia } from './useSottotitoli'
import type { InfoFile } from './googleDrive'

// I pezzi del lettore per i video del server di casa (Jellyfin). Il lettore è
// lo stesso dei video di Drive; cambia da dove arrivano il file, i
// sottotitoli e le altre lingue.

export function useInfoCasa(fileId: string, attivo: boolean): { info: InfoJellyfin | null; errore: string | null } {
  const [info, setInfo] = useState<InfoJellyfin | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  useEffect(() => {
    setInfo(null)
    setErrore(null)
    if (!attivo) return
    let vivo = true
    infoVideoJellyfin(fileId)
      .then((i) => vivo && setInfo(i))
      .catch((e: unknown) => {
        if (!vivo) return
        setErrore(e instanceof Error ? e.message : 'Il server di casa non risponde.')
        logFailure('Video del server di casa')(e)
      })
    return () => {
      vivo = false
    }
  }, [fileId, attivo])
  return { info, errore }
}

// I codici di Jellyfin («ita», «eng») come quelli dei sottotitoli di Ciak.
function linguaCiak(lingua: string | null): 'it' | 'en' | null {
  if (lingua === 'ita' || lingua === 'it') return 'it'
  if (lingua === 'eng' || lingua === 'en') return 'en'
  return null
}

const ORDINE = ['it', 'en', null]

// I sottotitoli che Jellyfin conosce (i .srt accanto al file e quelli di
// testo dentro il file), già in WebVTT. Con la stessa forma di
// `useSottotitoli`, così il lettore li tratta allo stesso modo.
export function useSottotitoliCasa(fileId: string, info: InfoJellyfin | null) {
  const [tracce, setTracce] = useState<Traccia[]>([])
  const [stato, setStato] = useState<StatoSottotitoli>('cerco')
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const url = useRef<string[]>([])

  useEffect(() => {
    if (!info) return
    let vivo = true
    setStato('cerco')
    const scelti = [...info.sottotitoli].sort((a, b) => ORDINE.indexOf(linguaCiak(a.lingua)) - ORDINE.indexOf(linguaCiak(b.lingua)))
    Promise.allSettled(
      scelti.map(async (s, i) => {
        const res = await fetch(sottotitoloJellyfin(fileId, info, s.indice))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const vtt = (await res.text()).replace(/^\uFEFF/, '')
        const lingua = linguaCiak(s.lingua)
        const blob = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))
        url.current.push(blob)
        const traccia: Traccia = {
          chiave: `casa-${s.indice}`,
          url: blob,
          lingua,
          etichetta: `${lingua ? nomeLingua(lingua) : s.titolo || `Sottotitoli ${i + 1}`} · ${s.esterno ? 'dalla cartella' : 'dal file'}`,
          vtt,
        }
        return traccia
      }),
    ).then((esiti) => {
      if (!vivo) return
      const trovate = esiti.flatMap((e) => (e.status === 'fulfilled' ? [e.value] : []))
      const falliti = esiti.length - trovate.length
      if (falliti > 0) logFailure('Sottotitoli del server di casa')(new Error(`${falliti} sottotitoli su ${esiti.length} non letti`))
      setTracce(trovate)
      setMessaggio(
        trovate.length === 0
          ? esiti.length > 0
            ? 'I sottotitoli del server di casa non si leggono.'
            : 'Nessun sottotitolo sul server di casa: aggiungi un .srt accanto al video, o il plugin OpenSubtitles di Jellyfin.'
          : null,
      )
      setStato(trovate.length > 0 ? 'pronti' : falliti > 0 ? 'errore' : 'nessuno')
    })
    return () => {
      vivo = false
    }
  }, [fileId, info])

  useEffect(
    () => () => {
      for (const u of url.current) URL.revokeObjectURL(u)
    },
    [],
  )

  // Quello che il lettore usa di `useSottotitoli`: il nome del file e le
  // cartelle servono al titolo quando il video non è ancora riconosciuto.
  const infoFile = useMemo<InfoFile | null>(
    () => (info ? { id: fileId, name: info.nome, size: info.dimensione, mimeType: '', parents: [] } : null),
    [fileId, info],
  )
  return {
    info: infoFile,
    cartella: info?.cartella ?? null,
    serie: info?.serie ?? null,
    tracce,
    stato,
    messaggio,
    altri: {} as Record<string, boolean>,
    // «Prova un altro» è dei sottotitoli cercati online: qui non ce ne sono.
    provaAltro: (chiave: string) => void chiave,
  }
}

// Il video convertito da Jellyfin (HLS) nel <video>: con hls.js dove il
// browser non lo legge da sé (Firefox, Chrome sul computer), nativo dove sì.
// hls.js si carica solo qui, quando serve: pesa, e quasi tutti i film partono
// diretti.
export function useHls(videoRef: RefObject<HTMLVideoElement>, url: string | null, chiave: unknown, suErrore: (messaggio: string) => void) {
  const errore = useRef(suErrore)
  errore.current = suErrore
  useEffect(() => {
    const video = videoRef.current
    if (!url || !video) return
    let chiuso = false
    let distruggi: (() => void) | null = null
    void import('hls.js')
      .then(({ default: Hls }) => {
        if (chiuso) return
        if (!Hls.isSupported()) {
          if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = url
          else errore.current('Questo browser non sa riprodurre i video convertiti dal server di casa.')
          return
        }
        const hls = new Hls({ maxBufferLength: 60 })
        // Qualche intoppo di rete si riprova; di fila, vuol dire server spento.
        let riprese = 0
        hls.on(Hls.Events.ERROR, (_e, dati) => {
          if (!dati.fatal) return
          if (dati.type === Hls.ErrorTypes.NETWORK_ERROR && riprese++ < 3) hls.startLoad()
          else if (dati.type === Hls.ErrorTypes.MEDIA_ERROR && riprese++ < 3) hls.recoverMediaError()
          else {
            hls.destroy()
            errore.current(
              dati.type === Hls.ErrorTypes.NETWORK_ERROR
                ? 'Il server di casa non risponde più: il PC è acceso, con Jellyfin aperto?'
                : `Il server di casa non riesce a convertire questo video (${dati.details}).`,
            )
          }
        })
        hls.on(Hls.Events.FRAG_LOADED, () => {
          riprese = 0
        })
        hls.loadSource(url)
        hls.attachMedia(video)
        distruggi = () => hls.destroy()
      })
      .catch((e: unknown) => {
        logFailure('Caricamento di hls.js')(e)
        errore.current('Il lettore per i video convertiti non si è caricato: ricarica la pagina.')
      })
    return () => {
      chiuso = true
      distruggi?.()
    }
  }, [videoRef, url, chiave])
}
