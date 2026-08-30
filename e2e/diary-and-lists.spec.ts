import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, mockAiApi, signIn, E2E_USER } from './support/mocks'
import { movieDetail } from './support/fixtures'

// Diario (registrare una visione, votarla, modificarla, cancellarla) e liste
// personali (crearle, riempirle, svuotarle). Sono i due flussi di scrittura più
// usati dopo i pulsanti di stato.

function diaryEntry(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    user_id: E2E_USER.id,
    tmdb_id: 550,
    media_type: 'movie',
    title: 'Fight Club',
    poster_path: '/p.jpg',
    watched_on: '2025-03-01',
    rating: 4,
    note: 'Bellissimo',
    created_at: '2025-03-01T00:00:00Z',
    ...over,
  }
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockAiApi(page)
})

test('registrare una visione nel diario dalla scheda del titolo', async ({ page }) => {
  await mockTmdb(page, { detail: movieDetail(550, 'Fight Club') })
  const db = await mockSupabase(page)
  await page.goto('/title/movie/550')

  await page.getByRole('button', { name: /Segna nel diario/ }).click()

  // Il modulo si apre con la data di oggi già compilata.
  const date = page.locator('input[type="date"]')
  await expect(date).toBeVisible()
  await expect(date).not.toHaveValue('')

  await page.getByPlaceholder(/Cosa ti ha lasciato/).fill('Prima visione')
  await page.getByRole('button', { name: /Salva nel diario/ }).click()

  await expect(page.getByText(/Salvato nel diario/)).toBeVisible()
  expect(db.tables.user_diary?.[0]).toMatchObject({
    tmdb_id: 550,
    media_type: 'movie',
    note: 'Prima visione',
  })
})

test('il voto dato nel diario si propaga al titolo in collezione', async ({ page }) => {
  // Regola dell'app: il voto di una visione vale anche come voto del titolo,
  // altrimenti il profilo di gusto (che legge user_titles) non lo vedrebbe.
  await mockTmdb(page, { detail: movieDetail(550, 'Fight Club') })
  const db = await mockSupabase(page)
  await page.goto('/title/movie/550')

  await page.getByRole('button', { name: /Segna nel diario/ }).click()
  await page.getByRole('button', { name: '4 stelle', exact: true }).click()
  await page.getByRole('button', { name: /Salva nel diario/ }).click()
  await expect(page.getByText(/Salvato nel diario/)).toBeVisible()

  expect(db.tables.user_diary?.[0]).toMatchObject({ rating: 4 })
  expect(db.tables.user_titles?.[0]).toMatchObject({ personal_rating: 4 })
})

test('nel diario si cambia il voto di una visione già registrata', async ({ page }) => {
  await mockTmdb(page)
  const db = await mockSupabase(page, { user_diary: [diaryEntry({ rating: 3 })] })
  await page.goto('/diario')

  await expect(page.getByText('Fight Club').first()).toBeVisible()
  // Le stelle sono interattive direttamente nella riga del diario.
  await page.getByRole('button', { name: '5 stelle', exact: true }).first().click()

  await expect
    .poll(() => (db.tables.user_diary[0] as Record<string, unknown>).rating)
    .toBe(5)
})

test('una visione si elimina dal diario', async ({ page }) => {
  await mockTmdb(page)
  const db = await mockSupabase(page, { user_diary: [diaryEntry()] })
  page.on('dialog', (d) => d.accept()) // la conferma di cancellazione
  await page.goto('/diario')

  await expect(page.getByText('Fight Club').first()).toBeVisible()
  await page.getByRole('button', { name: 'Rimuovi dal diario' }).first().click()

  // La visione sparisce dal registro…
  await expect.poll(() => db.tables.user_diary.length).toBe(0)
  await expect(page.getByRole('button', { name: 'Rimuovi dal diario' })).toHaveCount(0)

  // …ma il titolo resta in collezione come "visto": eliminare UNA visione non
  // significa non averlo mai visto, e infatti deleteDiaryEntry non ha mai
  // cancellato la scheda — riallinea solo il voto. Questa pagina mostra
  // entrambi i lati, quindi il titolo continua a comparire.
  expect(db.tables.user_titles).toHaveLength(1)
  expect((db.tables.user_titles[0] as Record<string, unknown>).status).toBe('watched')
  await expect(page.getByText('Fight Club').first()).toBeVisible()
})

test('creare una lista personale, riempirla e svuotarla', async ({ page }) => {
  test.slow() // tre schermate diverse in un solo percorso
  await mockTmdb(page, { detail: movieDetail(550, 'Fight Club') })
  const db = await mockSupabase(page)

  // 1. Creo la lista.
  await page.goto('/liste')
  await page.getByPlaceholder(/Nome della nuova lista/).fill('Neo-noir')
  await page.getByRole('button', { name: '➕ Crea' }).click()

  await expect(page.getByRole('link', { name: /Neo-noir/ })).toBeVisible()
  expect(db.tables.user_lists?.[0]).toMatchObject({ name: 'Neo-noir' })

  // 2. Ci aggiungo un titolo dalla sua scheda.
  await page.goto('/title/movie/550')
  await page.getByRole('button', { name: /Aggiungi a lista/ }).click()
  // Nel modale ogni lista è una casella di spunta etichettata col suo nome.
  await page.getByRole('checkbox', { name: 'Neo-noir' }).check()

  await expect.poll(() => db.tables.user_list_items?.length ?? 0).toBe(1)
  expect(db.tables.user_list_items[0]).toMatchObject({ tmdb_id: 550, title: 'Fight Club' })

  // 3. Lo ritrovo nella lista e lo rimuovo.
  const listId = (db.tables.user_lists[0] as { id: string }).id
  await page.goto(`/liste/${listId}`)
  await expect(page.getByText('Fight Club')).toBeVisible()

  page.on('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Rimuovi dalla lista' }).first().click()
  await expect.poll(() => db.tables.user_list_items.length).toBe(0)
})

test('una lista personale si può rendere pubblica', async ({ page }) => {
  await mockTmdb(page)
  const db = await mockSupabase(page, {
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
  })
  await page.goto('/liste/lista-1')

  await page.getByRole('button', { name: /Condividi|🔒/ }).first().click()

  await expect
    .poll(() => (db.tables.user_lists[0] as Record<string, unknown>).is_public)
    .toBe(true)
})

test('la watchlist si può condividere con un link pubblico', async ({ page }) => {
  await mockTmdb(page)
  const db = await mockSupabase(page, {
    user_titles: [
      {
        id: 'row-1',
        user_id: E2E_USER.id,
        tmdb_id: 550,
        media_type: 'movie',
        title: 'Fight Club',
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
      },
    ],
  })
  await page.goto('/lists/watchlist')

  await page.getByRole('button', { name: /Condividi/ }).click()

  await expect(page.getByText(/Watchlist condivisibile/)).toBeVisible()
  await expect
    .poll(() => (db.tables.user_profile?.[0] as Record<string, unknown>)?.watchlist_public)
    .toBe(true)
})
