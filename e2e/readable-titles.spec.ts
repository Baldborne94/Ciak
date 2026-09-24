import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn } from './support/mocks'
import { movieDetail, personDetail } from './support/fixtures'

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

// Non solo i film: anche registi e attori con nome in uno script non latino
// vanno mostrati leggibili. Il caso della segnalazione: la scheda del regista
// «봉준호» (Bong Joon-ho).
test('il nome di un regista straniero ripiega sulla traslitterazione', async ({ page }) => {
  await mockTmdb(page, {
    person: personDetail(21684, '봉준호', {
      also_known_as: ['ボン・ジュノ', 'Bong Joon-ho'],
    }),
  })

  await page.goto('/person/21684')

  await expect(page.getByRole('heading', { name: 'Bong Joon-ho' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '봉준호' })).toHaveCount(0)
})

test('se TMDB non conosce una traslitterazione leggibile, il nome originale resta', async ({
  page,
}) => {
  await mockTmdb(page, {
    person: personDetail(9999, '宮崎駿', { also_known_as: ['みやざき はやお'] }),
  })

  await page.goto('/person/9999')

  await expect(page.getByRole('heading', { name: '宮崎駿' })).toBeVisible()
})

// Anche sulla scheda di un film: il nome del regista nei credits (es. «Regia:
// 봉준호») va reso leggibile. I credits non portano la traslitterazione, quindi
// si pesca dalla scheda persona — ma solo per i nomi in script non latino.
test('il nome del regista, nei credits di un film, ripiega sulla traslitterazione', async ({
  page,
}) => {
  await mockTmdb(page, {
    detail: movieDetail(9100, 'Madre', {
      credits: {
        cast: [{ id: 501, name: 'Kim Hye-ja', character: 'La madre', profile_path: null, order: 0 }],
        crew: [{ id: 21684, name: '봉준호', job: 'Director', profile_path: null }],
      },
    }),
    // /person/{id} porta la traslitterazione fra i nomi noti.
    person: personDetail(21684, '봉준호', { also_known_as: ['ボン・ジュノ', 'Bong Joon-ho'] }),
  })

  await page.goto('/title/movie/9100')

  await expect(page.getByText('Bong Joon-ho')).toBeVisible()
  await expect(page.getByText('봉준호')).toHaveCount(0)
})
