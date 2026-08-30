import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn, E2E_USER } from './support/mocks'

// Le liste personali si creavano e si riempivano, ma poi ci si scontrava con
// ciò che NON si poteva fare: correggere un nome sbagliato (solo cancellando e
// rifacendo, perdendo i titoli), scrivere la descrizione (campo mostrato
// nell'elenco ma non scrivibile da nessuna parte), e sapere a colpo d'occhio
// cosa avessi già visto fra i titoli della lista.

const LISTA = {
  id: 'list-1',
  user_id: E2E_USER.id,
  name: 'Neo-noir',
  description: null,
  is_public: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function elemento(tmdbId: number, title: string) {
  return {
    id: `item-${tmdbId}`,
    user_id: E2E_USER.id,
    list_id: 'list-1',
    tmdb_id: tmdbId,
    media_type: 'movie',
    title,
    poster_path: '/p.jpg',
    added_at: '2026-02-01T00:00:00Z',
  }
}

function titoloVisto(tmdbId: number, title: string) {
  return {
    id: `t-${tmdbId}`,
    user_id: E2E_USER.id,
    tmdb_id: tmdbId,
    media_type: 'movie',
    title,
    poster_path: '/p.jpg',
    status: 'watched',
    is_favorite: false,
    personal_rating: null,
    notes: null,
    watched_at: '2026-03-01T00:00:00Z',
    genre_ids: [],
    rewatch: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
})

test('una lista si può rinominare senza perdere i titoli', async ({ page }) => {
  const db = await mockSupabase(page, {
    user_lists: [LISTA],
    user_list_items: [elemento(550, 'Fight Club'), elemento(551, 'Heat')],
  })

  await page.goto('/liste/list-1')
  await expect(page.getByRole('heading', { name: 'Neo-noir' })).toBeVisible()

  await page.getByRole('button', { name: /Rinomina/ }).click()
  await page.getByLabel('Nome').fill('Neo-noir anni 90')
  await page.getByRole('button', { name: 'Salva', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Neo-noir anni 90' })).toBeVisible()
  expect((db.tables.user_lists[0] as Record<string, unknown>).name).toBe('Neo-noir anni 90')
  // I titoli restano: era proprio il motivo per cui rinominare serviva.
  expect(db.tables.user_list_items).toHaveLength(2)
})

test('la descrizione si può finalmente scrivere', async ({ page }) => {
  const db = await mockSupabase(page, { user_lists: [LISTA], user_list_items: [] })

  await page.goto('/liste/list-1')
  await page.getByRole('button', { name: /Rinomina/ }).click()
  await page.getByLabel(/Descrizione/).fill('Quelli con la pioggia e le insegne al neon')
  await page.getByRole('button', { name: 'Salva', exact: true }).click()

  await expect(page.getByText('Quelli con la pioggia e le insegne al neon')).toBeVisible()
  expect((db.tables.user_lists[0] as Record<string, unknown>).description).toBe(
    'Quelli con la pioggia e le insegne al neon',
  )
})

test('svuotare la descrizione la rimuove invece di salvare una stringa vuota', async ({ page }) => {
  const db = await mockSupabase(page, {
    user_lists: [{ ...LISTA, description: 'Da togliere' }],
    user_list_items: [],
  })

  await page.goto('/liste/list-1')
  await page.getByRole('button', { name: /Rinomina/ }).click()
  await page.getByLabel(/Descrizione/).fill('')
  await page.getByRole('button', { name: 'Salva', exact: true }).click()

  await expect.poll(
    () => (db.tables.user_lists[0] as Record<string, unknown>).description,
  ).toBeNull()
})

test('non si può salvare una lista senza nome', async ({ page }) => {
  await mockSupabase(page, { user_lists: [LISTA], user_list_items: [] })

  await page.goto('/liste/list-1')
  await page.getByRole('button', { name: /Rinomina/ }).click()
  await page.getByLabel('Nome').fill('   ')

  await expect(page.getByRole('button', { name: 'Salva', exact: true })).toBeDisabled()
})

test('i titoli già visti mostrano il badge dentro la lista', async ({ page }) => {
  await mockSupabase(page, {
    user_lists: [LISTA],
    user_list_items: [elemento(550, 'Fight Club'), elemento(551, 'Heat')],
    user_titles: [titoloVisto(550, 'Fight Club')],
  })

  await page.goto('/liste/list-1')

  await expect(page.getByText('Fight Club')).toBeVisible()
  // Uno solo dei due è segnato come visto: il badge deve comparire una volta.
  await expect(page.getByText('✓ Visto')).toHaveCount(1)
})
