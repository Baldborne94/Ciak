import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn, E2E_USER } from './support/mocks'
import { movieDetail } from './support/fixtures'

// Il Profilo di gusto: «Cosa guardi» separa anime e cartoni dalle serie, e
// «I tuoi titoli col voto più alto» non si ferma ai primi dieci.

function riga(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `row-${n}`, user_id: E2E_USER.id, tmdb_id: n, media_type: 'movie', title: `Titolo ${n}`,
    poster_path: '/p.jpg', status: 'watched', is_favorite: false, personal_rating: 5, notes: null,
    watched_at: '2025-03-01T00:00:00Z', genre_ids: [18], rewatch: false,
    created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z', ...over,
  }
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test('«Cosa guardi» conta anime e cartoni a parte, anche se salvati come serie', async ({ page }) => {
  // Konosuba e Gumball arrivano dal catalogo come «tv»: la lingua originale
  // (da TMDB) dice quale dei due sono.
  await mockTmdb(page, {
    detailOf: (tipo, id) =>
      tipo === 'tv' && id === 65844 ? movieDetail(id, 'Konosuba', { original_language: 'ja' })
        : tipo === 'tv' && id === 37606 ? movieDetail(id, 'Gumball', { original_language: 'en' })
        : undefined,
  })
  await mockSupabase(page, {
    user_titles: [
      riga(550),
      riga(65844, { media_type: 'tv', title: 'Konosuba', genre_ids: [16, 35] }),
      riga(37606, { media_type: 'tv', title: 'Lo straordinario mondo di Gumball', genre_ids: [16, 35] }),
      riga(1396, { media_type: 'tv', title: 'Breaking Bad', genre_ids: [18] }),
    ],
  })

  await page.goto('/profilo')

  const sezione = page.locator('section', { has: page.getByRole('heading', { name: /Cosa guardi/ }) })
  await expect(sezione.getByText('Anime', { exact: true })).toBeVisible()
  await expect(sezione.getByText('Cartoni', { exact: true })).toBeVisible()
  await expect(sezione.getByText('Serie TV', { exact: true })).toBeVisible()
  await expect(sezione.getByText('Film', { exact: true })).toBeVisible()
})

test('i titoli col voto più alto non si fermano ai primi dieci', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page, { user_titles: Array.from({ length: 30 }, (_, i) => riga(1000 + i)) })

  await page.goto('/profilo')

  const sezione = page.locator('section', { has: page.getByRole('heading', { name: /voto più alto/ }) })
  await expect(sezione.getByText('30 a cinque stelle su 30 votati.', { exact: false })).toBeVisible()
  await expect(sezione.getByRole('link')).toHaveCount(24)
  await sezione.getByRole('button', { name: 'Mostra altri (6)' }).click()
  await expect(sezione.getByRole('link')).toHaveCount(30)
})
