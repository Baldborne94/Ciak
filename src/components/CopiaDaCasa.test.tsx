import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CopiaDaCasa from './CopiaDaCasa'
import { infoDaSorgente } from '../lib/jellyfin'
import type { ProgressoCopia } from '../lib/copiaDaCasa'

// «Salva in Ciak» sotto il lettore, per un video del server di casa.

const stato = vi.hoisted(() => ({ progresso: null as ProgressoCopia | null, ascoltatori: new Set<() => void>() }))
const copiaDaCasa = vi.hoisted(() => vi.fn(async () => {}))
const annullaCopia = vi.hoisted(() => vi.fn())
const eliminaFilm = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('../lib/copiaDaCasa', async (originale) => ({
  ...(await originale<typeof import('../lib/copiaDaCasa')>()),
  copiaDaCasa,
  annullaCopia,
  progressoCopia: () => stato.progresso,
  ascoltaCopie: (cb: () => void) => {
    stato.ascoltatori.add(cb)
    return () => stato.ascoltatori.delete(cb)
  },
}))
vi.mock('../lib/filmOffline', async (originale) => ({
  ...(await originale<typeof import('../lib/filmOffline')>()),
  offlineDisponibile: () => true,
  eliminaFilm,
  filmOffline: vi.fn(async () => null),
}))

const ID = '27a641bb7cf83b9b409f4d868d9562d8'
const MB = 1024 ** 2
const mkv = infoDaSorgente({
  Id: ID,
  Path: 'E:\\Ciak\\FILM\\Kells\\The.Secret.of.Kells.mkv',
  Container: 'mkv',
  Size: 2048 * MB,
  MediaStreams: [
    { Index: 1, Type: 'Video', Codec: 'h264', BitDepth: 8 },
    { Index: 2, Type: 'Audio', Codec: 'aac', Language: 'eng' },
    { Index: 3, Type: 'Audio', Codec: 'ac3', Language: 'ita' },
  ],
})

const sottotitolo = { chiave: 'casa-0', url: 'blob:x', lingua: 'it' as const, etichetta: 'Italiano · dalla cartella', vtt: 'WEBVTT\n' }

function mostra(over: Partial<Parameters<typeof CopiaDaCasa>[0]> = {}) {
  const onLocale = vi.fn()
  render(
    <CopiaDaCasa
      fileId={`jf-${ID}`}
      titolo="The Secret of Kells"
      info={mkv}
      audio={{ indice: 3, nome: 'Italiano' }}
      sottotitoli={[sottotitolo]}
      locale={null}
      onLocale={onLocale}
      {...over}
    />,
  )
  return { onLocale }
}

beforeEach(() => {
  stato.progresso = null
  vi.clearAllMocks()
})

describe('CopiaDaCasa', () => {
  it('propone di salvarlo, dicendo che Jellyfin lo converte e in che lingua sarà', async () => {
    mostra()
    expect(screen.getByText(/Jellyfin lo converte in MP4 mentre lo scarica/)).toBeInTheDocument()
    expect(screen.getByText(/La copia avrà l’audio in italiano/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Salva in Ciak/ }))
    expect(copiaDaCasa).toHaveBeenCalledWith({
      fileId: `jf-${ID}`,
      titolo: 'The Secret of Kells',
      info: mkv,
      audio: 3,
      sottotitoli: [{ chiave: 'casa-0', lingua: 'it', etichetta: 'Italiano · dalla cartella', vtt: 'WEBVTT\n' }],
    })
  })

  it('mentre scarica dice a che punto è, e si può annullare', async () => {
    mostra()
    act(() => {
      stato.progresso = { scaricati: 12 * MB, totale: null, convertito: true }
      stato.ascoltatori.forEach((a) => a())
    })
    expect(screen.getByText(/dal server di casa: 12 MB…/)).toBeInTheDocument()
    expect(screen.getByText(/Puoi uscire da questa pagina/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Salva in Ciak/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(annullaCopia).toHaveBeenCalledWith(`jf-${ID}`)
  })

  it('salvato, si guarda col PC spento e si può eliminare', async () => {
    const { onLocale } = mostra({
      info: null,
      locale: { id: `jf-${ID}`, titolo: 'The Secret of Kells', file: 'The.Secret.of.Kells.mp4', dimensione: 700 * MB, stato: 'completo' },
    })
    expect(screen.getByText(/Salvato in Ciak \(700 MB\): si vede anche col server di casa spento/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Elimina dal dispositivo' }))
    expect(eliminaFilm).toHaveBeenCalledWith(`jf-${ID}`)
    expect(onLocale).toHaveBeenCalledWith(null)
  })

  it('senza risposta dal server e senza copia non promette niente', () => {
    const { container } = render(
      <CopiaDaCasa fileId={`jf-${ID}`} titolo="x" info={null} audio={{ indice: null, nome: null }} sottotitoli={[]} locale={null} onLocale={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
