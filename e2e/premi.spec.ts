import { test, expect, type Page } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn, E2E_USER } from './support/mocks'
import { movie, movieDetail, personDetail, tv } from './support/fixtures'

// Le cose da cinefilo: le liste dei premi (da Wikidata) con quanti ne hai
// visti, le filmografie da completare, e la classifica degli anime.

function visto(tmdbId: number, title: string, mediaType = 'movie') {
  return {
    id: `t-${mediaType}-${tmdbId}`, user_id: E2E_USER.id, tmdb_id: tmdbId, media_type: mediaType,
    title, poster_path: '/p.jpg', status: 'watched', is_favorite: false,
    personal_rating: 5, genre_ids: [18], watched_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  }
}

const FILM: Record<number, string> = { 872585: 'Oppenheimer', 238: 'Il padrino', 496243: 'Parasite', 11216: 'Nuovo Cinema Paradiso' }

// Wikidata finto: Oscar e Palma d'oro, riconosciuti dall'elemento nella query.
async function mockWikidata(page: Page, richieste: string[] = []) {
  const riga = (qid: string, tmdb: number, anno: number) => ({
    film: { value: `http://www.wikidata.org/entity/${qid}` },
    tmdb: { value: String(tmdb) },
    anno: { value: String(anno) },
    titolo: { value: FILM[tmdb] },
  })
  await page.route('https://query.wikidata.org/sparql**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('query') ?? ''
    richieste.push(q)
    const bindings = q.includes('wd:Q102427')
      ? [riga('Q1', 238, 1973), riga('Q2', 872585, 2024)]
      : q.includes('wd:Q179808')
        ? [riga('Q3', 496243, 2019), riga('Q4', 11216, 1989)]
        : []
    await route.fulfill({ json: { results: { bindings } } })
  })
  return richieste
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test('le liste dei premi dicono quanti ne hai visti e quali ti mancano', async ({ page }) => {
  await mockTmdb(page, { detailOf: (_t, id) => movieDetail(id, FILM[id] ?? `Titolo ${id}`) })
  await mockSupabase(page, { user_titles: [visto(238, 'Il padrino')] })
  const richieste = await mockWikidata(page)

  await page.goto('/premi')

  await expect(page.getByRole('heading', { name: 'Oscar al miglior film' })).toBeVisible()
  await expect(page.getByText('Ne hai visti 1 su 2')).toBeVisible()
  // Il più recente per primo, con l'anno del premio.
  const voci = page.getByRole('list', { name: 'Vincitori: Oscar al miglior film' }).getByRole('listitem')
  await expect(voci.first()).toContainText('2024')
  await expect(voci.first().getByAltText('Oppenheimer')).toBeVisible()

  await page.getByRole('button', { name: 'Mi mancano' }).click()
  await expect(page.getByAltText('Il padrino')).toHaveCount(0)
  await expect(page.getByAltText('Oppenheimer')).toBeVisible()

  await page.getByRole('button', { name: 'Palma d’oro' }).click()
  await expect(page.getByAltText('Parasite')).toBeVisible()
  await expect(page.getByText('Ne hai visti 0 su 2')).toBeVisible()
  expect(richieste.some((q) => q.includes('wd:Q179808'))).toBe(true)
})

test('la lista dei premi si salva: tornando non si richiede a Wikidata', async ({ page }) => {
  await mockTmdb(page, { detailOf: (_t, id) => movieDetail(id, FILM[id] ?? `Titolo ${id}`) })
  await mockSupabase(page, { user_titles: [] })
  const richieste = await mockWikidata(page)

  await page.goto('/premi')
  await expect(page.getByAltText('Oppenheimer')).toBeVisible()
  await page.reload()
  await expect(page.getByAltText('Oppenheimer')).toBeVisible()
  expect(richieste.filter((q) => q.includes('wd:Q102427'))).toHaveLength(1)
})

test('se Wikidata non risponde lo dice, invece di una pagina vuota', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page, { user_titles: [] })
  await page.route('https://query.wikidata.org/sparql**', (route) => route.fulfill({ status: 503, body: '' }))

  await page.goto('/premi')
  await expect(page.getByText('Wikidata non risponde')).toBeVisible()
})

test('la filmografia di un regista dice quanti suoi film hai visto e mostra quelli che mancano', async ({ page }) => {
  await mockTmdb(page, {
    person: personDetail(4385, 'Sergio Leone', {
      combined_credits: {
        cast: [],
        crew: [
          { ...movie(429, 'Il buono, il brutto, il cattivo', { release_date: '1966-12-23' }), job: 'Director', department: 'Directing' },
          { ...movie(311, 'C’era una volta in America', { release_date: '1984-05-23' }), job: 'Director', department: 'Directing' },
          { ...movie(335, 'C’era una volta il West', { release_date: '1968-12-21' }), job: 'Director', department: 'Directing' },
        ],
      },
    }),
  })
  await mockSupabase(page, { user_titles: [visto(429, 'Il buono, il brutto, il cattivo')] })

  await page.goto('/person/4385')

  await expect(page.getByText('Ne hai visti 1 su 3')).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'Filmografia vista' })).toHaveAttribute('aria-valuenow', '1')
  await page.getByRole('button', { name: 'Mi mancano' }).click()
  await expect(page.getByRole('link', { name: /C’era una volta in America/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Il buono, il brutto/ })).toHaveCount(0)
})

test('la classifica degli anime chiede animazione giapponese, e l anime già visto ha il suo segno', async ({ page }) => {
  const calls = await mockTmdb(page, { discover: () => [tv(30983, 'Cowboy Bebop'), tv(1429, 'L’attacco dei giganti')] })
  await mockSupabase(page, { user_titles: [visto(30983, 'Cowboy Bebop', 'anime')] })
  const lingue: string[] = []
  await page.route('**/api/tmdb*', async (route) => {
    const p = new URL(route.request().url()).searchParams
    if (p.get('path') === '/discover/tv') lingue.push(p.get('with_original_language') ?? '')
    await route.fallback()
  })

  await page.goto('/da-recuperare')
  await page.getByRole('button', { name: 'Anime' }).click()
  await page.getByRole('button', { name: 'Classifica completa' }).click()

  await expect(page.getByAltText('Cowboy Bebop')).toBeVisible()
  // Salvato come «anime», mostrato come serie di TMDB: il ✓ lo trova lo stesso.
  await expect(page.getByText('✓ Visto')).toHaveCount(1)
  await expect.poll(() => calls.discover.at(-1)?.genres).toBe('16')
  expect(lingue).toContain('ja')
})
