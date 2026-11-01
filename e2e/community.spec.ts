import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn, E2E_USER } from './support/mocks'
import { movie, movieDetail, tv } from './support/fixtures'

// La parte «sociale» che si cercava su Letterboxd, presa da TMDB: le
// recensioni degli spettatori e le loro liste pubbliche, nella scheda di un
// titolo; ogni lista si apre in Ciak, coi segni di ciò che si è già visto.

function inArchivio(tmdbId: number, title: string) {
  return {
    id: `t-${tmdbId}`, user_id: E2E_USER.id, tmdb_id: tmdbId, media_type: 'movie',
    title, poster_path: '/p.jpg', status: 'watched', is_favorite: false,
    personal_rating: 5, genre_ids: [27], watched_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  }
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test('nella scheda di un titolo si leggono le recensioni degli utenti, in italiano e in inglese', async ({ page }) => {
  await mockTmdb(page, {
    detail: movieDetail(293670, 'The Wailing'),
    reviews: (lingua) =>
      lingua === 'en-US'
        ? [{ id: 'r-en', author: 'jdoe', author_details: { name: 'John', rating: 9 }, content: 'A slow-burn masterpiece.', created_at: '2024-02-01T00:00:00Z', url: 'https://www.themoviedb.org/review/r-en', iso_639_1: 'en' }]
        : [{ id: 'r-it', author: 'marta', author_details: { rating: 7 }, content: 'Inquietante fino all’ultimo.', created_at: '2023-01-01T00:00:00Z', url: 'https://www.themoviedb.org/review/r-it', iso_639_1: 'it' }],
  })
  await mockSupabase(page, { user_titles: [] })

  await page.goto('/title/movie/293670')

  const sezione = page.locator('section', { has: page.getByRole('heading', { name: /Recensioni degli utenti/ }) })
  await expect(sezione.getByText('Inquietante fino all’ultimo.')).toBeVisible()
  await expect(sezione.getByText('A slow-burn masterpiece.')).toBeVisible()
  await expect(sezione.getByText('★ 9/10')).toBeVisible()
  // Quella in italiano viene prima, anche se è più vecchia.
  await expect(sezione.locator('li').first()).toContainText('marta')
})

test('dalle liste degli utenti che contengono il titolo se ne apre una, coi già visti segnati', async ({ page }) => {
  await mockTmdb(page, {
    detail: movieDetail(293670, 'The Wailing'),
    lists: () => [
      { id: 8228510, name: 'Horror coreani', description: 'Il meglio dal 2000', item_count: 3, favorite_count: 5, poster_path: null },
      // Con un titolo solo (questo) non porta niente: non compare.
      { id: 99, name: 'Solo questo', item_count: 1, favorite_count: 0 },
    ],
    list: (id, p) => ({
      id,
      name: 'Horror coreani',
      description: 'Il meglio dal 2000',
      created_by: 'kimchi_fan',
      item_count: 3,
      total_pages: 2,
      items: p === 1 ? [movie(293670, 'The Wailing'), tv(70523, 'Kingdom')] : [movie(4552, 'Two Sisters')],
    }),
  })
  await mockSupabase(page, { user_titles: [inArchivio(293670, 'The Wailing')] })

  await page.goto('/title/movie/293670')
  await expect(page.getByRole('link', { name: /Horror coreani/ })).toBeVisible()
  await expect(page.getByText('Solo questo')).toHaveCount(0)
  await page.getByRole('link', { name: /Horror coreani/ }).click()

  await expect(page).toHaveURL(/\/lista-tmdb\/8228510$/)
  await expect(page.getByRole('heading', { name: 'Horror coreani' })).toBeVisible()
  await expect(page.getByText('di kimchi_fan · 3 titoli')).toBeVisible()
  await expect(page.getByText('Kingdom').first()).toBeVisible()
  // The Wailing è già visto: lo dice il suo badge, come nel resto del catalogo.
  await expect(page.getByAltText('The Wailing')).toBeVisible()
  await expect(page.getByText('✓ Visto')).toHaveCount(1)

  await page.getByRole('button', { name: 'Carica altri' }).click()
  await expect(page.getByText('Two Sisters').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Carica altri' })).toHaveCount(0)
})

test('una lista aperta da un link diretto si legge anche da sola', async ({ page }) => {
  await mockTmdb(page, {
    list: (id) => ({ id, name: 'Palme d’oro', created_by: 'cinefilo', item_count: 1, total_pages: 1, items: [movie(496243, 'Parasite')] }),
  })
  await mockSupabase(page, { user_titles: [] })

  await page.goto('/lista-tmdb/42')

  await expect(page.getByRole('heading', { name: 'Palme d’oro' })).toBeVisible()
  await expect(page.getByText('Parasite').first()).toBeVisible()
})

test('«Da recuperare» mostra anche la classifica completa, coi già visti, e filtra per genere', async ({ page }) => {
  const calls = await mockTmdb(page, {
    discover: () => [movie(238, 'Il Padrino'), movie(15, 'Quarto Potere')],
  })
  await mockSupabase(page, { user_titles: [inArchivio(238, 'Il Padrino')] })

  await page.goto('/da-recuperare')
  await expect(page.getByText('Quarto Potere').first()).toBeVisible()
  await expect(page.getByText('Il Padrino')).toHaveCount(0)

  await page.getByRole('button', { name: 'Classifica completa' }).click()
  await expect(page.getByRole('heading', { name: 'I più belli di sempre' })).toBeVisible()
  // Nella classifica completa il già visto c'è, col suo segno.
  await expect(page.getByAltText('Il Padrino')).toBeVisible()
  await expect(page.getByText('✓ Visto')).toHaveCount(1)

  await page.getByLabel('Genere').selectOption({ label: 'Horror' })
  await expect.poll(() => calls.discover.at(-1)?.genres).toBe('27')
})
