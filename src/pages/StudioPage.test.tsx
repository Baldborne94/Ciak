import { describe, it, expect, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import type { Company } from '../lib/types'

// Passando da uno studio all'altro, le risposte dello studio di prima che
// arrivano tardi non devono finire nella pagina del nuovo: il doppione di
// «A24» mostrava il suo avviso anche sulla pagina dell'A24 vero.

const attese = vi.hoisted(() => new Map<number, (c: Company | null) => void>())
vi.mock('../lib/tmdb', () => ({
  getCompany: async (id: number) => ({ id, name: 'A24', logoPath: null }),
  discoverByCompany: async () => ({ items: [], totalPages: 1 }),
  logoUrl: () => null,
  // Ogni studio risponde quando lo decide il test.
  studioOmonimoPiuGrande: (c: Company) => new Promise<Company | null>((r) => attese.set(c.id, r)),
}))
vi.mock('../components/EntityFavoriteButton', () => ({ default: () => null }))
vi.mock('../components/MediaGrid', () => ({ default: () => null }))

const { default: StudioPage } = await import('./StudioPage')

let vai: (percorso: string) => void = () => {}
function Navigatore() {
  vai = useNavigate()
  return null
}

describe('StudioPage', () => {
  it('l’avviso del doppione arrivato tardi non compare sulla pagina dello studio vero', async () => {
    render(
      <MemoryRouter initialEntries={['/studio/9001']}>
        <Navigatore />
        <Routes>
          <Route path="/studio/:id" element={<StudioPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await vi.waitFor(() => expect(attese.has(9001)).toBe(true))
    await act(async () => vai('/studio/41077'))
    await vi.waitFor(() => expect(attese.has(41077)).toBe(true))
    // Lo studio vero non ha omonimi più grandi; poi arriva, in ritardo, la
    // risposta del doppione.
    await act(async () => attese.get(41077)!(null))
    await act(async () => attese.get(9001)!({ id: 41077, name: 'A24', logoPath: null, film: 148 }))
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
