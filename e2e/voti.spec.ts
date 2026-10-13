import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, mockAiApi, signIn } from './support/mocks'
import { movie, movieDetail } from './support/fixtures'

// Il voto di TMDB è lo stesso sulla locandina e nella scheda. «Di tendenza»
// porta il voto di una fotografia che TMDB rifà di rado; la scheda lo legge
// aggiornato, e da lì in poi vale anche per la locandina.

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockSupabase(page)
  await mockAiApi(page)
})

test('aperta la scheda, la locandina mostra il voto aggiornato; con pochissimi voti non ne mostra', async ({ page }) => {
  await mockTmdb(page, {
    trending: [
      movie(77, 'Just Play Dead', { vote_average: 8.2, vote_count: 40 }),
      movie(78, 'Appena Uscito', { vote_average: 9.5, vote_count: 3 }),
    ],
    detailOf: (tipo, id) => (tipo === 'movie' && id === 77 ? movieDetail(77, 'Just Play Dead', { vote_average: 5.8, vote_count: 120 }) : undefined),
  })
  // «Di tendenza ora», in Cerca.
  await page.goto('/search')
  const locandina = page.getByRole('link', { name: /Just Play Dead/ }).first()
  await expect(locandina).toContainText('★ 8.2')
  // Tre voti non sono un giudizio: niente stella.
  await expect(page.getByRole('link', { name: /Appena Uscito/ }).first()).not.toContainText('★')

  await locandina.click()
  await expect(page.getByRole('heading', { name: 'Just Play Dead' })).toBeVisible()
  await expect(page.getByText('★ 5.8')).toBeVisible()

  await page.goBack()
  await expect(page.getByRole('link', { name: /Just Play Dead/ }).first()).toContainText('★ 5.8')

  // Ricaricando la pagina il voto aggiornato resta.
  await page.reload()
  await expect(page.getByRole('link', { name: /Just Play Dead/ }).first()).toContainText('★ 5.8')
})

test('nella scheda, un voto con pochi votanti lo dice', async ({ page }) => {
  await mockTmdb(page, { detail: movieDetail(79, 'Anteprima', { vote_average: 9, vote_count: 4 }) })
  await page.goto('/title/movie/79')
  await expect(page.getByText(/★ 9\.0\s*· pochi voti/)).toBeVisible()
})
