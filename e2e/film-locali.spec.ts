import { test, expect, type Page } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn } from './support/mocks'

// La videoteca senza Google Drive: un film scelto dal disco del PC (o dalla
// memoria del tablet) parte nel lettore di Ciak, coi suoi sottotitoli, e si
// può copiare in Ciak per vederlo anche senza il file a portata.

const SRT = '1\n00:00:01,000 --> 00:00:03,000\nC’era una volta\n'
// Pochi byte, non un film vero: al browser basta averne l'indirizzo.
const FILM = { name: 'Song.of.the.Sea.2014.1080p.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(64, 1) }
const SOTTOTITOLI = { name: 'Song.of.the.Sea.2014.1080p.it.srt', mimeType: 'application/x-subrip', buffer: Buffer.from(SRT) }

// Drive spento nelle Impostazioni (dopo `signIn`, che lo accende per gli altri test).
async function senzaDrive(page: Page) {
  await page.addInitScript(() => localStorage.removeItem('ciak:drive'))
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
})

test('senza Drive un film si apre dal disco, coi sottotitoli, e si salva in Ciak', async ({ page }) => {
  await senzaDrive(page)
  const db = await mockSupabase(page, { user_streaming: [] })
  // Nessuna richiesta a Google: Drive è spento.
  const google: string[] = []
  await page.route('https://www.googleapis.com/**', (route) => {
    google.push(route.request().url())
    return route.abort()
  })

  await page.goto('/streaming')
  await expect(page.getByRole('button', { name: '📁 Collega Google Drive' })).toHaveCount(0)
  await page.getByLabel('Scegli il film (ed eventualmente i sottotitoli)').setInputFiles([FILM, SOTTOTITOLI])

  await expect(page).toHaveURL(/\/streaming\/loc-[0-9a-f]{16}$/)
  const id = new URL(page.url()).pathname.split('/').pop()!
  // Il file letto dal disco, senza caricarlo da nessuna parte.
  await expect(page.locator('video')).toHaveAttribute('src', /^blob:/)
  await expect(page.getByText(/Italiano · dal file scelto/)).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Mostra' }).locator('option')).toHaveText(['Nessun sottotitolo', 'Italiano'])
  // Le parti solo di Drive non ci sono.
  await expect(page.getByRole('button', { name: /Usa il lettore di Drive/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Scarica per l'offline/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Cancella da Drive/ })).toHaveCount(0)
  // L'archivio funziona come per Drive: il file si lega al suo id «loc-».
  await expect.poll(() => db.writes.some((w) => w.table === 'user_streaming' && JSON.stringify(w.body).includes(id))).toBe(true)

  // Copiato in Ciak: il film e i suoi sottotitoli, nella cache del lettore.
  await page.getByRole('button', { name: '💾 Salva in Ciak (per vederlo offline)' }).click()
  await expect(page.getByText(/Salvato in Ciak/)).toBeVisible()
  const scheda = await page.evaluate(async (id) => {
    const cache = await caches.open('ciak-film-v1')
    const info = await (await cache.match(`/film-offline/${id}/info.json`))?.json()
    const film = await cache.match(`/film-offline/${id}`)
    return { info, byte: (await film?.arrayBuffer())?.byteLength }
  }, id)
  expect(scheda.byte).toBe(64)
  expect(scheda.info).toMatchObject({
    id,
    file: FILM.name,
    stato: 'completo',
    sottotitoli: [expect.objectContaining({ lingua: 'it', vtt: expect.stringContaining('WEBVTT') })],
  })

  // Riaprendo Ciak il file del disco non c'è più, la copia sì: parte da lì.
  await page.reload()
  await expect(page.locator('video')).toHaveAttribute('src', `/drive-video/${id}`)
  await expect(page.getByRole('combobox', { name: 'Mostra' }).locator('option')).toHaveText(['Nessun sottotitolo', 'Italiano'])

  // Eliminata la copia, Ciak chiede di sceglierlo di nuovo.
  await page.getByRole('button', { name: 'Elimina dal dispositivo' }).click()
  await expect(page.getByText(/sceglilo di nuovo per guardarlo/)).toBeVisible()
  await page.getByLabel('Scegli il film (ed eventualmente i sottotitoli)').setInputFiles([FILM])
  await expect(page.locator('video')).toHaveAttribute('src', /^blob:/)
  await expect(page.getByText(/sceglilo di nuovo per guardarlo/)).toHaveCount(0)

  // E nella videoteca la copia non c'è più.
  await page.getByRole('link', { name: /Torna ai film/ }).click()
  await expect(page.getByRole('heading', { name: /Sul dispositivo/ })).toHaveCount(0)
  expect(google).toEqual([])
})

test('un MKV che il browser non legge: lo si dice, con il rimedio', async ({ page }) => {
  await senzaDrive(page)
  await mockSupabase(page, { user_streaming: [] })
  await page.goto('/streaming')
  await page
    .getByLabel('Scegli il film (ed eventualmente i sottotitoli)')
    .setInputFiles([{ name: 'The.Secret.of.Kells.2009.mkv', mimeType: 'video/x-matroska', buffer: Buffer.alloc(64, 7) }])
  await expect(page).toHaveURL(/\/streaming\/loc-/)
  await expect(page.getByText(/Convertilo in MP4 con prepara-ciak/)).toBeVisible()
})

test('scegliendo solo i sottotitoli, si chiede il video', async ({ page }) => {
  await senzaDrive(page)
  await mockSupabase(page, { user_streaming: [] })
  await page.goto('/streaming')
  await page.getByLabel('Scegli il film (ed eventualmente i sottotitoli)').setInputFiles([SOTTOTITOLI])
  await expect(page.getByRole('alert')).toHaveText('Scegli un file video (MP4, MKV, WebM…).')
  await expect(page).toHaveURL(/\/streaming$/)
})

test('Drive si spegne e si riaccende dalle Impostazioni', async ({ page }) => {
  await mockSupabase(page)
  await page.goto('/settings')
  const drive = page.getByRole('checkbox', { name: /Usa Google Drive per lo streaming/ })
  await expect(drive).toBeChecked()

  await drive.uncheck()
  expect(await page.evaluate(() => localStorage.getItem('ciak:drive'))).toBeNull()
  // Senza ricaricare (che rimetterebbe il segno di `signIn`): la videoteca
  // non propone più Drive, ma il film dal dispositivo sì.
  await page.getByRole('link', { name: '🎬 Streaming' }).first().click()
  await expect(page.getByRole('button', { name: '🎬 Apri un film dal dispositivo' })).toBeVisible()
  await expect(page.getByRole('button', { name: '📁 Collega Google Drive' })).toHaveCount(0)

  await page.goBack()
  await page.getByRole('checkbox', { name: /Usa Google Drive per lo streaming/ }).check()
  expect(await page.evaluate(() => localStorage.getItem('ciak:drive'))).toBe('acceso')
})
