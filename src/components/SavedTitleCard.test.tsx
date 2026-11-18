import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SavedTitleCard from './SavedTitleCard'
import type { UserTitle } from '../lib/types'

const southPark = {
  id: 'a', user_id: 'u', tmdb_id: 9473, media_type: 'movie', title: 'South Park: Il film - Più grosso, più lungo & tutto intero',
  poster_path: null, status: 'to_watch', is_favorite: false, personal_rating: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
} as unknown as UserTitle

const monta = (trovatoCome?: string | null) =>
  render(
    <MemoryRouter>
      <SavedTitleCard record={southPark} trovatoCome={trovatoCome} />
    </MemoryRouter>,
  )

describe('SavedTitleCard', () => {
  it('trovato col titolo originale, lo mostra sotto quello italiano', () => {
    monta('South Park: Bigger, Longer & Uncut')
    expect(screen.getByText('«South Park: Bigger, Longer & Uncut»')).toBeInTheDocument()
  })

  it('senza ricerca, niente riga in più', () => {
    monta(null)
    expect(screen.queryByText(/«/)).not.toBeInTheDocument()
  })
})
