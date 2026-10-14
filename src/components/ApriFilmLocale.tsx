import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { apriFile, comeVideo } from '../lib/filmLocali'
import { riconosciNuovi } from '../lib/riconoscimento'
import { titoloDaMostrare, voceStreaming } from '../lib/streaming'
import { titoloVideo } from '../lib/fileVideo'
import { logFailure } from '../lib/logFailure'

// «Apri un film dal dispositivo»: si sceglie un video (e, se ci sono, i suoi
// .srt) dal disco del PC o dalla memoria del tablet, e parte nel lettore di
// Ciak. Prima se ne riconosce il titolo, come per quelli della cartella: così il
// diario, il voto e il punto di ripresa sono già quelli giusti.

export default function ApriFilmLocale({ grande = false }: { grande?: boolean }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const input = useRef<HTMLInputElement>(null)
  const [apro, setApro] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  async function scelti(file: File[]) {
    if (file.length === 0) return
    setErrore(null)
    setApro(true)
    try {
      const film = await apriFile(file)
      const video = comeVideo(film)
      let titolo = titoloVideo(video)
      if (user) {
        try {
          const nota = await voceStreaming(user.id, film.id)
          const voce = nota?.tmdb_id ? nota : (await riconosciNuovi(user.id, [video], new Map(nota ? [[film.id, nota]] : []))).get(film.id)
          titolo = (voce && titoloDaMostrare(voce)) ?? titolo
        } catch (e) {
          // Senza titolo il film si guarda lo stesso: lo si sceglie poi a mano.
          logFailure('Titolo del film aperto dal dispositivo')(e)
        }
      }
      // `aperto` cambia a ogni scelta: riscegliendo lo stesso film dal lettore
      // (stesso indirizzo) la pagina rilegge il file invece di ignorarlo.
      navigate(`/streaming/${film.id}`, { state: { titolo, file: film.file.name, aperto: Date.now() } })
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Non riesco ad aprire il file.')
    } finally {
      setApro(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className={grande ? 'flex flex-col items-center gap-2' : 'flex flex-col gap-1'}>
      <input
        ref={input}
        type="file"
        multiple
        accept="video/*,.mkv,.srt,.vtt"
        aria-label="Scegli il film (ed eventualmente i sottotitoli)"
        className="hidden"
        onChange={(e) => void scelti([...(e.target.files ?? [])])}
      />
      <button type="button" onClick={() => input.current?.click()} disabled={apro} className={grande ? 'btn-primary' : 'btn-ghost'}>
        {apro ? 'Apro…' : '🎬 Apri un film dal dispositivo'}
      </button>
      {errore && (
        <p role="alert" className="text-sm text-red-300">
          {errore}
        </p>
      )}
    </div>
  )
}
