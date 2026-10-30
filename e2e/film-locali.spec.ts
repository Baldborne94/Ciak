import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { E2E_USER, mockTmdb, mockSupabase, signIn } from './support/mocks'

// La videoteca dal disco: un film scelto dal PC (o dalla memoria del tablet)
// parte nel lettore di Ciak, coi suoi sottotitoli, e si può copiare in Ciak
// per vederlo anche senza il file a portata; una cartella intera (E:\Ciak) si
// collega e diventa la videoteca, da cui si può anche cancellare.

const SRT = '1\n00:00:01,000 --> 00:00:03,000\nC’era una volta\n'
// Pochi byte, non un film vero: al browser basta averne l'indirizzo.
const FILM = { name: 'Song.of.the.Sea.2014.1080p.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(64, 1) }
const SOTTOTITOLI = { name: 'Song.of.the.Sea.2014.1080p.it.srt', mimeType: 'application/x-subrip', buffer: Buffer.from(SRT) }

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  // OpenSubtitles non ha niente: valgono i sottotitoli accanto al video.
  await page.route('**/api/sottotitoli', (route) => route.fulfill({ json: { candidati: [] } }))
})

test('un film si apre dal disco, coi sottotitoli, e si salva in Ciak', async ({ page }) => {
  const db = await mockSupabase(page, { user_streaming: [] })
  // Nessuna richiesta a Google: Drive non c'è più.
  const google: string[] = []
  await page.route('https://www.googleapis.com/**', (route) => {
    google.push(route.request().url())
    return route.abort()
  })

  await page.goto('/streaming')
  await expect(page.getByText(/Google Drive/)).toHaveCount(0)
  await page.getByLabel('Scegli il film (ed eventualmente i sottotitoli)').setInputFiles([FILM, SOTTOTITOLI])

  await expect(page).toHaveURL(/\/streaming\/loc-[0-9a-f]{16}$/)
  const id = new URL(page.url()).pathname.split('/').pop()!
  // Il file letto dal disco, senza caricarlo da nessuna parte.
  await expect(page.locator('video')).toHaveAttribute('src', /^blob:/)
  await expect(page.getByText(/Italiano · dal file scelto/)).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Mostra' }).locator('option')).toHaveText(['Nessun sottotitolo', 'Italiano'])
  // Un file scelto a mano non si cancella da qui: non sta nella cartella.
  await expect(page.getByRole('button', { name: /Cancella dal disco/ })).toHaveCount(0)
  // L'archivio: il file si lega al suo id «loc-».
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
  await expect(page.locator('video')).toHaveAttribute('src', /^blob:/)
  await expect(page.getByText(/sceglilo di nuovo per guardarlo/)).toHaveCount(0)
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
  await mockSupabase(page, { user_streaming: [] })
  await page.goto('/streaming')
  await page
    .getByLabel('Scegli il film (ed eventualmente i sottotitoli)')
    .setInputFiles([{ name: 'The.Secret.of.Kells.2009.mkv', mimeType: 'video/x-matroska', buffer: Buffer.alloc(64, 7) }])
  await expect(page).toHaveURL(/\/streaming\/loc-/)
  await expect(page.getByText(/Convertilo in MP4 con prepara-ciak/)).toBeVisible()
})

test('scegliendo solo i sottotitoli, si chiede il video', async ({ page }) => {
  await mockSupabase(page, { user_streaming: [] })
  await page.goto('/streaming')
  await page.getByLabel('Scegli il film (ed eventualmente i sottotitoli)').setInputFiles([SOTTOTITOLI])
  await expect(page.getByRole('alert')).toHaveText('Scegli un file video (MP4, MKV, WebM…).')
  await expect(page).toHaveURL(/\/streaming$/)
})

