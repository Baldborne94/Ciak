import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn, E2E_USER } from './support/mocks'
import { movieDetail } from './support/fixtures'

// Le statistiche devono dire la verità: i totali non possono fermarsi alla
// prima pagina di righe, e le ore non possono ignorare le serie — che per molti
// sono la maggior parte del tempo passato a guardare.

function titolo(tmdbId: number, mediaType: 'movie' | 'tv', title: string) {
  return {
    id: `t-${mediaType}-${tmdbId}`,
    user_id: E2E_USER.id,
    tmdb_id: tmdbId,
    media_type: mediaType,
    title,
    poster_path: '/p.jpg',
    status: 'watched',
    is_favorite: false,
    personal_rating: 4,
    notes: null,
    watched_at: '2026-03-01T00:00:00Z',
    genre_ids: [18],
    rewatch: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function episodio(tvId: number, season: number, ep: number) {
  return {
    id: `e-${tvId}-${season}-${ep}`,
    user_id: E2E_USER.id,
    tv_id: tvId,
    season_number: season,
    episode_number: ep,
    watched_at: '2026-03-01T00:00:00Z',
  }
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test('le ore contano anche le serie, non solo i film', async ({ page }) => {
  // Un film da 120 minuti + 4 episodi da 60: 2h di film e 4h di serie.
  await mockTmdb(page, {
    detail: movieDetail(1, 'Un film', { runtime: 120, episode_run_time: [60] }),
  })
  await mockSupabase(page, {
    user_titles: [titolo(1, 'movie', 'Un film'), titolo(2, 'tv', 'Una serie')],
    user_episodes: [
      episodio(2, 1, 1),
      episodio(2, 1, 2),
      episodio(2, 1, 3),
      episodio(2, 1, 4),
    ],
  })

  await page.goto('/statistiche')

  await expect(page.getByText('Ore guardate')).toBeVisible()
  // Il dettaglio finto vale per ogni id: 120 minuti a testa, quindi il film
  // porta 2h e i 4 episodi 8h. Ciò che conta è che le serie NON valgano zero.
  const dettaglio = page.getByText(/h di film · \d+h di serie/)
  await expect(dettaglio).toBeVisible()
  expect(await dettaglio.textContent()).not.toMatch(/0h di serie/)
})

test('la sezione "Quando guardi" riassume il diario', async ({ page }) => {
  await mockTmdb(page, { detail: movieDetail(1, 'Un film', { runtime: 100 }) })
  await mockSupabase(page, {
    user_titles: [titolo(1, 'movie', 'Un film')],
    user_diary: [
      {
        id: 'd1',
        user_id: E2E_USER.id,
        tmdb_id: 1,
        media_type: 'movie',
        title: 'Un film',
        poster_path: '/p.jpg',
        watched_on: '2026-03-02',
        rating: 4,
        note: null,
        created_at: '2026-03-02T00:00:00Z',
      },
    ],
  })

  await page.goto('/statistiche')

  await expect(page.getByText('📆 Quando guardi')).toBeVisible()
  await expect(page.getByText('giorni di fila')).toBeVisible()
  // Dodici colonne, una per mese: anche i mesi vuoti devono esserci.
  await expect(page.getByTitle(/^Gen: /)).toBeVisible()
  await expect(page.getByTitle(/^Dic: /)).toBeVisible()
})

test('la pagina regge una collezione vuota senza rompersi', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page, { user_titles: [] })

  await page.goto('/statistiche')
  await expect(page.getByText(/Ancora niente da analizzare/)).toBeVisible()
})

test('la pagina compare subito e si riempie mentre analizza', async ({ page }) => {
  // Il problema che questo test blocca: con una collezione grande la pagina
  // restava bianca finché OGNI titolo non era stato letto da TMDB.
  const titoli = Array.from({ length: 40 }, (_, i) => titolo(1000 + i, 'movie', `Film ${i}`))
  await mockSupabase(page, { user_titles: titoli })

  // TMDB risponde lentamente: se la pagina aspettasse tutti i titoli, qui non
  // si vedrebbe niente per parecchi secondi.
  await page.route('**/api.themoviedb.org/3/movie/*', async (route) => {
    await new Promise((r) => setTimeout(r, 300))
    return route.fulfill({
      json: { id: 1, genres: [], runtime: 100, release_date: '2020-01-01', credits: { cast: [], crew: [] } },
    })
  })

  await page.goto('/statistiche')

  // I conteggi che non dipendono da TMDB ci sono quasi subito…
  await expect(page.getByText('Film visti')).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('40', { exact: true }).first()).toBeVisible()
  // …e l'avanzamento è dichiarato invece di lasciare l'utente al buio.
  await expect(page.getByText(/Sto analizzando i tuoi titoli/)).toBeVisible()
})
