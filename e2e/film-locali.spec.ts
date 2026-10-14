import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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

// ── La cartella del PC collegata (E:\Ciak) ──────────────────────────────────
// Una cartella vera del browser (l'Origin Private File System) al posto di
// quella scelta dal disco: le stesse «maniglie» di File System Access, che si
// salvano in IndexedDB e si rileggono dopo il ricaricamento.
async function cartellaFinta(page: Page, file: [string, string][]) {
  await page.addInitScript((file) => {
    ;(window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => {
      const ciak = await (await navigator.storage.getDirectory()).getDirectoryHandle('Ciak', { create: true })
      for (const [percorso, contenuto] of file) {
        const parti = percorso.split('/')
        let dir = ciak
        for (const p of parti.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true })
        const scrivi = await (await dir.getFileHandle(parti[parti.length - 1], { create: true })).createWritable()
        await scrivi.write(contenuto)
        // Un video vero pesa: sotto i 5 MB la videoteca lo scarta come promo
        // della release. Qualche MB di zeri basta, e costa poco.
        if (percorso.endsWith('.mp4')) await scrivi.truncate(6_000_000 + contenuto.length)
        await scrivi.close()
      }
      return ciak
    }
  }, file)
}

const CARTELLA: [string, string][] = [
  ['SERIE TV/South Park/Season 03/01 Rainforest Shmainforest.mp4', 'a'.repeat(64)],
  ['SERIE TV/South Park/Season 03/01 Rainforest Shmainforest.it.srt', SRT],
  ['SERIE TV/South Park/Season 03/02 Spontaneous Combustion.mp4', 'b'.repeat(80)],
  ['FILM/Paprika (2006)/Paprika.2006.mp4', 'c'.repeat(96)],
  ['sposta-su-disco.bat', '@echo off'],
]

// Titoli non riconosciuti: i nomi restano quelli delle cartelle, stabili.
async function senzaRiconoscimento(page: Page) {
  await page.route('**/api/tmdb*', (route) =>
    new URL(route.request().url()).searchParams.get('path') === '/search/multi' ? route.fulfill({ json: { results: [] } }) : route.fallback(),
  )
}

test('collegata la cartella del PC, la serie compare per stagioni e l’episodio parte dal disco', async ({ page }) => {
  await senzaDrive(page)
  await senzaRiconoscimento(page)
  const db = await mockSupabase(page, { user_streaming: [] })
  await cartellaFinta(page, CARTELLA)

  await page.goto('/streaming')
  await page.getByRole('button', { name: '📂 Collega la cartella dei film' }).click()

  // Come su Drive: la serie con le sue stagioni, il film nella sua cartella.
  await expect(page.getByRole('button', { name: /Paprika \(2006\)/ })).toBeVisible()
  await page.getByRole('button', { name: /^South Park/ }).click()
  const stagione3 = page.getByRole('list', { name: 'Stagione 3' })
  await expect(stagione3.getByText('02 Spontaneous Combustion')).toBeVisible()
  await stagione3.getByText('01 Rainforest Shmainforest').click()

  await expect(page).toHaveURL(/\/streaming\/loc-[0-9a-f]{16}$/)
  const id = new URL(page.url()).pathname.split('/').pop()!
  await expect(page.locator('video')).toHaveAttribute('src', /^blob:/)
  // Il sottotitolo accanto al video, nella sua cartella.
  await expect(page.getByText(/Italiano · dalla cartella/)).toBeVisible()
  await expect.poll(() => db.writes.some((w) => w.table === 'user_streaming' && JSON.stringify(w.body).includes(id))).toBe(true)

  // Ricaricando, il lettore ritrova il file da solo: niente da scegliere.
  await page.reload()
  await expect(page.locator('video')).toHaveAttribute('src', /^blob:/)
  await expect(page.getByText(/sceglilo di nuovo/)).toHaveCount(0)

  // E la videoteca si rilegge da sola, senza ricollegare niente.
  await page.goto('/streaming')
  await expect(page.getByRole('button', { name: /Paprika \(2006\)/ })).toBeVisible()
  await page.getByRole('button', { name: 'Scollega la cartella' }).click()
  await expect(page.getByRole('button', { name: '📂 Collega la cartella dei film' })).toBeVisible()
})