test('Google Drive non c’è più: né nelle Impostazioni né in un vecchio link al lettore', async ({ page }) => {
  await mockSupabase(page)
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible()
  await expect(page.getByText(/Google Drive/)).toHaveCount(0)
  // Un video di Drive dalla cronologia: lo si dice, invece di un lettore muto.
  await page.goto('/streaming/1AbCdEfGhIjKlMnOpQr')
  await expect(page.getByRole('heading', { name: 'Questo video era su Google Drive' })).toBeVisible()
  await expect(page.locator('video')).toHaveCount(0)
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
  ['prepara-ciak.bat', '@echo off'],
]

// Titoli non riconosciuti: i nomi restano quelli delle cartelle, stabili.
async function senzaRiconoscimento(page: Page) {
  await page.route('**/api/tmdb*', (route) =>
    new URL(route.request().url()).searchParams.get('path') === '/search/multi' ? route.fulfill({ json: { results: [] } }) : route.fallback(),
  )
}

test('collegata la cartella del PC, la serie compare per stagioni e l’episodio parte dal disco', async ({ page }) => {
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
  // Qui i file si leggono e basta: per cancellarli serve Chrome o Edge.
  await expect(page.getByText(/Per cancellarlo dal disco apri Ciak con Chrome o Edge/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Cancella dal disco/ })).toHaveCount(0)

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

// Tutti i file della cartella finta, come percorsi («SERIE TV/South Park/…»).
async function fileSulDisco(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const tutti: string[] = []
    const visita = async (dir: FileSystemDirectoryHandle, sopra: string) => {
      for await (const voce of (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
        const qui = sopra ? `${sopra}/${voce.name}` : voce.name
        if (voce.kind === 'directory') {
          tutti.push(`${qui}/`)
          await visita(voce as FileSystemDirectoryHandle, qui)
        } else tutti.push(qui)
      }
    }
    await visita(await (await navigator.storage.getDirectory()).getDirectoryHandle('Ciak'), '')
    return tutti.sort()
  })
}

test('si cancella dal disco: un episodio dal lettore, poi la serie intera dalla videoteca', async ({ page }) => {
  await senzaRiconoscimento(page)
  await mockSupabase(page, { user_streaming: [] })
  // Un terzo episodio: con uno solo rimasto la serie non sarebbe più un gruppo.
  await cartellaFinta(page, [...CARTELLA, ['SERIE TV/South Park/Season 03/03 Tweek vs Craig.mp4', 'd'.repeat(72)]])
  const avvisi: string[] = []
  page.on('dialog', (d) => {
    avvisi.push(d.message())
    void d.accept()
  })

  await page.goto('/streaming')
  await page.getByRole('button', { name: '📂 Collega la cartella dei film' }).click()
  await page.getByRole('button', { name: /^South Park/ }).click()
  await page.getByRole('list', { name: 'Stagione 3' }).getByText('01 Rainforest Shmainforest').click()

  // Dal lettore: va via l'episodio col suo sottotitolo; la stagione resta,
  // perché c'è ancora l'altro episodio.
  await page.getByRole('button', { name: '🗑 Cancella dal disco' }).click()
  await expect(page).toHaveURL(/\/streaming$/)
  await expect(page.getByText(/è stato cancellato dal disco/)).toBeVisible()
  expect(avvisi[0]).toMatch(/Non finisce nel Cestino/)
  expect(await fileSulDisco(page)).toEqual([
    'FILM/',
    'FILM/Paprika (2006)/',
    'FILM/Paprika (2006)/Paprika.2006.mp4',
    'SERIE TV/',
    'SERIE TV/South Park/',
    'SERIE TV/South Park/Season 03/',
    'SERIE TV/South Park/Season 03/02 Spontaneous Combustion.mp4',
    'SERIE TV/South Park/Season 03/03 Tweek vs Craig.mp4',
    'prepara-ciak.bat',
  ])

  // Dalla videoteca, la serie intera: la stagione e la cartella della serie,
  // rimaste vuote. La scheda SERIE TV resta, e il film non si tocca.
  await page.getByRole('button', { name: /^South Park/ }).click()
  await page.getByRole('button', { name: '🗑 Cancella la serie dal disco' }).click()
  await expect(page.getByRole('button', { name: /^South Park/ })).toHaveCount(0)
  expect(avvisi[1]).toMatch(/Non finiscono nel Cestino/)
  expect(await fileSulDisco(page)).toEqual(['FILM/', 'FILM/Paprika (2006)/', 'FILM/Paprika (2006)/Paprika.2006.mp4', 'SERIE TV/', 'prepara-ciak.bat'])
})

test('chi ci ripensa davanti alla conferma non perde niente', async ({ page }) => {
  await senzaRiconoscimento(page)
  await mockSupabase(page, { user_streaming: [] })
  await cartellaFinta(page, CARTELLA)
  page.on('dialog', (d) => void d.dismiss())
  await page.goto('/streaming')
  await page.getByRole('button', { name: '📂 Collega la cartella dei film' }).click()
  await page.getByRole('button', { name: /Paprika \(2006\)/ }).click()
  await page.getByRole('button', { name: '🗑 Cancella dal disco' }).click()
  await expect(page).toHaveURL(/\/streaming\/loc-/)
  expect(await fileSulDisco(page)).toContain('FILM/Paprika (2006)/Paprika.2006.mp4')
})

test('un sottotitolo trovato online per un file scelto a mano resta in Ciak: la volta dopo non si riscarica', async ({ page }) => {
  await mockSupabase(page, { user_streaming: [] })
  const scaricati: unknown[] = []
  await page.route('**/api/sottotitoli', (route) => {
    const body = route.request().postDataJSON() as { azione: string; fileId?: number }
    if (body.azione === 'cerca') return route.fulfill({ json: { candidati: [{ fileId: 7, lingua: 'it', nome: 'song.it.srt', download: 5, hash: false }] } })
    scaricati.push(body.fileId)
    return route.fulfill({ json: { testo: SRT, rimasti: 9 } })
  })
  await page.goto('/streaming')
  await page.getByLabel('Scegli il film (ed eventualmente i sottotitoli)').setInputFiles([FILM])
  // Accanto a un file scelto a mano il browser non lascia scrivere: lo tiene Ciak.
  await expect(page.getByText(/Italiano · da OpenSubtitles, salvato in Ciak/)).toBeVisible()
  expect(scaricati).toEqual([7])

  // Riaprendo lo stesso file un'altra volta, l'italiano c'è già.
  await page.goto('/streaming')
  await page.getByLabel('Scegli il film (ed eventualmente i sottotitoli)').setInputFiles([FILM])
  await expect(page.getByText(/Italiano · da OpenSubtitles, salvato in Ciak/)).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Mostra' }).locator('option')).toHaveText(['Nessun sottotitolo', 'Italiano'])
  expect(scaricati).toEqual([7])
})

// ── Una serie tenuta in Ciak ────────────────────────────────────────────────
// Sul tablet il permesso della cartella si perde a ogni chiusura dell'app: la
// serie salvata in Ciak si guarda senza, con sottotitoli e lingue dell'audio.

// Le schede dei film salvati in Ciak, in ordine di file.
async function salvatiInCiak(page: Page) {
  return page.evaluate(async () => {
    const cache = await caches.open('ciak-film-v1')
    const schede: { id: string; file: string; serie: string | null; vicini: string[]; sottotitoli: (string | null)[] }[] = []
    for (const r of await cache.keys()) {
      if (!r.url.endsWith('/info.json')) continue
      const info = await (await cache.match(r))!.json()
      schede.push({
        id: info.id,
        file: info.file,
        serie: info.serie ?? null,
        vicini: [...(info.vicini ?? [])].sort(),
        sottotitoli: (info.sottotitoli ?? []).map((s: { lingua: string | null }) => s.lingua),
      })
    }
    return schede.sort((a, b) => a.file.localeCompare(b.file))
  })
}

test('una serie salvata in Ciak copia da sola gli episodi nuovi e toglie quelli visti', async ({ page }) => {
  await senzaRiconoscimento(page)
  const db = await mockSupabase(page, { user_streaming: [] })
  const accanto = 'SERIE TV/South Park/Season 03/02 Spontaneous Combustion'
  const elencoAudio = JSON.stringify({
    versione: 1,
    tracce: [
      { indice: 1, lingua: 'en', titolo: '', file: null },
      { indice: 2, lingua: 'it', titolo: '', file: '02 Spontaneous Combustion.audio-2.m4a' },
    ],
  })
  await cartellaFinta(page, [...CARTELLA, [`${accanto}.audio.json`, elencoAudio], [`${accanto}.audio-2.m4a`, 'audio']])

  await page.goto('/streaming')
  await page.getByRole('button', { name: '📂 Collega la cartella dei film' }).click()
  await page.getByRole('button', { name: /^South Park/ }).click()
  await page.getByRole('button', { name: '📱 Salva la serie in Ciak' }).click()
  await expect(page.getByText(/Tenuta in Ciak: 2 di 2 episodi/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^South Park.*📱 in Ciak/ })).toBeVisible()

  // Ogni episodio col suo: il sottotitolo del primo, le lingue del secondo.
  expect(await salvatiInCiak(page)).toEqual([
    { id: expect.stringMatching(/^loc-/), file: '01 Rainforest Shmainforest.mp4', serie: 'South Park', vicini: [], sottotitoli: ['it'] },
    {
      id: expect.stringMatching(/^loc-/),
      file: '02 Spontaneous Combustion.mp4',
      serie: 'South Park',
      vicini: ['02 Spontaneous Combustion.audio-2.m4a', '02 Spontaneous Combustion.audio.json'],
      sottotitoli: [],
    },
  ])
  // «Sul dispositivo» li raccoglie in una riga sola.
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: /Sul dispositivo/ }) })).toContainText(/South Park\s*2 episodi/)

  // Un episodio nuovo nella cartella: alla prossima lettura si copia da solo.
  await page.evaluate(async () => {
    let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Ciak')
    for (const p of ['SERIE TV', 'South Park', 'Season 03']) dir = await dir.getDirectoryHandle(p)
    const scrivi = await (await dir.getFileHandle('03 Tweek vs Craig.mp4', { create: true })).createWritable()
    await scrivi.truncate(6_000_072)
    await scrivi.close()
  })
  await page.getByRole('button', { name: '🔄 Aggiorna' }).click()
  await expect(page.getByText(/Tenuta in Ciak: 3 di 3 episodi/)).toBeVisible()

  // Il primo è stato visto (anche su un altro dispositivo): la copia va via,
  // il file nella cartella resta.
  const primo = (await salvatiInCiak(page))[0].id
  const righe = db.tables.user_streaming as Record<string, unknown>[]
  const riga = righe.find((r) => r.drive_file_id === primo)
  if (riga) riga.visto_il = '2026-10-18T10:00:00Z'
  else righe.push({ user_id: E2E_USER.id, drive_file_id: primo, visto_il: '2026-10-18T10:00:00Z', posizione: 0, secondi_visti: 0, durata: null })
  await page.getByRole('button', { name: '🔄 Aggiorna' }).click()
  await expect(page.getByText(/Tenuta in Ciak: 2 di 3 episodi/)).toBeVisible()
  expect((await salvatiInCiak(page)).map((f) => f.file)).toEqual(['02 Spontaneous Combustion.mp4', '03 Tweek vs Craig.mp4'])
  expect(await fileSulDisco(page)).toContain('SERIE TV/South Park/Season 03/01 Rainforest Shmainforest.mp4')

  // Senza la cartella, l'episodio parte dalla copia, con le sue lingue.
  await page.getByRole('button', { name: 'Scollega la cartella' }).click()
  await page.getByText('South Park', { exact: true }).click()
  await page.getByRole('list', { name: 'Episodi di South Park sul dispositivo' }).getByRole('button', { name: /S3E2/ }).click()
  await expect(page.locator('video')).toHaveAttribute('src', /^blob:/)
  await expect(page.getByRole('button', { name: 'Audio: Inglese. Cambia lingua' })).toBeVisible()
})

