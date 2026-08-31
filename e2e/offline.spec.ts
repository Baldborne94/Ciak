import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, mockAiApi, signIn, E2E_USER } from './support/mocks'
import { movie } from './support/fixtures'

// La collezione è l'unica cosa di Ciak che non cambia da sola: i film visti
// restano visti anche in metropolitana. Finora però l'app offline si apriva e
// restava vuota — arrivava il guscio dal service worker, i dati no.
//
// Nota su come si prova qui: si stacca la rete con l'app GIÀ APERTA, che è il
// caso vero — in metropolitana non si ricarica, si continua a usare ciò che si
// ha davanti. Un `reload` offline richiederebbe il service worker, registrato
// solo in produzione.
//
// Le chiamate a Supabase sono servite dai mock, quindi restano raggiungibili
// anche a rete "staccata": ciò che rende offline questo test è
// `navigator.onLine`, ed è esattamente il segnale su cui il codice decide.

const BANDA = /Senza connessione/

function visto(tmdbId: number, title: string) {
  return {
    id: `t-${tmdbId}`,
    user_id: E2E_USER.id,
    tmdb_id: tmdbId,
    media_type: 'movie',
    title,
    poster_path: '/p.jpg',
    status: 'watched',
    is_favorite: false,
    personal_rating: 4,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

const card = (page: import('@playwright/test').Page) =>
  page.locator('.group', { hasText: 'Pearl' }).first()

// Prima visita con la rete, che lascia la copia. Torna solo quando la
// collezione è stata letta davvero.
async function primaVisitaConRete(page: import('@playwright/test').Page) {
  await page.goto('/genre/movie/27')
  await expect(card(page).getByText('✓ Visto')).toBeVisible()
  await expect(page.getByText(BANDA)).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockAiApi(page)
})

test('senza rete la collezione resta leggibile, e l app lo dichiara', async ({ page, context }) => {
  await mockTmdb(page, { discover: () => [movie(101, 'Pearl')] })
  await mockSupabase(page, { user_titles: [visto(101, 'Pearl')] })
  await primaVisitaConRete(page)

  await context.setOffline(true)

  // L'app dichiara che sta mostrando una copia, invece di far credere che sia
  // il dato di adesso: un archivio che mostra dati vecchi senza dirlo non è
  // affidabile.
  const banda = page.getByRole('status').filter({ hasText: BANDA })
  await expect(banda).toBeVisible()
  await expect(banda).toContainText('oggi')
  await expect(banda).toContainText('non verranno salvate')
})

test('la copia arriva subito, senza aspettare che una richiesta scada', async ({
  page,
  context,
}) => {
  // Il motivo per cui `navigator.onLine === false` viene controllato PRIMA di
  // tentare la rete: aspettare il timeout significa fissare una pagina vuota
  // per secondi, proprio quando l'attesa dà più fastidio.
  await mockTmdb(page, { discover: () => [movie(101, 'Pearl')] })
  await mockSupabase(page, { user_titles: [visto(101, 'Pearl')] })
  await primaVisitaConRete(page)

  const partenza = Date.now()
  await context.setOffline(true)
  await expect(page.getByRole('status').filter({ hasText: BANDA })).toBeVisible({ timeout: 3000 })
  expect(Date.now() - partenza).toBeLessThan(3000)
})

test('senza copia salvata non si inventa niente', async ({ page, context }) => {
  // Nessuna copia da servire: dichiarare «ecco la tua collezione» sarebbe una
  // bugia, quindi la banda non deve comparire.
  await mockTmdb(page, { discover: () => [movie(101, 'Pearl')] })
  await mockSupabase(page, { user_titles: [visto(101, 'Pearl')] })
  await primaVisitaConRete(page)

  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('ciak:offline:')) localStorage.removeItem(k)
    }
  })

  await context.setOffline(true)

  // Un attimo perché l'evento `offline` venga raccolto e la collezione riletta.
  await page.waitForTimeout(1000)
  await expect(page.getByText(BANDA)).toHaveCount(0)
})

test('quando la rete torna, la banda sparisce', async ({ page, context }) => {
  await mockTmdb(page, { discover: () => [movie(101, 'Pearl')] })
  await mockSupabase(page, { user_titles: [visto(101, 'Pearl')] })
  await primaVisitaConRete(page)

  await context.setOffline(true)
  await expect(page.getByText(BANDA)).toBeVisible()

  await context.setOffline(false)

  await expect(page.getByText(BANDA)).toHaveCount(0)
})

test('la copia porta l id dell utente, così due account non si mescolano', async ({ page }) => {
  await mockTmdb(page, { discover: () => [movie(101, 'Pearl')] })
  await mockSupabase(page, { user_titles: [visto(101, 'Pearl')] })
  await primaVisitaConRete(page)

  const chiavi = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith('ciak:offline:')),
  )
  expect(chiavi).toHaveLength(1)
  expect(chiavi[0]).toContain(E2E_USER.id)
})
