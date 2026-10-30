import { useEffect, useState } from 'react'
import { ErroreCartella, cartellaCollegata, fileDallaCartella } from './cartellaLocale'
import { ascoltaFilmOffline, fileFilmSalvato, filmOffline, urlFilmSalvato, viciniSalvati, type FilmOffline } from './filmOffline'
import { eLocale, filmAperto, type FilmAperto } from './filmLocali'
import { logFailure } from './logFailure'

// Il file di un video del disco, per il lettore: quello scelto in questa
// visita, quello della cartella collegata (cartellaLocale), oppure la copia
// salvata in Ciak (filmOffline). Gli indirizzi blob si creano negli effetti e
// non durante il disegno: così si rilasciano quando non servono più.
//
// `riaperto` cambia quando il file si sceglie di nuovo dalla pagina stessa: si
// rilegge, come riaprendo la cartella (`riapri`).
export function useFileDelDisco(fileId: string, valido: boolean, riaperto: number | undefined) {
  const loc = eLocale(fileId)
  const [aperto, setAperto] = useState<FilmAperto | undefined>(() => (loc ? filmAperto(fileId) : undefined))
  // Finché la cartella collegata non ha risposto non si chiede di scegliere il file.
  const [cercatoInCartella, setCercatoInCartella] = useState(() => !loc || !cartellaCollegata())
  const [cartellaDaRiaprire, setCartellaDaRiaprire] = useState(false)
  const [riaperta, setRiaperta] = useState(0)
  useEffect(() => {
    if (!loc) return
    const subito = filmAperto(fileId)
    if (subito) {
      setAperto(subito)
      setCercatoInCartella(true)
      return
    }
    if (!cartellaCollegata()) return setCercatoInCartella(true)
    let vivo = true
    fileDallaCartella(fileId)
      .then((f) => {
        if (!vivo) return
        if (f) setAperto(f)
        setCartellaDaRiaprire(false)
      })
      .catch((e: unknown) => {
        if (!vivo) return
        if (e instanceof ErroreCartella && e.permesso) setCartellaDaRiaprire(true)
        else logFailure('Video dalla cartella collegata')(e)
      })
      .finally(() => vivo && setCercatoInCartella(true))
    return () => {
      vivo = false
    }
  }, [loc, fileId, riaperto, riaperta])

  const [urlAperto, setUrlAperto] = useState<string | null>(null)
  useEffect(() => {
    if (!aperto) return setUrlAperto(null)
    const url = URL.createObjectURL(aperto.file)
    setUrlAperto(url)
    return () => URL.revokeObjectURL(url)
  }, [aperto])

  // Il film salvato in Ciak: undefined finché non si è guardato in cache. Si
  // guarda anche senza il disco, in giro, offline.
  const [locale, setLocale] = useState<FilmOffline | null | undefined>(undefined)
  const scaricato = locale?.stato === 'completo'
  useEffect(() => {
    if (!valido) return
    let attivo = true
    void filmOffline(fileId).then((f) => attivo && setLocale(f))
    return () => {
      attivo = false
    }
  }, [fileId, valido])
  useEffect(
    () =>
      ascoltaFilmOffline((evento) => {
        if (evento.id !== fileId || evento.stato === 'in-corso') return
        void filmOffline(fileId).then(setLocale)
      }),
    [fileId],
  )
  // Il suo file, quando non c'è quello del disco: dalla cache, rilasciato
  // uscendo come quello scelto.
  const [urlSalvato, setUrlSalvato] = useState<string | null>(null)
  useEffect(() => {
    if (!scaricato || aperto) return setUrlSalvato(null)
    let vivo = true
    let fatto: string | null = null
    urlFilmSalvato(fileId)
      .then((u) => {
        fatto = u
        if (vivo) setUrlSalvato(u)
        else if (u) URL.revokeObjectURL(u)
      })
      .catch(logFailure('Film salvato in Ciak'))
    return () => {
      vivo = false
      if (fatto) URL.revokeObjectURL(fatto)
    }
  }, [fileId, scaricato, aperto])

  // La copia in Ciak come un file aperto, quando si guarda quella: i file
  // accanto salvati con lei (le lingue dell'audio, senza le quali un anime
  // doppiato torna muto) e il video, per cercarle i sottotitoli online se non
  // ne ha (vedi StreamingPlayerPage). Il blob della cache resta sul disco.
  const [copia, setCopia] = useState<FilmAperto | undefined>(undefined)
  const nomeSalvato = scaricato && !aperto ? (locale?.file ?? null) : null
  const serieSalvata = locale?.serie ?? null
  useEffect(() => {
    setCopia(undefined)
    if (nomeSalvato === null) return
    let vivo = true
    Promise.all([viciniSalvati(fileId), fileFilmSalvato(fileId)])
      .then(([vicini, video]) => {
        if (!vivo || !video) return
        const file = new File([video], nomeSalvato, { type: video.type })
        setCopia({ id: fileId, file, vicini, origine: 'scelto', cartella: null, serie: serieSalvata, scrivi: null })
      })
      .catch(logFailure('File accanto al film salvato in Ciak'))
    return () => {
      vivo = false
    }
  }, [fileId, nomeSalvato, serieSalvata])

  const copiaSenza = scaricato && !aperto && !locale?.sottotitoli?.length

  return {
    loc,
    aperto,
    cercatoInCartella,
    cartellaDaRiaprire,
    riapri: () => setRiaperta((n) => n + 1),
    locale,
    setLocale,
    scaricato,
    // Da dove legge il <video>: il file del disco o, senza, la copia in Ciak.
    src: urlAperto ?? urlSalvato,
    // La copia salvata quando accanto al video non c'erano sottotitoli: il
    // lettore glieli cerca online come al file del disco, e li salva con lei.
    // Sul tablet le stagioni nuove di una serie tenuta in Ciak restavano senza.
    copiaSenzaSottotitoli: copiaSenza,
    copiaDaSottotitolare: copiaSenza ? copia : undefined,
    // Ciò che sta accanto al video, per le lingue dell'audio: lo stesso ordine.
    conVicini: aperto ?? copia,
  }
}
