import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn, E2E_USER, TMDB_PROXY, tmdbRequest } from './support/mocks'

// Gli anni di uscita servono a ordinare le liste, e venivano richiesti a TMDB
// da capo a ogni apertura: una richiesta per titolo, ogni volta. Su una
// watchlist lunga sono centinaia di richieste per un dato che, per un film già
// uscito, non cambierà mai più.

function watchlistRow(tmdbId: number, title: string) {
  return {
    id: `row-${tmdbId}`,
    user_id: E2E_USER.id,
    tmdb_id: tmdbId,
    media_type: 'movie',
    title,
    poster_path: '/p.jpg',
    status: 'to_watch',
    is_favorite: false,
    personal_rating: null,
    notes: null,
    watched_at: null,
    genre_ids: [18],
    rewatch: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  }
}

// Conta le richieste di dettaglio, che sono quelle che l'anno di uscita
// costava. Va registrato prima dei mock, così vede tutto il traffico.
async function countDetailRequests(page: import('@playwright/test').Page) {
  const urls: string[] = []
  page.on('request', (r) => {
    // Il percorso TMDB viaggia nel parametro `path` del proxy, non nell'URL.
    const path = new URL(r.url()).searchParams.get('path') ?? ''
    if (/^\/(movie|tv)\/\d+$/.test(path)) urls.push(r.url())
  })
  return () => urls.length
}

test('gli anni di uscita non vengono richiesti di nuovo alla visita successiva', async ({
  page,
}) => {
  const detailRequests = await countDetailRequests(page)
  await signIn(page)
  await mockTmdb(page)
  await mockSupabase(page, {
    user_titles: [
      watchlistRow(550, 'Fight Club'),
      watchlistRow(551, 'Heat'),
      watchlistRow(552, 'Sicario'),
    ],
  })

  await page.goto('/lists/watchlist')
  await expect(page.getByText('Fight Club')).toBeVisible()
  // Un titolo, una richiesta: la prima volta l'anno non lo sappiamo.
  await expect.poll(detailRequests).toBe(3)

  const dopoLaPrimaVisita = detailRequests()
  await page.goto('/lists/watchlist')
  await expect(page.getByText('Fight Club')).toBeVisible()

  // Seconda visita: gli anni sono già in cache, nessuna richiesta in più.
  await page.waitForTimeout(500)
  expect(detailRequests()).toBe(dopoLaPrimaVisita)
})

test('la lista si apre anche se TMDB non risponde per gli anni', async ({ page }) => {
  // L'anno è un di più per l'ordinamento: se manca, la lista deve comunque
  // comparire invece di restare a caricare.
  await signIn(page)
  await mockTmdb(page)
  await mockSupabase(page, { user_titles: [watchlistRow(550, 'Fight Club')] })
  await page.route(TMDB_PROXY, async (route) => {
    const { path } = tmdbRequest(route)
    if (path !== '/movie/550') return route.fallback()
    return route.fulfill({ status: 500, json: { error: 'giù' } })
  })

  await page.goto('/lists/watchlist')
  await expect(page.getByText('Fight Club')).toBeVisible()
})
