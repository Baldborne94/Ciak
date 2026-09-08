import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, mockAiApi, signIn, E2E_USER } from './support/mocks'
import { movie, tv } from './support/fixtures'

// «I più belli che ti mancano»: la classifica di TMDB meno il tuo archivio.
// La sottrazione È la funzione — senza, sarebbe la stessa lista che vede
// chiunque, con dentro i film che hai già visto.

function inArchivio(tmdbId: number, title: string, over: Record<string, unknown> = {}) {
  return {
    id: `t-${tmdbId}`, user_id: E2E_USER.id, tmdb_id: tmdbId, media_type: 'movie',
    title, poster_path: '/p.jpg', status: 'watched', is_favorite: false,
    personal_rating: 5, genre_ids: [18], watched_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
  }
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockAiApi(page)
})

test('mostra i più votati togliendo quelli che hai già', async ({ page }) => {
  await mockTmdb(page, {
    discover: () => [movie(101, 'Il Padrino'), movie(102, 'Quarto Potere')],
  })
  await mockSupabase(page, { user_titles: [inArchivio(101, 'Il Padrino')] })

  await page.goto('/da-recuperare')

  await expect(page.getByText('Quarto Potere').first()).toBeVisible()
  // Quello già visto non compare: è il senso della pagina.
  await expect(page.getByText('Il Padrino')).toHaveCount(0)
})

test('anche un anime già visto viene tolto, benché TMDB lo chiami «tv»', async ({ page }) => {
  // La riga in archivio dice `anime`, il risultato di TMDB dice `tv`: senza la
  // traduzione le due chiavi non si incontrano e il titolo tornerebbe fra i
  // suggerimenti.
  await mockTmdb(page, {
    // Fixture `tv`, non `movie`: è ciò che /discover/tv restituisce davvero, e
    // il tipo del risultato è metà della verifica.
    // Due titoli, perché il secondo prova che la lista si è DAVVERO resa: senza,
    // «Cowboy Bebop non c'è» sarebbe vero anche a pagina ancora vuota, e il test
    // passerebbe pur con la traduzione rotta.
    discover: () => [tv(201, 'Cowboy Bebop'), tv(202, 'Serial Experiments Lain')],
  })
  await mockSupabase(page, {
    user_titles: [inArchivio(201, 'Cowboy Bebop', { media_type: 'anime' })],
  })

  await page.goto('/da-recuperare')
  await page.getByRole('button', { name: 'Serie TV' }).click()

  await expect(page.getByText('Serial Experiments Lain').first()).toBeVisible()
  await expect(page.getByText('Cowboy Bebop')).toHaveCount(0)
})

test('quando non resta niente lo dice, invece di lasciare la pagina vuota', async ({ page }) => {
  await mockTmdb(page, { discover: () => [movie(101, 'Il Padrino')] })
  await mockSupabase(page, { user_titles: [inArchivio(101, 'Il Padrino')] })

  await page.goto('/da-recuperare')

  await expect(page.getByText('Li hai visti tutti')).toBeVisible()
})

test('la soglia dei voti arriva davvero a TMDB', async ({ page }) => {
  // Senza soglia, ordinare per voto medio mette in cima i film con nove voti a
  // dieci: cortometraggi sconosciuti, non capolavori.
  const viste: string[] = []
  const calls = await mockTmdb(page, { discover: () => [movie(101, 'Il Padrino')] })
  await mockSupabase(page, { user_titles: [] })
  await page.route('**/api/tmdb*', async (route) => {
    const p = new URL(route.request().url()).searchParams
    if (p.get('path')?.startsWith('/discover/')) {
      viste.push(p.get('vote_count.gte') ?? '')
    }
    await route.fallback()
  })

  await page.goto('/da-recuperare')
  await expect(page.getByText('Il Padrino').first()).toBeVisible()
  await page.getByLabel('Selezione').selectOption('3000')

  await expect.poll(() => viste).toContain('3000')
  expect(calls.discover.at(-1)?.sortBy).toBe('vote_average.desc')
})
