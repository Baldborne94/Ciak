import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn } from './support/mocks'
import { movieDetail } from './support/fixtures'

// Un titolo straniero non deve mai arrivare a schermo in uno script che non si
// legge, se TMDB ne conosce una versione leggibile. Il caso che ha fatto
// nascere questi test: un film cinese del 2026 mostrato come
// «剑来院线剧场版 十三之争», mentre il suo titolo internazionale esisteva —
// solo non fra le traduzioni, dove l'app lo cercava.

const CJK = '剑来院线剧场版 十三之争'

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, { user_titles: [] })
})

test('il titolo internazionale sostituisce gli ideogrammi anche senza traduzione inglese', async ({
  page,
}) => {
  await mockTmdb(page, {
    detail: movieDetail(9001, CJK, {
      original_title: CJK,
      original_language: 'zh',
      translations: { translations: [] }, // TMDB non ha una traduzione inglese
      alternative_titles: {
        titles: [
          { iso_3166_1: 'CN', title: CJK },
          { iso_3166_1: 'US', title: 'The 13th Sword' },
        ],
      },
    }),
  })

  await page.goto('/title/movie/9001')

  await expect(page.getByRole('heading', { name: 'The 13th Sword' })).toBeVisible()
  // L'originale resta consultabile nella scheda tecnica: non lo cancelliamo,
  // lo togliamo solo dal titolo principale.
  await expect(page.getByRole('heading', { name: CJK })).toHaveCount(0)
})

test('la traduzione inglese ha comunque la precedenza sui titoli alternativi', async ({ page }) => {
  await mockTmdb(page, {
    detail: movieDetail(9002, CJK, {
      original_title: CJK,
      original_language: 'zh',
      translations: {
        translations: [{ iso_639_1: 'en', data: { title: 'Sword Come', overview: 'An epic.' } }],
      },
      alternative_titles: { titles: [{ iso_3166_1: 'US', title: 'Titolo alternativo' }] },
    }),
  })

  await page.goto('/title/movie/9002')

  await expect(page.getByRole('heading', { name: 'Sword Come' })).toBeVisible()
})

test('quando TMDB non conosce nessuna versione leggibile il titolo originale resta', async ({
  page,
}) => {
  // Non inventiamo traduzioni: se non esiste nulla di meglio, meglio il titolo
  // vero che un segnaposto che non permette di riconoscere il film.
  await mockTmdb(page, {
    detail: movieDetail(9003, CJK, {
      original_title: CJK,
      original_language: 'zh',
      translations: { translations: [] },
      alternative_titles: { titles: [{ iso_3166_1: 'CN', title: CJK }] },
    }),
  })

  await page.goto('/title/movie/9003')

  await expect(page.getByRole('heading', { name: CJK })).toBeVisible()
})
