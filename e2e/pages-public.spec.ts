import { test, expect, type Page } from '@playwright/test'
import { mockTmdb, mockSupabase, mockAiApi } from './support/mocks'
import { movie, movieDetail, personDetail, tv } from './support/fixtures'

// Ogni schermata raggiungibile SENZA login. Per ciascuna verifichiamo che
// renda il proprio contenuto e che non finisca in stato d'errore: è la rete di
// sicurezza che intercetta una pagina rotta da una modifica altrove.

// Il messaggio dell'ErrorBoundary/ErrorState: se compare, la pagina è rotta.
async function expectNoCrash(page: Page) {
  await expect(page.getByText('Qualcosa è andato storto')).toHaveCount(0)
  await expect(page.getByText(/non disponibile/i)).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await mockSupabase(page)
  await mockAiApi(page)
})

test('Sala (home) — sezioni principali', async ({ page }) => {
  await mockTmdb(page, { trending: [movie(550, 'Fight Club'), tv(1399, 'Il Trono di Spade')] })
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Bentornato al cinema' })).toBeVisible()
  await expectNoCrash(page)
})

test('Cerca — le quattro schede cambiano il campo di ricerca', async ({ page }) => {
  await mockTmdb(page)
  await page.goto('/search')

  await expect(page.getByRole('heading', { name: 'Cerca & Esplora' })).toBeVisible()
  await expect(page.getByPlaceholder(/Cerca un film/)).toBeVisible()

  await page.getByRole('button', { name: '🌟 Persone' }).click()
  await expect(page.getByPlaceholder(/Cerca attore/)).toBeVisible()

  await page.getByRole('button', { name: '🏛️ Studi' }).click()
  await expect(page.getByPlaceholder(/Cerca uno studio/)).toBeVisible()

  await page.getByRole('button', { name: '📚 Saghe' }).click()
  await expect(page.getByPlaceholder(/Cerca una saga/)).toBeVisible()
  await expectNoCrash(page)
})

test('Genere — elenca i titoli del genere scelto', async ({ page }) => {
  await mockTmdb(page)
  await page.goto('/genre/movie/27')

  await expect(page.getByRole('heading', { name: 'Horror' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Cartone \d+/ }).first()).toBeVisible()
  await expectNoCrash(page)
})

test('Scheda titolo — trama, cast e regia', async ({ page }) => {
  await mockTmdb(page, {
    detail: movieDetail(550, 'Fight Club', { tagline: 'La prima regola' }),
  })
  await page.goto('/title/movie/550')

  await expect(page.getByRole('heading', { name: 'Fight Club' }).first()).toBeVisible()
  await expect(page.getByText('Trama di Fight Club.')).toBeVisible()
  await expect(page.getByText('Attrice Uno')).toBeVisible()
  await expect(page.getByText('Regista Uno').first()).toBeVisible()
  await expectNoCrash(page)
})

test('Persona — biografia e filmografia filtrabile', async ({ page }) => {
  // La filmografia arriva da `combined_credits` allegato alla scheda persona
  // (append_to_response), non dall'endpoint separato — quello serve solo a
  // recuperare i titoli in inglese quando l'italiano manca.
  await mockTmdb(page, {
    person: personDetail(101, 'Dario Argento', {
      combined_credits: {
        cast: [],
        crew: [{ ...movie(700, 'Suspiria'), job: 'Director', department: 'Directing' }],
      },
    }),
  })
  await page.goto('/person/101')

  await expect(page.getByRole('heading', { name: 'Dario Argento' })).toBeVisible()
  await expect(page.getByText(/Biografia di Dario Argento/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Suspiria/ })).toBeVisible()
  await expectNoCrash(page)
})

test('Studio — titoli prodotti', async ({ page }) => {
  await mockTmdb(page, { company: { id: 3, name: 'Pixar', logo_path: null } })
  await page.goto('/studio/3')

  await expect(page.getByRole('heading', { name: 'Pixar' })).toBeVisible()
  await expectNoCrash(page)
})

test('Saga — capitoli della collezione', async ({ page }) => {
  await mockTmdb(page)
  await page.goto('/collection/1241')

  await expect(page.getByRole('heading', { name: 'Saga 1241' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Capitolo Uno/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Capitolo Due/ })).toBeVisible()
  await expectNoCrash(page)
})

test('Guida — slide navigabili', async ({ page }) => {
  await mockTmdb(page)
  await page.goto('/guida')

  await expect(page.getByText('🚀 Per cominciare')).toBeVisible()
  await expectNoCrash(page)
})

test('Login — si passa da accedi a registrati', async ({ page }) => {
  await mockTmdb(page)
  await page.goto('/login')

  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
  await expectNoCrash(page)
})

test('Impostazioni — accessibile e senza errori', async ({ page }) => {
  await mockTmdb(page)
  await page.goto('/settings')

  await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible()
  await expectNoCrash(page)
})

test('Watchlist condivisa — mostra i titoli di un altro utente', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(
    page,
    {},
    {
      get_public_watchlist: [
        { tmdb_id: 550, media_type: 'movie', title: 'Fight Club', poster_path: '/p.jpg' },
      ],
    },
  )
  await page.goto('/watchlist/un-altro-utente')

  await expect(page.getByText('Fight Club')).toBeVisible()
  await expectNoCrash(page)
})

test('Lista condivisa — pagina pubblica di una lista', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page, {
    user_lists: [
      {
        id: 'lista-1',
        user_id: 'altro',
        name: 'Neo-noir',
        description: 'I miei preferiti',
        is_public: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ],
    user_list_items: [
      {
        id: 'item-1',
        list_id: 'lista-1',
        user_id: 'altro',
        tmdb_id: 550,
        media_type: 'movie',
        title: 'Fight Club',
        poster_path: '/p.jpg',
        added_at: '2025-01-01T00:00:00Z',
      },
    ],
  })
  await page.goto('/lista/lista-1')

  await expect(page.getByRole('heading', { name: 'Neo-noir' })).toBeVisible()
  await expect(page.getByText('Fight Club')).toBeVisible()
  await expectNoCrash(page)
})
