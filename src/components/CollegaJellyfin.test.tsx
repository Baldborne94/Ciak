import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import CollegaJellyfin from './CollegaJellyfin'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

function compila(indirizzo: string) {
  fireEvent.change(screen.getByLabelText('Indirizzo del server'), { target: { value: indirizzo } })
  fireEvent.change(screen.getByLabelText('Utente di Jellyfin'), { target: { value: 'ale' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'segreta' } })
  fireEvent.click(screen.getByRole('button', { name: /Collega il server di casa/ }))
}

describe('CollegaJellyfin', () => {
  it('collega e lo dice a chi lo usa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ AccessToken: 'T', User: { Id: 'U', Name: 'ale' } }))))
    const onCollegato = vi.fn()
    render(<CollegaJellyfin onCollegato={onCollegato} />)
    compila('casa.ts.net')
    await waitFor(() => expect(onCollegato).toHaveBeenCalled())
    expect(JSON.parse(localStorage.getItem('ciak:jellyfin') ?? '{}')).toMatchObject({ url: 'https://casa.ts.net', token: 'T' })
  })

  it('un errore resta scritto sotto il modulo, e si può riprovare', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    const onCollegato = vi.fn()
    render(<CollegaJellyfin onCollegato={onCollegato} />)
    compila('casa.ts.net')
    expect(await screen.findByRole('alert')).toHaveTextContent('Utente o password sbagliati.')
    expect(onCollegato).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Collega il server di casa/ })).toBeEnabled()
  })

  it('Annulla c’è solo se serve', () => {
    const onAnnulla = vi.fn()
    const { rerender } = render(<CollegaJellyfin onCollegato={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Annulla' })).not.toBeInTheDocument()
    rerender(<CollegaJellyfin onCollegato={() => {}} onAnnulla={onAnnulla} />)
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(onAnnulla).toHaveBeenCalled()
  })
})