test('smettere di tenere una serie in Ciak toglie le copie, non i file', async ({ page }) => {
  await senzaRiconoscimento(page)
  await mockSupabase(page, { user_streaming: [] })
  await cartellaFinta(page, CARTELLA)
  page.on('dialog', (d) => void d.accept())

  await page.goto('/streaming')
  await page.getByRole('button', { name: '📂 Collega la cartella dei film' }).click()
  await page.getByRole('button', { name: /^South Park/ }).click()
  await page.getByRole('button', { name: '📱 Salva la serie in Ciak' }).click()
  await expect(page.getByText(/Tenuta in Ciak: 2 di 2 episodi/)).toBeVisible()

  // Ricaricando resta tenuta: lo ricorda il dispositivo.
  await page.reload()
  await page.getByRole('button', { name: /^South Park/ }).click()
  await expect(page.getByText(/Tenuta in Ciak: 2 di 2 episodi/)).toBeVisible()

  await page.getByRole('button', { name: 'Smetti di tenerla in Ciak' }).click()
  await expect(page.getByRole('button', { name: '📱 Salva la serie in Ciak' })).toBeVisible()
  await expect.poll(async () => (await salvatiInCiak(page)).length).toBe(0)
  expect(await fileSulDisco(page)).toContain('SERIE TV/South Park/Season 03/02 Spontaneous Combustion.mp4')
})


