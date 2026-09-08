import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn, E2E_USER } from './support/mocks'

// Voti, diario e liste sono l'unica parte di Ciak che non si ricostruisce da
// TMDB. Vivono in un progetto Supabase gratuito, che viene sospeso per
// inattività: se non si può portarli via, un giorno non ci sono più.

function titolo(id: number, title: string) {
  return {
    id: `t-${id}`,
    user_id: E2E_USER.id,
    tmdb_id: id,
    media_type: 'movie',
    title,
    poster_path: '/p.jpg',
    status: 'watched',
    is_favorite: false,
    personal_rating: 5,
    created_at: '2025-01-01T00:00:00Z',
  }
}

// Legge il file davvero scaricato dal browser, non ciò che la pagina dichiara
// di aver scaricato: è il file che l'utente si ritrova, ed è quello che conta.
async function scarica(page: import('@playwright/test').Page) {
  const attesa = page.waitForEvent('download')
  await page.getByRole('button', { name: /Scarica tutto/ }).click()
  const download = await attesa
  const percorso = await download.path()
  const fs = await import('node:fs/promises')
  return {
    nome: download.suggestedFilename(),
    dati: JSON.parse(await fs.readFile(percorso, 'utf8')),
  }
}

test('il backup contiene davvero i tuoi dati', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  await mockSupabase(page, {
    schema_version: [{ id: 'sv-1', version: 16, applied_at: '2026-01-01T00:00:00Z' }],
    user_titles: [titolo(550, 'Fight Club'), titolo(680, 'Pulp Fiction')],
    user_diary: [
      {
        id: 'd-1',
        user_id: E2E_USER.id,
        tmdb_id: 550,
        media_type: 'movie',
        title: 'Fight Club',
        watched_on: '2026-02-01',
        rating: 5,
        created_at: '2026-02-01T00:00:00Z',
      },
    ],
  })

  await page.goto('/settings')
  const { nome, dati } = await scarica(page)

  expect(nome).toMatch(/^ciak-backup-\d{4}-\d{2}-\d{2}\.json$/)
  expect(dati.formato).toBe('ciak-export')
  expect(dati.utente.id).toBe(E2E_USER.id)
  expect(dati.schema).toBe(16)
  // I titoli ci sono, con dentro il voto: un backup senza i voti non è un backup.
  expect(dati.tabelle.user_titles).toHaveLength(2)
  expect(dati.tabelle.user_titles.map((t: { title: string }) => t.title)).toContain('Pulp Fiction')
  expect(dati.tabelle.user_titles[0].personal_rating).toBe(5)
  expect(dati.tabelle.user_diary).toHaveLength(1)
  expect(dati.righeTotali).toBe(3)
  expect(dati.problemi).toEqual([])

  await expect(page.getByText(/3 righe da/)).toBeVisible()
})

test('una tabella illeggibile è dichiarata, non nascosta', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  await mockSupabase(page, { user_titles: [titolo(550, 'Fight Club')] })
  // Schema più vecchio del codice: la tabella dei trailer non esiste ancora.
  await page.route('**/rest/v1/user_trailers*', (route) =>
    route.fulfill({
      status: 404,
      json: { code: '42P01', message: 'relation "public.user_trailers" does not exist' },
    }),
  )

  await page.goto('/settings')
  const { dati } = await scarica(page)

  // Il resto si salva comunque — nove tabelle su dieci battono zero…
  expect(dati.tabelle.user_titles).toHaveLength(1)
  // …ma il buco è scritto DENTRO il file, non solo in un messaggio a schermo
  // che si perde: chi rileggerà questo backup deve sapere cosa non c'è.
  expect(dati.problemi.map((p: { tabella: string }) => p.tabella)).toContain('user_trailers')
  await expect(page.getByText(/Non lette: user_trailers/)).toBeVisible()
})

test('senza accesso non si offre un backup vuoto', async ({ page }) => {
  await mockTmdb(page)
  await mockSupabase(page)

  await page.goto('/settings')
  await expect(page.getByText('Accedi per scaricare una copia del tuo archivio.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Scarica tutto/ })).toHaveCount(0)
})

// ── I generi mancanti ─────────────────────────────────────────────────────
// Il recupero c'era già ma girava di nascosto, una volta sola per browser: se a
// metà strada TMDB non rispondeva nessuno lo sapeva, e non si riprovava più.

test('dalle Impostazioni si completano i generi mancanti', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  const db = await mockSupabase(page, {
    user_titles: [
      { ...titolo(550, 'Fight Club'), genre_ids: [] },
      { ...titolo(680, 'Pulp Fiction'), genre_ids: [18] },
    ],
  })

  await page.goto('/settings')
  await page.getByRole('button', { name: /Completa i generi mancanti/ }).click()

  // Solo il titolo che ne era privo viene toccato: l'altro aveva già i suoi.
  await expect(page.getByText(/Completati 1 titoli su 1/)).toBeVisible()
  await expect
    .poll(() => (db.tables.user_titles.find((t) => t.tmdb_id === 550) as { genre_ids: number[] }).genre_ids.length)
    .toBeGreaterThan(0)
  expect((db.tables.user_titles.find((t) => t.tmdb_id === 680) as { genre_ids: number[] }).genre_ids).toEqual([18])
})

test('quando non manca niente lo dice, invece di fingere di aver lavorato', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  await mockSupabase(page, { user_titles: [{ ...titolo(550, 'Fight Club'), genre_ids: [27] }] })

  await page.goto('/settings')
  await page.getByRole('button', { name: /Completa i generi mancanti/ }).click()

  await expect(page.getByText(/Tutti i titoli hanno già i loro generi/)).toBeVisible()
})