test('riaperto il browser, il permesso della cartella si ridà con un clic', async ({ page }) => {
  await senzaDrive(page)
  await senzaRiconoscimento(page)
  await mockSupabase(page, { user_streaming: [] })
  await cartellaFinta(page, CARTELLA)
  // Come Chrome: il permesso c'è dopo la scelta, ma non dopo aver riaperto la pagina.
  await page.addInitScript(() => {
    let concesso = false
    const w = window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }
    const scegli = w.showDirectoryPicker
    w.showDirectoryPicker = async () => {
      concesso = true
      return scegli()
    }
    const h = FileSystemHandle.prototype as unknown as Record<string, unknown>
    h.queryPermission = async () => (concesso ? 'granted' : 'prompt')
    h.requestPermission = async () => {
      concesso = true
      return 'granted'
    }
  })

  await page.goto('/streaming')
  await page.getByRole('button', { name: '📂 Collega la cartella dei film' }).click()
  await expect(page.getByRole('button', { name: /Paprika \(2006\)/ })).toBeVisible()

  // Riaperta: l'elenco dell'ultima volta resta, col pulsante per ridare il permesso.
  await page.reload()
  await page.getByRole('button', { name: /Paprika \(2006\)/ }).click()
  await expect(page).toHaveURL(/\/streaming\/loc-/)
  await page.getByRole('button', { name: '📂 Riapri la cartella «Ciak»' }).click()
  await expect(page.locator('video')).toHaveAttribute('src', /^blob:/)
})

// Firefox, Brave, Opera…: niente maniglie (showDirectoryPicker). La cartella
// si sceglie col selettore normale, una volta per visita. Era il caso
// dell'utente: il pulsante della cartella non compariva proprio.
test('in un browser senza maniglie la cartella si sceglie col selettore, e si risceglie a ogni visita', async ({ page }) => {
  await senzaDrive(page)
  await senzaRiconoscimento(page)
  await mockSupabase(page, { user_streaming: [] })
  await page.addInitScript(() => Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true }))
  // Una cartella vera sul disco, come E:\Ciak.
  const ciak = join(mkdtempSync(join(tmpdir(), 'ciak-')), 'Ciak')
  for (const [percorso, contenuto] of CARTELLA) {
    const file = join(ciak, ...percorso.split('/'))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, contenuto)
    if (percorso.endsWith('.mp4')) truncateSync(file, 6_000_000 + contenuto.length)
  }
  const scegli = async (pulsante: string) => {
    const selettore = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: pulsante }).click()
    await (await selettore).setFiles(ciak)
  }

  await page.goto('/streaming')
  await scegli('📂 Collega la cartella dei film')
  await page.getByRole('button', { name: /^South Park/ }).click()
  await page.getByRole('list', { name: 'Stagione 3' }).getByText('01 Rainforest Shmainforest').click()
  await expect(page.locator('video')).toHaveAttribute('src', /^blob:/)
  await expect(page.getByText(/Italiano · dalla cartella/)).toBeVisible()

  // Riaperta la pagina il browser ha dimenticato i file: Ciak lo dice, e lo
  // stesso pulsante li fa riscegliere.
  await page.reload()
  await expect(page.getByText(/sceglila di nuovo/)).toBeVisible()
  await scegli('📂 Riapri la cartella «Ciak»')
  await expect(page.locator('video')).toHaveAttribute('src', /^blob:/)

  // In videoteca, l'elenco dell'ultima volta col pulsante per riscegliere.
  await page.goto('/streaming')
  await expect(page.getByRole('button', { name: /Paprika \(2006\)/ })).toBeVisible()
  await scegli('📂 Riapri la cartella «Ciak»')
  await expect(page.getByRole('button', { name: '📂 Riapri la cartella «Ciak»' })).toHaveCount(0)
})
