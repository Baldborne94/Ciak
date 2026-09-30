import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, mockAiApi, signIn, E2E_USER } from './support/mocks'
import { movieDetail } from './support/fixtures'

// «▶ Guarda ora»: dai titoli dell'archivio ai loro file nella videoteca. Il
// pulsante c'è solo per i titoli che hanno un file, e porta al lettore.

function voce(over: Record<string, unknown>) {
  return {
    id: `s-${over.drive_file_id}`,
    user_id: E2E_USER.id,
    nome_file: null,
    poster_path: null,
    stagione: null,
    episodio: null,
    abbinato_a_mano: false,
    posizione: 0,
    durata: 5640,
    secondi_visti: 0,
    visto_il: null,
    ...over,
  }
}

function titolo(over: Record<string, unknown>) {
  return {
    user_id: E2E_USER.id,
    poster_path: '/p.jpg',
    status: 'to_watch',
    is_favorite: false,
    personal_rating: null,
    genre_ids: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

const SONG = voce({
  drive_file_id: 'video-song-0001',
  nome_file: 'Song.of.the.Sea.2014.1080p.mp4',
  tmdb_id: 110416,
  media_type: 'movie',
  titolo: 'Song of the Sea',
  posizione: 1345,
})

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockAiApi(page)
})

test('nella scheda di un film che è nella videoteca c’è «Riprendi» e porta al lettore', async ({ page }) => {
  await mockTmdb(page, { detail: movieDetail(110416, 'Song of the Sea') })
  await mockSupabase(page, { user_streaming: [SONG] })

  await page.goto('/title/movie/110416')
  const pulsante = page.getByRole('link', { name: '▶ Riprendi da 22:20' })
  await expect(pulsante).toHaveAttribute('href', '/streaming/video-song-0001')
  await pulsante.click()
  await expect(page).toHaveURL(/\/streaming\/video-song-0001$/)
  await expect(page.getByRole('heading', { name: 'Song of the Sea' })).toBeVisible()
})

test('un titolo senza file nella videoteca non ha il pulsante', async ({ page }) => {
  await mockTmdb(page, { detail: movieDetail(550, 'Fight Club') })
  await mockSupabase(page, { user_streaming: [SONG] })

  await page.goto('/title/movie/550')
  await expect(page.getByRole('heading', { name: 'Fight Club' })).toBeVisible()
  await expect(page.getByRole('link', { name: /▶ (Guarda|Riprendi)/ })).toHaveCount(0)
})

test('in «Da vedere» il pulsante c’è solo sulle card dei titoli con un file', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page, {
    user_titles: [
      titolo({ id: 't1', tmdb_id: 110416, media_type: 'movie', title: 'Song of the Sea' }),
      titolo({ id: 't2', tmdb_id: 550, media_type: 'movie', title: 'Fight Club' }),
    ],
    user_streaming: [{ ...SONG, posizione: 0 }],
  })

  await page.goto('/lists/watchlist')
  await expect(page.getByText('Fight Club')).toBeVisible()
  const pulsanti = page.getByRole('link', { name: '▶ Guarda ora' })
  await expect(pulsanti).toHaveCount(1)
  await expect(pulsanti).toHaveAttribute('href', '/streaming/video-song-0001')
})

test('«Riprendi a guardare» porta dritto all’episodio da riprendere', async ({ page }) => {
  await mockTmdb(page, {
    detail: movieDetail(126308, 'Shōgun', {
      name: 'Shōgun',
      number_of_seasons: 1,
      number_of_episodes: 10,
      seasons: [{ id: 1, season_number: 1, episode_count: 10, name: 'Stagione 1', air_date: '2024-02-27' }],
    }),
  })
  const ep = (n: number) =>
    voce({ drive_file_id: `shogun-ep-000${n}`, tmdb_id: 126308, media_type: 'tv', titolo: 'Shōgun', stagione: 1, episodio: n, durata: 3600 })
  await mockSupabase(page, {
    user_titles: [titolo({ id: 't3', tmdb_id: 126308, media_type: 'tv', title: 'Shōgun', status: 'in_progress' })],
    // Visti i primi due episodi: si riprende dal terzo.
    user_episodes: [1, 2].map((n) => ({
      id: `e${n}`,
      user_id: E2E_USER.id,
      tv_id: 126308,
      season_number: 1,
      episode_number: n,
      watched_at: `2026-09-2${n}T20:00:00Z`,
    })),
    user_streaming: [ep(1), ep(2), ep(3), ep(4)],
  })

  await page.goto('/')
  const riprendi = page.locator('section', { hasText: 'Riprendi a guardare' }).first()
  await expect(riprendi.getByRole('link', { name: '▶ Guarda S1E3' })).toHaveAttribute('href', '/streaming/shogun-ep-0003')
})