test('con la cartella da riaprire, la copia di un episodio visto va via lo stesso', async ({ page }) => {
  await senzaRiconoscimento(page)
  const db = await mockSupabase(page, { user_streaming: [] })
  await cartellaFinta(page, CARTELLA)
  // Come Chrome sul tablet: il permesso c'è dopo la scelta, non dopo aver riaperto l'app.
  await page.addInitScript(() => {
    let concesso = false
    const w = window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }
    const scegli = w.showDirectoryPicker
    w.showDirectoryPicker = async () => {
      concesso = true
      return scegli()
    }
    ;(FileSystemHandle.prototype as unknown as Record<string, unknown>).queryPermission = async () => (concesso ? 'granted' : 'prompt')
  })

  await page.goto('/streaming')
  await page.getByRole('button', { name: '📂 Collega la cartella dei film' }).click()
  await page.getByRole('button', { name: /^South Park/ }).click()
  await page.getByRole('button', { name: '📱 Salva la serie in Ciak' }).click()
  await expect(page.getByText(/Tenuta in Ciak: 2 di 2 episodi/)).toBeVisible()

  const primo = (await salvatiInCiak(page))[0].id
  const righe = db.tables.user_streaming as Record<string, unknown>[]
  const riga = righe.find((r) => r.drive_file_id === primo)
  if (riga) riga.visto_il = '2026-10-18T10:00:00Z'
  else righe.push({ user_id: E2E_USER.id, drive_file_id: primo, visto_il: '2026-10-18T10:00:00Z', posizione: 0, secondi_visti: 0, durata: null })

  await page.reload()
  await expect(page.getByRole('button', { name: '📂 Riapri la cartella «Ciak»' })).toBeVisible()
  await expect.poll(async () => (await salvatiInCiak(page)).map((f) => f.file)).toEqual(['02 Spontaneous Combustion.mp4'])
})

