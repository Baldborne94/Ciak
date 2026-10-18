import { test, expect } from '@playwright/test'
import { E2E_USER, mockTmdb, mockSupabase, mockAiApi, signIn } from './support/mocks'
import { movie, tv } from './support/fixtures'

// «Stasera»: i titoli proposti dall'AI si abbinano a TMDB con l'anno e il
// tipo, non al primo omonimo. È ciò che fa scartare i già visti: con «The
// Witch» abbinato a un drama coreano del 2025, il film di Eggers già visto
// tornava fra le proposte, con la locandina di un altro titolo.

test('un titolo già visto non torna fra le proposte, e gli omonimi non rubano la scheda', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  // TMDB risponde in italiano e in inglese: Goksung in inglese è «The Wailing».
  await page.route('**/api/tmdb*', (route) => {
    const params = new URL(route.request().url()).searchParams
    if (params.get('path') !== '/search/multi') return route.fallback()
    const inglese = params.get('language') === 'en-US'
    return route.fulfill({
      json: {
        results: [
          tv(245703, 'The Witch', { original_name: '마녀', first_air_date: '2025-02-15', vote_average: 8.2 }),
          movie(310131, 'The VVitch', { original_title: 'The VVitch: A New-England Folktale', release_date: '2015-01-27', vote_average: 6.9 }),
          movie(1146302, 'The Wailing', { original_title: 'El llanto', release_date: '2024-09-26', vote_average: 6.1 }),
          movie(293670, inglese ? 'The Wailing' : 'Goksung - La presenza del diavolo', { original_title: '곡성', release_date: '2016-05-12', vote_average: 7.4 }),
        ],
      },
    })
  })
  await mockAiApi(page, {
    '/api/tonight': {
      suggestions: [
        { title: 'The Witch', year: '2015', length: '≈92 min', reason: 'Folk horror puro.' },
        { title: 'The Wailing', year: '2016', length: '≈156 min', reason: 'Folk horror coreano.' },
      ],
    },
  })
  await mockSupabase(page, {
    user_titles: [
      { id: 'ut-1', user_id: E2E_USER.id, tmdb_id: 310131, media_type: 'movie', title: 'The VVitch', status: 'watched', is_favorite: false, poster_path: null, genre_ids: [] },
    ],
  })

  await page.goto('/ai?tab=tonight')
  await page.getByRole('button', { name: '✨ Dimmi cosa vedere' }).click()

  // The Wailing è il film coreano del 2016, non l'horror spagnolo del 2024.
  await expect(page.getByRole('link', { name: /The Wailing/ })).toHaveAttribute('href', '/title/movie/293670')
  // The Witch era già visto: sparisce, invece di comparire col drama omonimo.
  await expect(page.getByText('Folk horror puro.')).toHaveCount(0)
  await expect(page.locator('a[href="/title/tv/245703"]')).toHaveCount(0)
})
