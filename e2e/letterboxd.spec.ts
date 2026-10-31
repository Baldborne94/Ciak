import { test, expect } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'
import { mockTmdb, mockSupabase, signIn, E2E_USER, TMDB_PROXY, tmdbRequest } from './support/mocks'
import { movie } from './support/fixtures'

// Da Letterboxd a Ciak: l'esportazione (lo ZIP che Letterboxd ti fa scaricare)
// si sceglie dalle Impostazioni; Ciak cerca i film su TMDB, dice cosa
// importerebbe, e solo dopo la conferma scrive. Ciò che c'è già in Ciak resta.

const ZIP = zipSync(
  Object.fromEntries(
    Object.entries({
      'watched.csv': 'Date,Name,Year,Letterboxd URI\n2024-01-02,The Lion King,1994,https://boxd.it/1\n2024-03-04,Parasite,2019,https://boxd.it/2\n',
      'ratings.csv': 'Date,Name,Year,Letterboxd URI,Rating\n2024-03-04,Parasite,2019,https://boxd.it/2,4.5\n2024-01-02,The Lion King,1994,https://boxd.it/1,3\n',
      'diary.csv': 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2024-03-05,Parasite,2019,https://boxd.it/x,4.5,,,2024-03-04\n',
      'watchlist.csv': 'Date,Name,Year,Letterboxd URI\n2025-05-05,Paths of Glory,1957,https://boxd.it/3\n',
      'likes/films.csv': 'Date,Name,Year,Letterboxd URI\n2024-03-04,Parasite,2019,https://boxd.it/2\n',
      'lists/folk-horror.csv':
        'Letterboxd list export v7\nDate,Name,Tags,URL,Description\n2025-02-02,Folk horror,,https://letterboxd.com/u/list/folk-horror/,Il bosco\n\nPosition,Name,Year,URL,Description\n1,The Witch,2015,https://letterboxd.com/film/the-witch/,\n2,Un film che non esiste,2001,https://letterboxd.com/film/x/,\n',
    }).map(([nome, testo]) => [`letterboxd-spettatore-2026-11-01/${nome}`, strToU8(testo)]),
  ),
)

test('si importa da Letterboxd, senza toccare ciò che c’è già in Ciak', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  // TMDB, cercando per nome e anno: il re leone e Parasite si trovano già in
  // italiano; «Paths of Glory» solo in inglese (in italiano è «Orizzonti di gloria»).
  await page.route(TMDB_PROXY, (route) => {
    const { path, params } = tmdbRequest(route)
    if (path !== '/search/movie') return route.fallback()
    const inglese = params.get('language') === 'en-US'
    const risultati: Record<string, unknown[]> = {
      'The Lion King': [movie(8587, 'Il re leone', { original_title: 'The Lion King', release_date: '1994-06-23', genre_ids: [16] })],
      Parasite: [movie(496243, 'Parasite', { original_title: '기생충', release_date: '2019-05-30', genre_ids: [35, 53] })],
      'Paths of Glory': [movie(975, inglese ? 'Paths of Glory' : 'Orizzonti di gloria', { original_title: 'Paths of Glory', release_date: '1957-10-25' })],
      'The Witch': [movie(310131, 'The VVitch', { original_title: 'The VVitch: A New-England Folktale', release_date: '2015-01-27' })],
    }
    return route.fulfill({ json: { results: risultati[params.get('query') ?? ''] ?? [] } })
  })
  const db = await mockSupabase(page, {
    // Il re leone c'è già: visto, col tuo voto, che resta.
    user_titles: [
      {
        id: 't-1', user_id: E2E_USER.id, tmdb_id: 8587, media_type: 'movie', title: 'Il re leone', poster_path: '/p.jpg', status: 'watched',
        is_favorite: false, personal_rating: 5, notes: null, watched_at: '2010-01-01', genre_ids: [16], rewatch: false,
        created_at: '2010-01-01T00:00:00Z', updated_at: '2010-01-01T00:00:00Z',
      },
    ],
    user_diary: [],
    user_lists: [],
    user_list_items: [],
  })

  await page.goto('/settings')
  const sezione = page.locator('section').filter({ has: page.getByRole('heading', { name: '📥 Importa da Letterboxd' }) })
  await sezione.getByLabel('Esportazione di Letterboxd').setInputFiles({ name: 'letterboxd-spettatore.zip', mimeType: 'application/zip', buffer: Buffer.from(ZIP) })

  // Prima il riepilogo, niente scritto.
  await expect(sezione.getByText(/Pronti da importare: 1 film visto, 1 film da vedere, 1 voto, 1 preferito, 1 visione nel diario, 1 lista/)).toBeVisible()
  await expect(sezione.getByText('1 film non trovati su TMDB, che restano fuori')).toBeVisible()
  expect(db.writes.filter((w) => w.method !== 'GET')).toEqual([])

  await sezione.getByRole('button', { name: '📥 Importa in Ciak' }).click()
  await expect(sezione.getByText(/✓ Importato da Letterboxd/)).toBeVisible()

  const titoli = db.tables.user_titles as Record<string, unknown>[]
  const di = (id: number) => titoli.find((t) => t.tmdb_id === id)
  expect(di(496243)).toMatchObject({ status: 'watched', personal_rating: 4.5, is_favorite: true, watched_at: '2024-03-04', title: 'Parasite' })
  expect(di(975)).toMatchObject({ status: 'to_watch', title: 'Orizzonti di gloria' })
  // Il tuo voto al re leone resta il tuo.
  expect(di(8587)).toMatchObject({ personal_rating: 5, watched_at: '2010-01-01' })
  expect(db.tables.user_diary).toEqual([expect.objectContaining({ tmdb_id: 496243, watched_on: '2024-03-04', rating: 4.5 })])
  expect(db.tables.user_lists).toEqual([expect.objectContaining({ name: 'Folk horror', description: 'Il bosco' })])
  expect(db.tables.user_list_items).toEqual([expect.objectContaining({ tmdb_id: 310131 })])

  // Rifacendola non si duplica niente: in Ciak c'è già tutto.
  await sezione.getByRole('button', { name: 'Importa un’altra esportazione' }).click()
  await sezione.getByLabel('Esportazione di Letterboxd').setInputFiles({ name: 'letterboxd-spettatore.zip', mimeType: 'application/zip', buffer: Buffer.from(ZIP) })
  await expect(sezione.getByText(/Pronti da importare: 1 lista/)).toBeVisible()
  await sezione.getByRole('button', { name: '📥 Importa in Ciak' }).click()
  await expect(sezione.getByText(/✓ Importato da Letterboxd/)).toBeVisible()
  expect(db.tables.user_diary).toHaveLength(1)
  expect(db.tables.user_lists).toHaveLength(1)
  expect(db.tables.user_list_items).toHaveLength(1)
})
