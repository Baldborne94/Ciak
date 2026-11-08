import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn, E2E_USER } from './support/mocks'
import { movie, movieDetail } from './support/fixtures'

// «Saghe da completare»: dalle saghe dei film visti, cosa manca e cosa deve
// uscire, con «Avvisami» che salva davvero l'avviso.

function visto(tmdbId: number, title: string) {
  return {
    id: `t-${tmdbId}`, user_id: E2E_USER.id, tmdb_id: tmdbId, media_type: 'movie',
    title, poster_path: '/p.jpg', status: 'watched', is_favorite: false,
    personal_rating: 5, genre_ids: [878], watched_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  }
}

const DUNE = {
  id: 726871,
  name: 'Dune Collection',
  overview: '',
  poster_path: '/dune.jpg',
  backdrop_path: null,
  parts: [
    movie(438631, 'Dune', { release_date: '2021-09-15' }),
    movie(693134, 'Dune - Parte due', { release_date: '2024-02-28' }),
    movie(1170608, 'Dune - Parte tre', { release_date: '2099-12-18' }),
  ],
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test('le saghe dei film visti dicono cosa manca e cosa deve uscire, e «Avvisami» lo salva', async ({ page }) => {
  await mockTmdb(page, {
    // Dune è nella sua saga; Parasite non ha saga e non deve comparire.
    detailOf: (_t, id) => (id === 438631 ? movieDetail(id, 'Dune', { belongs_to_collection: { id: 726871 } }) : movieDetail(id, `Titolo ${id}`, { belongs_to_collection: null })),
    collection: DUNE,
  })
  const db = await mockSupabase(page, { user_titles: [visto(438631, 'Dune'), visto(496243, 'Parasite')], user_alerts: [] })

  await page.goto('/saghe')

  const saga = page.getByRole('region', { name: 'Dune' })
  await expect(saga.getByText('Ne hai visti')).toContainText('1 su 2')
  await expect(saga.getByAltText('Dune - Parte due')).toBeVisible()
  await expect(saga.getByText('Dune - Parte tre')).toBeVisible()
  await expect(saga.getByText('18 dicembre 2099')).toBeVisible()
  await expect(page.getByRole('region', { name: /Parasite/ })).toHaveCount(0)

  await saga.getByRole('button', { name: '🔔 Avvisami' }).click()
  await expect(saga.getByRole('button', { name: '🔔 Ti avviso' })).toBeVisible()
  await expect.poll(() => db.tables.user_alerts.map((a) => (a as { tmdb_id: number }).tmdb_id)).toEqual([1170608])
})

test('da «Da recuperare» si arriva alle saghe', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page, { user_titles: [], user_alerts: [] })

  await page.goto('/da-recuperare')
  await page.getByRole('link', { name: '📚 Saghe da completare' }).click()
  await expect(page).toHaveURL(/\/saghe$/)
  await expect(page.getByText('Nessuna saga')).toBeVisible()
})
