import { test, expect, type Page } from '@playwright/test'
import { mockTmdb, mockSupabase, mockAiApi, signIn, E2E_USER } from './support/mocks'

// Ogni schermata che richiede il login. Come per quelle pubbliche, verifichiamo
// che si aprano davvero (non che rimandino al login) e che mostrino i dati
// dell'utente finto invece di uno stato d'errore.

async function expectNoCrash(page: Page) {
  await expect(page.getByText('Qualcosa è andato storto')).toHaveCount(0)
  await expect(page.getByText(/non disponibile/i)).toHaveCount(0)
}

// Riga di user_titles con i campi che le pagine si aspettano.
function userTitle(over: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    user_id: E2E_USER.id,
    tmdb_id: 550,
    media_type: 'movie',
    title: 'Fight Club',
    poster_path: '/p.jpg',
    status: 'watched',
    is_favorite: true,
    personal_rating: 4.5,
    notes: null,
    watched_at: '2025-03-01T00:00:00Z',
    genre_ids: [18],
    rewatch: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...over,
  }
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockAiApi(page)
})

test('Preferiti — mostra i titoli amati con il voto', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page, { user_titles: [userTitle()] })
  await page.goto('/favorites')

  await expect(page.getByRole('heading', { name: 'Preferiti' })).toBeVisible()
  await expect(page.getByText('Fight Club')).toBeVisible()
  await expectNoCrash(page)
})

test('Visti & Diario — elenca le visioni registrate', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page, {
    user_diary: [
      {
        id: 'd1',
        user_id: E2E_USER.id,
        tmdb_id: 550,
        media_type: 'movie',
        title: 'Fight Club',
        poster_path: '/p.jpg',
        watched_on: '2025-03-01',
        rating: 4.5,
        note: 'Bellissimo',
        created_at: '2025-03-01T00:00:00Z',
      },
    ],
    user_titles: [userTitle()],
  })
  await page.goto('/diario')

  await expect(page.getByRole('heading', { name: 'Visti & Diario' })).toBeVisible()
  await expect(page.getByText('Fight Club').first()).toBeVisible()
  await expectNoCrash(page)
})

test('Statistiche — riassume la collezione', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page, { user_titles: [userTitle()] })
  await page.goto('/statistiche')

  await expect(page.getByRole('heading', { name: 'Statistiche' })).toBeVisible()
  await expectNoCrash(page)
})

test('Profilo di gusto — costruito dai titoli visti', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page, { user_titles: [userTitle()] })
  await page.goto('/profilo')

  await expect(page.getByRole('heading', { name: 'Profilo di gusto' })).toBeVisible()
  await expectNoCrash(page)
})

test('Liste personali — pagina delle raccolte', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page, {
    user_lists: [
      {
        id: 'lista-1',
        user_id: E2E_USER.id,
        name: 'Neo-noir',
        description: 'I miei preferiti',
        is_public: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ],
  })
  await page.goto('/liste')

  await expect(page.getByRole('heading', { name: 'Liste personali' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Neo-noir/ })).toBeVisible()
  await expectNoCrash(page)
})

test('Lista personale — apre una raccolta con i suoi titoli', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page, {
    user_lists: [
      {
        id: 'lista-1',
        user_id: E2E_USER.id,
        name: 'Neo-noir',
        description: null,
        is_public: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ],
    user_list_items: [
      {
        id: 'item-1',
        list_id: 'lista-1',
        user_id: E2E_USER.id,
        tmdb_id: 550,
        media_type: 'movie',
        title: 'Fight Club',
        poster_path: '/p.jpg',
        added_at: '2025-01-01T00:00:00Z',
      },
    ],
  })
  await page.goto('/liste/lista-1')

  await expect(page.getByRole('heading', { name: 'Neo-noir' })).toBeVisible()
  await expect(page.getByText('Fight Club')).toBeVisible()
  await expectNoCrash(page)
})

test('In arrivo — proposte di uscite future', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page, { user_titles: [userTitle()] })
  await page.goto('/in-arrivo')

  await expect(page.getByRole('heading', { name: 'In arrivo per te' })).toBeVisible()
  await expectNoCrash(page)
})

test('Trofei — griglia dei badge', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page, { user_titles: [userTitle()] })
  await page.goto('/trophies')

  await expect(page.getByRole('heading', { name: 'Trofei & Badge' })).toBeVisible()
  await expectNoCrash(page)
})

test('Strumenti AI — le tre schede dell’assistente', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page, { user_titles: [userTitle()] })
  await page.goto('/ai')

  await expect(page.getByRole('heading', { name: 'Il tuo assistente cinefilo' })).toBeVisible()
  await expectNoCrash(page)
})

test('In corso e Abbandonati — le altre due liste di stato', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page, {
    user_titles: [userTitle({ status: 'in_progress', media_type: 'tv', title: 'Serie In Corso' })],
  })

  await page.goto('/lists/in-progress')
  // Il titolo della pagina è l'h1; "In corso" appare anche sul badge della card.
  await expect(page.getByRole('heading', { name: 'In corso', level: 1 })).toBeVisible()
  await expect(page.getByText('Serie In Corso')).toBeVisible()

  await page.goto('/lists/abandoned')
  await expect(page.getByRole('heading', { name: 'Abbandonato' })).toBeVisible()
  await expectNoCrash(page)
})

test('la watchlist si filtra per tipo e si riordina', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page, {
    user_titles: [
      userTitle({ id: 'a', tmdb_id: 1, title: 'Un Film', media_type: 'movie', status: 'to_watch' }),
      userTitle({ id: 'b', tmdb_id: 2, title: 'Una Serie', media_type: 'tv', status: 'to_watch' }),
    ],
  })
  await page.goto('/lists/watchlist')

  await expect(page.getByText('Un Film')).toBeVisible()
  await expect(page.getByText('Una Serie')).toBeVisible()

  // Filtrando per "Film" la serie sparisce.
  await page.getByRole('button', { name: 'Film', exact: true }).click()
  await expect(page.getByText('Un Film')).toBeVisible()
  await expect(page.getByText('Una Serie')).toHaveCount(0)

  // E tornando su "Tutti" ricompare.
  await page.getByRole('button', { name: 'Tutti', exact: true }).click()
  await expect(page.getByText('Una Serie')).toBeVisible()
  await expectNoCrash(page)
})
