import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import ApriFilmLocale from './ApriFilmLocale'
import { useAuth } from '../lib/auth'
import { voceStreaming } from '../lib/streaming'
import { riconosciNuovi } from '../lib/riconoscimento'
import { filmAperto } from '../lib/filmLocali'

vi.mock('../lib/auth', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/streaming', async (originale) => ({ ...(await originale<object>()), voceStreaming: vi.fn() }))
vi.mock('../lib/riconoscimento', () => ({ riconosciNuovi: vi.fn() }))
vi.mock('../lib/logFailure', () => ({ logFailure: () => vi.fn() }))

// Dove si arriva, con lo stato che il lettore legge (titolo e file).
function Lettore() {
  const { pathname, state } = useLocation()
  return <p>{`${pathname} · ${(state as { titolo: string }).titolo}`}</p>
}

function monta() {
  return render(
    <MemoryRouter initialEntries={['/streaming']}>
      <Routes>
        <Route path="/streaming" element={<ApriFilmLocale />} />
        <Route path="/streaming/:id" element={<Lettore />} />
      </Routes>
    </MemoryRouter>,
  )
}

const video = () => new File([new Uint8Array(64)], 'Song.of.the.Sea.2014.mp4', { type: 'video/mp4' })

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as unknown as ReturnType<typeof useAuth>)
  vi.mocked(voceStreaming).mockResolvedValue(null)
  vi.mocked(riconosciNuovi).mockResolvedValue(new Map())
})

describe('ApriFilmLocale', () => {
  it('apre il film scelto nel lettore, col titolo riconosciuto', async () => {
    vi.mocked(riconosciNuovi).mockImplementation(async (_utente, [v]) =>
      new Map([[v.id, { drive_file_id: v.id, tmdb_id: 110416, media_type: 'movie', titolo: 'La canzone del mare' } as never]]),
    )
    monta()
    await userEvent.upload(screen.getByLabelText(/Scegli il film/), [video()])

    const arrivo = await screen.findByText(/^\/streaming\/loc-/)
    expect(arrivo).toHaveTextContent('La canzone del mare')
    const id = arrivo.textContent!.split(' ')[0].split('/').pop()!
    // Il file resta a portata del lettore, in questa visita.
    expect(filmAperto(id)?.file.name).toBe('Song.of.the.Sea.2014.mp4')
  })

  it('un titolo che non si riconosce non ferma il film: si usa il nome del file', async () => {
    vi.mocked(riconosciNuovi).mockRejectedValue(new Error('TMDB giù'))
    monta()
    await userEvent.upload(screen.getByLabelText(/Scegli il film/), [video()])
    expect(await screen.findByText(/^\/streaming\/loc-[0-9a-f]+ · Song\.of\.the\.Sea\.2014$/)).toBeInTheDocument()
  })

  it('senza un video lo dice, e resta dov’è', async () => {
    monta()
    const srt = new File(['1\n00:00:01,000 --> 00:00:02,000\nCiao\n'], 'Film.it.srt', { type: '' })
    await userEvent.upload(screen.getByLabelText(/Scegli il film/), [srt], { applyAccept: false })
    expect(await screen.findByRole('alert')).toHaveTextContent('Scegli un file video')
    expect(screen.getByRole('button', { name: '🎬 Apri un film dal dispositivo' })).toBeEnabled()
  })
})