test('la cartella «Extras» di un film non diventa una serie: sono i suoi contenuti speciali', async ({ page }) => {
  // «FILM/Lawrence of Arabia (1962)/Extras/…» compariva come la serie
  // «Lawrence of Arabia (1962)», con nove episodi, accanto al film.
  await senzaRiconoscimento(page)
  await mockSupabase(page, { user_streaming: [] })
  await cartellaFinta(page, [
    ...CARTELLA,
    ['FILM/Paprika (2006)/Extras/Satoshi Kon Interview.mp4', 'e'.repeat(40)],
    ['FILM/Paprika (2006)/Extras/The Dream Creatures.mp4', 'f'.repeat(48)],
  ])

  await page.goto('/streaming')
  await page.getByRole('button', { name: '📂 Collega la cartella dei film' }).click()
  await expect(page.getByRole('button', { name: /Paprika \(2006\)/ })).toBeVisible()
  // Una riga sola per Paprika: il film, non anche una «serie» coi suoi extra.
  await expect(page.getByRole('button', { name: /Paprika/ })).toHaveCount(1)
  await expect(page.getByText(/2 extra .* non sono in elenco/)).toBeVisible()
  // Gli «Extras» di una serie restano i suoi speciali: South Park c'è ancora.
  await expect(page.getByRole('button', { name: /^South Park/ })).toBeVisible()
})

test('un episodio salvato in Ciak senza sottotitoli li cerca online, e li tiene con la copia', async ({ page }) => {
  // Sul tablet le stagioni nuove di South Park, copiate quando accanto ai file
  // non c'erano .srt, partivano dalla copia senza sottotitoli: si guardavano
  // solo quelli salvati con lei, e nessuno li cercava.
  await senzaRiconoscimento(page)
  await mockSupabase(page, { user_streaming: [] })
  await cartellaFinta(page, CARTELLA)
  const richieste: Record<string, unknown>[] = []
  await page.route('**/api/sottotitoli', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    richieste.push(body)
    if (body.azione === 'cerca') return route.fulfill({ json: { candidati: [{ fileId: 7, lingua: 'it', nome: 'sp.it.srt', download: 1, hash: false }] } })
    return route.fulfill({ json: { testo: SRT, rimasti: 9 } })
  })

  await page.goto('/streaming')
  await page.getByRole('button', { name: '📂 Collega la cartella dei film' }).click()
  await page.getByRole('button', { name: /^South Park/ }).click()
  await page.getByRole('button', { name: '📱 Salva la serie in Ciak' }).click()
  await expect(page.getByText(/Tenuta in Ciak: 2 di 2 episodi/)).toBeVisible()
  const secondo = (await salvatiInCiak(page)).find((f) => f.file.startsWith('02'))!
  expect(secondo.sottotitoli).toEqual([])

  // Come sul tablet: niente cartella e un'altra visita (i file letti in
  // questa il browser li ricorda), l'episodio parte dalla copia.
  await page.getByRole('button', { name: 'Scollega la cartella' }).click()
  await page.reload()
  await page.getByText('South Park', { exact: true }).click()
  await page.getByRole('list', { name: 'Episodi di South Park sul dispositivo' }).getByRole('button', { name: /S3E2/ }).click()
  await expect(page.locator('video')).toHaveAttribute('src', /^blob:/)
  await expect(page.getByText(/Italiano · da OpenSubtitles/)).toBeVisible()
  expect(richieste.filter((r) => r.azione === 'cerca')).toHaveLength(1)
  // Trovati, restano con la copia: la volta dopo non si cercano più.
  await expect.poll(async () => (await salvatiInCiak(page)).find((f) => f.id === secondo.id)?.sottotitoli).toEqual(['it'])
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Mostra' }).locator('option')).toHaveText(['Nessun sottotitolo', 'Italiano'])
  expect(richieste.filter((r) => r.azione === 'cerca')).toHaveLength(1)
})
