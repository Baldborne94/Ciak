import { test, expect, type Page } from '@playwright/test'
import { mockTmdb, mockSupabase, signIn, E2E_USER } from './support/mocks'
import { movieDetail } from './support/fixtures'
import { idLocale } from '../src/lib/filmLocali'

// «Streaming»: la videoteca dalla cartella dei film del PC (E:\Ciak), col
// lettore di Ciak. Ermetico: la cartella è una cartella vera del browser
// (l'Origin Private File System) al posto di quella scelta dal disco — le
// stesse «maniglie» di File System Access —, TMDB e Supabase sono finti.

const SRT = '1\n00:00:01,000 --> 00:00:03,000\nC\'era una volta\n'
// L'elenco delle lingue come lo scrive prepara-ciak (Windows PowerShell).
const ELENCO_AUDIO = JSON.stringify({
  versione: 1,
  tracce: [
    { indice: 1, lingua: 'en', titolo: '', file: null },
    { indice: 2, lingua: 'it', titolo: '', file: 'Song.of.the.Sea.2014.1080p.audio-2.m4a' },
  ],
})

// I video della cartella finta: dove stanno e quanto pesano. La chiave è il
// nome breve con cui i test li chiamano; l'id vero (`loc-…`) viene dal nome e
// dalla dimensione del file, come nell'app. Pesi piccoli ma sopra i 5 MB:
// sotto, la videoteca li scarta come promo della release.
const VIDEO: Record<string, string> = {
  'video-song-0001': 'FILM/Song of the Sea (2014) [1080p]/Song.of.the.Sea.2014.1080p.mp4',
  'video-b99-00001': 'SERIE TV/B99 S7E2.mp4',
  'video-kells-0001': 'FILM/The.Secret.of.Kells.2009.mkv',
  'video-shogun-01': 'SERIE TV/Shogun.S01E01.mp4',
  'video-shogun-02': 'SERIE TV/Shogun.S01E02.mp4',
  'video-shogun-03': 'SERIE TV/Shogun.S01E03.mp4',
  'video-snk-s01e04': 'ANIME/Shingeki no Kyojin [10bits x265]/Shingeki no Kyojin - S01E04 - Night of the Graduation Ceremony.mp4',
  'video-snk-oad01': "ANIME/Shingeki no Kyojin [10bits x265]/OADs/Shingeki no Kyojin - OADE01 - Ilse's Notebook.mp4",
  'video-snk-s01e135': 'ANIME/Shingeki no Kyojin [10bits x265]/Shingeki no Kyojin - S01E13.5 - Since That Day.mp4',
  'video-snk-film': 'ANIME/Shingeki no Kyojin [10bits x265]/Shingeki no Kyojin Crimson Bow and Arrow (Dual Audio_10bit_BD1080p_x265).mp4',
  'video-sp-000301': 'SERIE TV/South Park/Season 03/01 Rainforest Shmainforest.mp4',
  'video-sp-000302': 'SERIE TV/South Park/Season 03/02 Spontaneous Combustion.mp4',
  'video-sp-web-01': 'SERIE TV/South Park/Webisodes/The Accountants.mp4',
  'video-tf-01': 'FILM/Transformers Complete Movie Collection/01 Transformers - Action 2007 Eng Rus Multi-Subs 1080p [H264-mp4].mp4',
  'video-tf-06': 'FILM/Transformers Complete Movie Collection/06 Transformers Bumblebee - Action 2018 Eng Rus Multi-Subs 1080p [H264-mp4].mp4',
  'video-alien-1979': 'FILM/Alien.1979.mp4',
  'video-aliens-1986': 'FILM/Aliens.1986.mp4',
  'video-song-extra1': 'FILM/Song of the Sea (2014) [1080p]/Featurettes/Making of Song of the Sea.mp4',
  'video-sp-r-0306': 'SERIE TV/South Park/South Park Season 1 to 26 Mp4 1080p/Season 03/South Park S03E06.mp4',
}
const peso = (chiave: string) => 6_000_000 + Object.keys(VIDEO).indexOf(chiave) * 1000
const nome = (percorso: string) => percorso.split('/').pop()!
// Gli id dei video della cartella, e di qualche riga d'archivio senza file.
const ID: Record<string, string> = {
  ...Object.fromEntries(Object.entries(VIDEO).map(([k, p]) => [k, idLocale({ name: nome(p), size: peso(k) })])),
  'video-kells-gone1': 'loc-kells-cancellato',
  'video-altro-0001': 'loc-un-altro-video',
}
// L'indirizzo del lettore di un video, per toHaveURL.
const alLettore = (chiave: string) => new RegExp(`/streaming/${ID[chiave]}$`)

// Monta la cartella «Ciak» del browser coi video e i file accanto, come una
// cartella del disco con:
//   Ciak/SERIE TV/B99 S7E2.mp4
//   Ciak/FILM/Song of the Sea (2014) [1080p]/Song.of.the.Sea.2014.1080p.mp4
//   Ciak/FILM/The.Secret.of.Kells.2009.mkv (nascosto: Ciak riproduce gli MP4)
//   (e, se richiesto, …/Song.of.the.Sea.it.srt e le altre opzioni)
// «📂 Collega la cartella dei film» la sceglie (vedi `collega`).
async function mockCartella(
  page: Page,
  { vuota = false, sottotitoliNellaCartella = false, conSerie = false, conAnime = false, conRaccolta = false, conExtra = false, conShogun = false, conShogunPrimo = false, conSaga = false, conPacchetto = false, conFilmAnime = false, conLingueAudio = false, conWebisodes = false } = {},
) {
  const scelti = vuota
    ? []
    : [
        'video-song-0001',
        'video-b99-00001',
        'video-kells-0001',
        ...(conShogun ? ['video-shogun-02', 'video-shogun-03'] : []),
        ...(conShogunPrimo ? ['video-shogun-01'] : []),
        ...(conAnime ? ['video-snk-s01e04', 'video-snk-oad01', 'video-snk-s01e135'] : []),
        ...(conFilmAnime ? ['video-snk-film'] : []),
        ...(conSerie ? ['video-sp-000301', 'video-sp-000302'] : []),
        ...(conSerie && conWebisodes ? ['video-sp-web-01'] : []),
        ...(conPacchetto ? ['video-tf-01', 'video-tf-06'] : []),
        ...(conSaga ? ['video-alien-1979', 'video-aliens-1986'] : []),
        ...(conExtra ? ['video-song-extra1'] : []),
        ...(conRaccolta ? ['video-sp-r-0306'] : []),
      ]
  // I video sono zeri: nessun contenuto, solo il peso.
  const file: [string, string, number][] = scelti.map((k) => [VIDEO[k], '', peso(k)])
  const accanto = 'FILM/Song of the Sea (2014) [1080p]/'
  if (sottotitoliNellaCartella) file.push([`${accanto}Song.of.the.Sea.it.srt`, SRT, 0])
  if (conLingueAudio) {
    file.push([`${accanto}Song.of.the.Sea.2014.1080p.audio.json`, ELENCO_AUDIO, 0])
    file.push([`${accanto}Song.of.the.Sea.2014.1080p.audio-2.m4a`, 'audio', 0])
  }
  // Le cartelle ci sono anche vuote: la scheda SERIE TV esiste sempre.
  const cartelle = ['FILM', 'SERIE TV', ...(conAnime ? ['ANIME'] : [])]
  await page.addInitScript(
    ({ file, cartelle }) => {
      ;(window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => {
        const ciak = await (await navigator.storage.getDirectory()).getDirectoryHandle('Ciak', { create: true })
        for (const c of cartelle) await ciak.getDirectoryHandle(c, { create: true })
        for (const [percorso, contenuto, dimensione] of file) {
          const parti = percorso.split('/')
          let dir = ciak
          for (const p of parti.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true })
          const scrivi = await (await dir.getFileHandle(parti[parti.length - 1], { create: true })).createWritable()
          await scrivi.write(contenuto)
          // Il peso del video: zeri, che costano poco.
          if (dimensione) await scrivi.truncate(dimensione)
          await scrivi.close()
        }
        return ciak
      }
    },
    { file, cartelle },
  )
}

async function collega(page: Page) {
  await page.getByRole('button', { name: '📂 Collega la cartella dei film' }).click()
}

// I file della cartella finta, come percorsi («SERIE TV/South Park/…»).
async function fileSulDisco(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const tutti: string[] = []
    const visita = async (dir: FileSystemDirectoryHandle, sopra: string) => {
      for await (const voce of (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
        const qui = sopra ? `${sopra}/${voce.name}` : voce.name
        if (voce.kind === 'directory') await visita(voce as FileSystemDirectoryHandle, qui)
        else tutti.push(qui)
      }
    }
    await visita(await (await navigator.storage.getDirectory()).getDirectoryHandle('Ciak'), '')
    return tutti.sort()
  })
}

// Il lettore legge il file dal disco con un indirizzo blob:. Qui i video sono
// zeri, che il browser rifiuterebbe subito: il loro indirizzo diventa una
// richiesta che resta in sospeso (`'fermo'`, il film «sta caricando») o che
// risponde con un errore (`'illeggibile'`, un formato che il browser non legge).
async function conVideoFermo(page: Page, video: 'fermo' | 'illeggibile' = 'fermo') {
  await page.addInitScript(() => {
    const crea = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (o: Blob | MediaSource) =>
      o instanceof File && /\.(mp4|mkv|webm|m4v)$/i.test(o.name) ? `${location.origin}/video-fermo/${encodeURIComponent(o.name)}` : crea(o)
  })
  await page.route('**/video-fermo/**', async (route) => {
    if (video === 'illeggibile') return route.fulfill({ status: 415, body: '' })
    // In sospeso: il film resta «in caricamento» per tutto il test.
  })
}

async function apriSongOfTheSea(page: Page) {
  await page.goto('/streaming')
  await collega(page)
  // Per nome del file: il titolo mostrato cambia quando Ciak lo riconosce.
  await page.getByRole('button', { name: /Song\.of\.the\.Sea\.2014/ }).click()
  await expect(page).toHaveURL(alLettore('video-song-0001'))
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockSupabase(page)
  await mockTmdb(page)
  // TheIntroDB non conosce gli episodi di prova: vale il punto imparato per
  // la serie. Il browser non lo raggiunge (come con un CORS che non passa) e
  // la riserva /api/sigle non ha niente. Il test delle sigle esatte li cambia.
  await page.route('https://api.theintrodb.org/**', (route) => route.abort())
  await page.route('**/api/sigle*', (route) => route.fulfill({ json: { inizio: null, finale: null } }))
  // OpenSubtitles non ha niente, se un test non dice altro.
  await page.route('**/api/sottotitoli', (route) => route.fulfill({ json: { candidati: [] } }))
  // Le schede dei titoli di prova, col loro titolo originale.
  await page.route('**/api/tmdb*', (route) => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? ''
    if (path === '/movie/110416') {
      return route.fulfill({ json: movieDetail(110416, 'La canzone del mare', { original_title: 'Song of the Sea' }) })
    }
    return route.fallback()
  })
})

test('«Streaming» elenca i film della cartella Ciak e li apre nel player', async ({ page }) => {
  await mockCartella(page)
  await page.goto('/streaming')

  await expect(page.getByRole('heading', { name: 'La mia videoteca' })).toBeVisible()
  await collega(page)

  // Il film in una sottocartella prende il nome della cartella; l'altro quello
  // del file senza estensione.
  await expect(page.getByText('Song of the Sea (2014) [1080p]')).toBeVisible()
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  await expect(page.getByText(/MP4 · 6 MB · Song\.of\.the\.Sea/)).toBeVisible()
  // L'MKV non compare, ma la pagina dice che c'è e come renderlo visibile.
  await expect(page.getByText('The.Secret.of.Kells.2009', { exact: false })).toHaveCount(0)
  await expect(page.getByText(/1 video in un altro formato \(MKV, AVI…\) è nascosto/)).toBeVisible()

  // Aprendo il film si va alla pagina del player, grande: il lettore di Ciak,
  // col file letto dal disco.
  await page.getByRole('button', { name: /Song of the Sea/ }).click()
  await expect(page).toHaveURL(alLettore('video-song-0001'))
  await expect(page.getByRole('heading', { name: 'Song of the Sea (2014) [1080p]' })).toBeVisible()
  await expect(page.locator('video')).toHaveAttribute('src', /^blob:/)
  await expect(page.locator('iframe')).toHaveCount(0)

  // Tornando indietro l'elenco si ricarica da solo, senza ricollegarsi.
  await page.getByRole('link', { name: /Torna ai film/ }).click()
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '📂 Collega la cartella dei film' })).toHaveCount(0)
})

test('i film della stessa saga stanno in una cartella con la locandina della saga', async ({ page }) => {
  await mockCartella(page, { conSaga: true })
  const film = (drive_file_id: string, tmdb_id: number, titolo: string) => ({
    id: `s-${drive_file_id}`,
    user_id: E2E_USER.id,
    drive_file_id,
    nome_file: null,
    tmdb_id,
    media_type: 'movie',
    titolo,
    poster_path: `/poster-${tmdb_id}.jpg`,
    stagione: null,
    episodio: null,
    abbinato_a_mano: false,
    posizione: 0,
    durata: 7000,
    secondi_visti: 0,
    visto_il: tmdb_id === 348 ? '2026-09-01T20:00:00Z' : null,
  })
  await mockSupabase(page, { user_streaming: [film(ID['video-alien-1979'], 348, 'Alien'), film(ID['video-aliens-1986'], 679, 'Aliens')] })
  // Il dettaglio di ogni film dice a quale saga appartiene, come su TMDB.
  const saga = { id: 8091, name: 'Alien Collection', poster_path: '/alien-saga.jpg' }
  await page.route('**/api/tmdb*', (route) => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? ''
    if (path === '/movie/348') return route.fulfill({ json: movieDetail(348, 'Alien', { release_date: '1979-05-25', belongs_to_collection: saga }) })
    if (path === '/movie/679') return route.fulfill({ json: movieDetail(679, 'Aliens', { release_date: '1986-07-18', belongs_to_collection: saga }) })
    return route.fallback()
  })

  await page.goto('/streaming')
  await collega(page)

  const cartella = page.getByRole('button', { name: /^Alien ▸/ })
  await expect(cartella).toContainText('Saga · 2 film · 1979–1986 · 1 visti')
  await expect(cartella.locator('img')).toHaveAttribute('src', /alien-saga\.jpg$/)
  // Chiusa, i due film non sono righe sciolte dell'elenco.
  await expect(page.getByRole('button', { name: /Aliens\.1986\.mp4/ })).toHaveCount(0)

  await cartella.click()
  const filmDellaSaga = page.getByRole('list', { name: 'Film di Alien' })
  await expect(filmDellaSaga.getByRole('button', { name: /Alien\.1979\.mp4/ })).toBeVisible()
  await filmDellaSaga.getByRole('button', { name: /Aliens\.1986\.mp4/ }).click()
  await expect(page).toHaveURL(alLettore('video-aliens-1986'))

  // Cercando un film della saga, la cartella si apre da sola.
  await page.getByRole('link', { name: /Torna ai film/ }).click()
  await page.getByPlaceholder(/Cerca un titolo/).fill('Aliens')
  await expect(page.getByRole('list', { name: 'Film di Alien' }).getByRole('button', { name: /Aliens\.1986\.mp4/ })).toBeVisible()
})

test('i film di un pacchetto si riconoscono uno per uno e finiscono nella cartella della loro saga', async ({ page }) => {
  // «Transformers Complete Movie Collection/06 Transformers Bumblebee - Action
  // 2018…»: si cercava il nome del pacchetto, o il titolo con numero e genere
  // attaccati, e i film restavano tutti «Transformers Complete Movie Collection».
  await mockCartella(page, { conPacchetto: true })
  const db = await mockSupabase(page, { user_streaming: [] })
  const saga = { id: 8650, name: 'Transformers Collection', poster_path: '/transformers-saga.jpg' }
  const cercati: string[] = []
  await page.route('**/api/tmdb*', (route) => {
    const url = new URL(route.request().url())
    const path = url.searchParams.get('path') ?? ''
    if (path === '/search/multi') {
      const q = url.searchParams.get('query') ?? ''
      cercati.push(q)
      if (q === 'Transformers') return route.fulfill({ json: { results: [{ id: 1858, media_type: 'movie', title: 'Transformers', original_title: 'Transformers', release_date: '2007-06-27', poster_path: '/tf.jpg' }] } })
      if (q === 'Transformers Bumblebee') return route.fulfill({ json: { results: [{ id: 424783, media_type: 'movie', title: 'Bumblebee', original_title: 'Bumblebee', release_date: '2018-12-15', poster_path: '/bb.jpg' }] } })
      return route.fulfill({ json: { results: [] } })
    }
    if (path === '/movie/1858') return route.fulfill({ json: movieDetail(1858, 'Transformers', { release_date: '2007-06-27', belongs_to_collection: saga }) })
    if (path === '/movie/424783') return route.fulfill({ json: movieDetail(424783, 'Bumblebee', { release_date: '2018-12-15', belongs_to_collection: saga }) })
    return route.fallback()
  })

  await page.goto('/streaming')
  await collega(page)

  await expect.poll(() => db.tables.user_streaming.find((r) => r.drive_file_id === ID['video-tf-06'])?.tmdb_id).toBe(424783)
  expect(db.tables.user_streaming.find((r) => r.drive_file_id === ID['video-tf-01'])?.tmdb_id).toBe(1858)
  expect(cercati).not.toContain('Transformers Complete Movie Collection')

  const cartella = page.getByRole('button', { name: /^Transformers ▸/ })
  await expect(cartella).toContainText('Saga · 2 film · 2007–2018')
  await cartella.click()
  await expect(page.getByRole('list', { name: 'Film di Transformers' }).getByText('Bumblebee', { exact: true })).toBeVisible()
})

test('una saga di TMDB si modifica: diventa tua, e i film tolti tornano sciolti', async ({ page }) => {
  // Transformers senza Bumblebee: niente seconda cartella «Transformers».
  await mockCartella(page, { conPacchetto: true })
  const film = (drive_file_id: string, tmdb_id: number, titolo: string) => ({
    id: `s-${drive_file_id}`, user_id: E2E_USER.id, drive_file_id, nome_file: null, tmdb_id, media_type: 'movie', titolo,
    poster_path: `/poster-${tmdb_id}.jpg`, stagione: null, episodio: null, abbinato_a_mano: false, posizione: 0, durata: 7000, secondi_visti: 0, visto_il: null,
  })
  const db = await mockSupabase(page, {
    user_streaming: [film(ID['video-tf-01'], 1858, 'Transformers'), film(ID['video-tf-06'], 424783, 'Bumblebee')],
    user_lists: [],
    user_list_items: [],
  })
  const saga = { id: 8650, name: 'Transformers Collection', poster_path: '/transformers-saga.jpg' }
  await page.route('**/api/tmdb*', (route) => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? ''
    if (path === '/movie/1858') return route.fulfill({ json: movieDetail(1858, 'Transformers', { release_date: '2007-06-27', belongs_to_collection: saga }) })
    if (path === '/movie/424783') return route.fulfill({ json: movieDetail(424783, 'Bumblebee', { release_date: '2018-12-15', belongs_to_collection: saga }) })
    return route.fallback()
  })

  await page.goto('/streaming')
  await collega(page)
  const cartella = page.getByRole('button', { name: /^Transformers ▸/ })
  await expect(cartella).toContainText('Saga · 2 film')

  // Una saga nuova è per i film che TMDB non raccoglie già: questi no.
  await page.getByRole('button', { name: '＋ Crea una saga' }).click()
  await expect(page.getByRole('dialog').getByText(/I film che TMDB mette già in una saga/)).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('checkbox')).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button', { name: /Chiudi/ }).click()

  await cartella.click()
  await page.getByRole('toolbar', { name: 'Comandi di Transformers' }).getByRole('button', { name: '✎ Modifica la saga' }).click()

  const finestra = page.getByRole('dialog')
  await expect(finestra.getByLabel('Nome della saga')).toHaveValue('Transformers')
  await finestra.getByRole('button', { name: 'Nella saga (2)' }).click()
  await finestra.getByRole('checkbox', { name: /^Bumblebee/ }).uncheck()
  await finestra.getByRole('button', { name: 'Salva' }).click()

  // Una saga fatta a mano, che ricorda quale saga di TMDB sostituisce.
  await expect.poll(() => db.tables.user_lists.find((l) => l.name === 'Transformers')).toMatchObject({ come_saga: true, saga_tmdb: 8650 })
  await expect.poll(() => db.tables.user_list_items.map((i) => i.tmdb_id)).toEqual([1858])
  await expect(page.getByRole('button', { name: /^Transformers ▸|^Transformers ▾/ })).toHaveCount(1)
  await expect(page.getByRole('button', { name: /^Transformers/ }).first()).toContainText('Saga · 1 film')
  // Bumblebee fuori, da solo nell'elenco.
  await expect(page.getByRole('button', { name: /06 Transformers Bumblebee/ })).toBeVisible()
})

test('le «Mie liste» non compaiono nella videoteca; una saga fatta a mano si sceglie la copertina', async ({ page }) => {
  await mockCartella(page)
  const db = await mockSupabase(page, {
    user_streaming: [
      {
        id: 's-song', user_id: E2E_USER.id, drive_file_id: ID['video-song-0001'], nome_file: 'Song.of.the.Sea.2014.1080p.mp4', tmdb_id: 110416,
        media_type: 'movie', titolo: 'Song of the Sea', poster_path: '/song.jpg', stagione: null, episodio: null, abbinato_a_mano: false,
        posizione: 0, durata: 5640, secondi_visti: 0, visto_il: null,
      },
    ],
    user_lists: [
      // Una lista qualunque: resta fra le «Mie liste», non nella videoteca.
      { id: 'l-preferiti', user_id: E2E_USER.id, name: 'Preferiti', description: null, is_public: false },
      { id: 'l-cartoon', user_id: E2E_USER.id, name: 'Cartoon Saloon', description: null, is_public: false, come_saga: true },
    ],
    user_list_items: [
      { id: 'i0', list_id: 'l-preferiti', user_id: E2E_USER.id, tmdb_id: 110416, media_type: 'movie', title: 'La canzone del mare', poster_path: '/song.jpg' },
      { id: 'i1', list_id: 'l-cartoon', user_id: E2E_USER.id, tmdb_id: 110416, media_type: 'movie', title: 'La canzone del mare', poster_path: '/song.jpg' },
    ],
  })
  // Le immagini del film, fra cui scegliere la copertina.
  await page.route('**/api/tmdb*', (route) => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? ''
    if (path === '/movie/110416/images') {
      return route.fulfill({ json: { backdrops: [{ file_path: '/mare.jpg', vote_average: 5.6, iso_639_1: null }], posters: [] } })
    }
    return route.fallback()
  })

  await page.goto('/streaming')
  await collega(page)

  const saga = page.getByRole('button', { name: /^Cartoon Saloon ▸/ })
  await expect(saga).toContainText('Saga · 1 film')
  await expect(page.getByText('Preferiti')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Le mie raccolte' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Crea una raccolta/ })).toHaveCount(0)

  await saga.click()
  await page.getByRole('button', { name: '🖼️ Cambia copertina' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Sfondo 1 di/ }).click()
  await expect.poll(() => db.tables.user_lists.find((l) => l.id === 'l-cartoon')?.copertina).toBe('/mare.jpg')
  await expect(page.getByRole('button', { name: /^Cartoon Saloon/ }).locator('img')).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w780/mare.jpg')
})

test('una saga fatta a mano raccoglie film che su TMDB una saga non ce l’hanno', async ({ page }) => {
  // Alien e Aliens, qui senza saga su TMDB: li si mette insieme a mano.
  await mockCartella(page, { conSaga: true })
  const film = (drive_file_id: string, tmdb_id: number, titolo: string) => ({
    id: `s-${drive_file_id}`,
    user_id: E2E_USER.id,
    drive_file_id,
    nome_file: null,
    tmdb_id,
    media_type: 'movie',
    titolo,
    poster_path: `/poster-${tmdb_id}.jpg`,
    stagione: null,
    episodio: null,
    abbinato_a_mano: false,
    posizione: 0,
    durata: 7000,
    secondi_visti: 0,
    visto_il: null,
  })
  const db = await mockSupabase(page, {
    user_streaming: [film(ID['video-alien-1979'], 348, 'Alien'), film(ID['video-aliens-1986'], 679, 'Aliens')],
    user_lists: [],
    user_list_items: [],
  })
  await page.route('**/api/tmdb*', (route) => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? ''
    if (path === '/movie/348') return route.fulfill({ json: movieDetail(348, 'Alien', { release_date: '1979-05-25' }) })
    if (path === '/movie/679') return route.fulfill({ json: movieDetail(679, 'Aliens', { release_date: '1986-07-18' }) })
    return route.fallback()
  })
  page.on('dialog', (d) => void d.accept())

  await page.goto('/streaming')
  await collega(page)
  await expect(page.getByRole('button', { name: /Alien\.1979\.mp4/ })).toBeVisible()

  await page.getByRole('button', { name: '＋ Crea una saga' }).click()
  const finestra = page.getByRole('dialog')
  await finestra.getByLabel('Nome della saga').fill('Xenomorfi')
  await finestra.getByRole('checkbox', { name: /^Alien ·/ }).check()
  await finestra.getByRole('checkbox', { name: /^Aliens ·/ }).check()
  await finestra.getByRole('button', { name: 'Crea la saga' }).click()

  // Salvata come lista segnata saga, coi due film.
  await expect.poll(() => db.tables.user_lists.find((l) => l.name === 'Xenomorfi')?.come_saga).toBe(true)
  await expect.poll(() => db.tables.user_list_items.map((i) => i.tmdb_id).sort()).toEqual([348, 679])
  // Nell'elenco una cartella come le saghe di TMDB, e i film non più sparsi.
  const cartella = page.getByRole('button', { name: /^Xenomorfi ▸/ })
  await expect(cartella).toContainText('Saga · 2 film · 1979–1986')
  await expect(page.getByRole('button', { name: /Aliens\.1986\.mp4/ })).toHaveCount(0)

  // Si cambia: via Aliens, che torna al suo posto.
  await cartella.click()
  await page.getByRole('button', { name: '✎ Modifica la saga' }).click()
  // Si parte da quelli da aggiungere; per togliere, quelli nella saga.
  await page.getByRole('dialog').getByRole('button', { name: 'Nella saga (2)' }).click()
  await page.getByRole('dialog').getByRole('checkbox', { name: /^Aliens ·/ }).uncheck()
  await page.getByRole('dialog').getByRole('button', { name: 'Salva' }).click()
  await expect(page.getByRole('button', { name: /^Xenomorfi/ })).toContainText('Saga · 1 film')
  await expect(page.getByRole('button', { name: /Aliens\.1986\.mp4/ })).toBeVisible()

  // E si scioglie: i film restano, la saga no.
  await page.getByRole('button', { name: '✎ Modifica la saga' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Sciogli la saga' }).click()
  await expect(page.getByRole('button', { name: /^Xenomorfi/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Alien\.1979\.mp4/ })).toBeVisible()
  expect(db.tables.user_lists.some((l) => l.name === 'Xenomorfi')).toBe(false)
})

test('una saga si riempie coi film di uno studio, quelli che sono nella videoteca', async ({ page }) => {
  await mockCartella(page, { conSaga: true })
  const film = (drive_file_id: string, tmdb_id: number, titolo: string) => ({
    id: `s-${drive_file_id}`, user_id: E2E_USER.id, drive_file_id, nome_file: null, tmdb_id, media_type: 'movie', titolo,
    poster_path: `/poster-${tmdb_id}.jpg`, stagione: null, episodio: null, abbinato_a_mano: false, posizione: 0, durata: 7000, secondi_visti: 0, visto_il: null,
  })
  const db = await mockSupabase(page, {
    user_streaming: [film(ID['video-alien-1979'], 348, 'Alien'), film(ID['video-aliens-1986'], 679, 'Aliens')],
    user_lists: [],
    user_list_items: [],
  })
  await page.route('**/api/tmdb*', (route) => {
    const u = new URL(route.request().url())
    const path = u.searchParams.get('path') ?? ''
    if (path === '/search/company') return route.fulfill({ json: { results: [{ id: 401, name: 'Brandywine Productions', logo_path: null }] } })
    // Dello studio c'è Alien, non Aliens; e un film che nella cartella non c'è.
    if (path === '/discover/movie' && u.searchParams.get('with_companies') === '401') {
      return route.fulfill({ json: { results: [{ id: 348, title: 'Alien' }, { id: 8077, title: 'Alien³' }], total_pages: 1 } })
    }
    if (path === '/movie/348') return route.fulfill({ json: movieDetail(348, 'Alien', { release_date: '1979-05-25' }) })
    if (path === '/movie/679') return route.fulfill({ json: movieDetail(679, 'Aliens', { release_date: '1986-07-18' }) })
    return route.fallback()
  })

  await page.goto('/streaming')
  await collega(page)
  await page.getByRole('button', { name: '＋ Crea una saga' }).click()
  const finestra = page.getByRole('dialog')
  await finestra.getByLabel('Aggiungi i film di uno studio').fill('brandywine')
  await finestra.getByRole('button', { name: 'Aggiungi', exact: true }).click()
  await expect(finestra.getByRole('status')).toHaveText('Brandywine Productions: aggiunto 1 film.')
  await expect(finestra.getByLabel('Nome della saga')).toHaveValue('Brandywine Productions')
  await finestra.getByRole('button', { name: 'Crea la saga' }).click()

  await expect.poll(() => db.tables.user_list_items.map((i) => i.tmdb_id)).toEqual([348])
  await expect.poll(() => db.tables.user_lists.find((l) => l.name === 'Brandywine Productions')?.come_saga).toBe(true)
  await expect(page.getByRole('button', { name: /^Brandywine Productions ▸/ })).toContainText('Saga · 1 film')
})

test('gli extra dei film (le featurette) non compaiono come titoli, ma si contano', async ({ page }) => {
  // «Paprika (2006)/Featurettes/Restoring Paprika.mp4» compariva come un film, «Featurettes».
  await mockCartella(page, { conExtra: true })
  await page.goto('/streaming')
  await collega(page)

  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  await expect(page.getByText('1 extra (featurette, trailer, anteprime…) non è in elenco', { exact: false })).toBeVisible()
  await expect(page.getByText('Featurettes')).toHaveCount(0)
  await expect(page.getByText(/Making of Song of the Sea/)).toHaveCount(0)
})

test('riaprendo la videoteca l\u2019elenco dell\u2019ultima volta compare subito, e si aggiorna dalla cartella', async ({ page }) => {
  await mockCartella(page)
  // Come Chrome: riaperta la pagina, il permesso della cartella va ridato.
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
  await collega(page)
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /Copia dell’elenco/ })).toHaveCount(0)
  await page.reload()

  // Niente pagina vuota: i film di prima, e la pagina dice che è una copia.
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /Copia dell’elenco salvata oggi alle .*: premi «Aggiorna» per rileggere la cartella/ })).toBeVisible()

  await page.getByRole('button', { name: '📂 Riapri la cartella «Ciak»' }).click()
  await expect(page.getByRole('status').filter({ hasText: /Copia dell’elenco/ })).toHaveCount(0)
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
})

test('una cartella vuota spiega come riempirla', async ({ page }) => {
  await mockCartella(page, { vuota: true })
  await page.goto('/streaming')
  await collega(page)

  await expect(page.getByText(/Non ho trovato video nella cartella «Ciak»/)).toBeVisible()
})

test('lo streaming ha una voce sua nel menu', async ({ page }) => {
  await mockCartella(page)
  await page.goto('/')

  await page.getByRole('link', { name: '🎬 Streaming' }).first().click()
  await expect(page).toHaveURL(/\/streaming$/)
})

test('il vecchio indirizzo /drive porta alla sezione Streaming', async ({ page }) => {
  await page.goto('/drive')
  await expect(page).toHaveURL(/\/streaming$/)
})

test('un indirizzo di film non valido non finisce nel lettore', async ({ page }) => {
  await page.goto('/streaming/bad')
  await expect(page.getByText('Film non trovato')).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('i sottotitoli partono spenti e si scelgono dal menu CC, dalla tendina e col tasto C', async ({ page }) => {
  // Il menu del browser sta attaccato alla barra in basso: sul tablet,
  // toccando «Inglese», si chiudeva invece di sceglierlo, e sul telefono
  // finiva sotto i pulsanti di Ciak. Il <video> resta senza tracce, così quel
  // menu non c'è proprio: le battute le disegna Ciak (SottotitoliVideo).
  await conVideoFermo(page)
  await mockCartella(page, { sottotitoliNellaCartella: true })
  await page.route('**/api/sottotitoli', (route) => route.fulfill({ json: { candidati: [] } }))
  await apriSongOfTheSea(page)
  await expect(page.getByText(/Italiano · dalla cartella/)).toBeVisible()
  expect(await page.evaluate(() => document.querySelector('video')?.textTracks.length)).toBe(0)
  // I comandi sono quelli di Ciak, non del browser: il CC sta nella barra.
  await expect(page.locator('video')).not.toHaveAttribute('controls')
  const barra = page.getByTestId('barra-lettore')
  await expect(barra.getByRole('slider', { name: 'Avanzamento' })).toBeVisible()

  // Il video si guarda pulito: le battute compaiono solo se le si sceglie.
  const cc = page.getByRole('button', { name: /^Sottotitoli: / })
  await expect(cc).toHaveAccessibleName('Sottotitoli: nessuno. Cambia')
  await expect(cc).toHaveText('CC off')

  await cc.click()
  const menu = page.getByRole('group', { name: 'Sottotitoli' })
  await expect(menu.getByRole('button', { name: 'Nessuno' })).toHaveAttribute('aria-pressed', 'true')
  await menu.getByRole('button', { name: 'Italiano' }).click()
  await expect(menu).toBeHidden()
  await expect(cc).toHaveText('CC IT')
  await expect(page.getByRole('combobox', { name: 'Mostra' })).toHaveValue('0')

  // La dimensione delle battute si sceglie dallo stesso menu, e resta.
  await cc.click()
  await page.getByRole('group', { name: 'Dimensione dei sottotitoli' }).getByRole('button', { name: 'Molto grandi' }).click()
  expect(await page.evaluate(() => localStorage.getItem('ciak:sottotitoli-dimensione'))).toBe('3')
  await page.locator('body').click({ position: { x: 5, y: 5 } })

  // La scelta resta: riaprendo il film l'italiano c'è già, molto grande.
  await page.reload()
  await expect(cc).toHaveText('CC IT')
  await cc.click()
  await expect(page.getByRole('button', { name: 'Molto grandi' })).toHaveAttribute('aria-pressed', 'true')
  await page.locator('body').click({ position: { x: 5, y: 5 } })

  await page.getByRole('combobox', { name: 'Mostra' }).selectOption({ label: 'Nessun sottotitolo' })
  await expect(cc).toHaveText('CC off')

  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('c')
  await expect(cc).toHaveText('CC IT')
})

test('il lettore di Ciak usa il sottotitolo che sta nella cartella del film', async ({ page }) => {
  await conVideoFermo(page)
  await mockCartella(page, { sottotitoliNellaCartella: true })
  let ricercheOnline = 0
  await page.route('**/api/sottotitoli', (route) => {
    ricercheOnline++
    return route.fulfill({ json: { candidati: [] } })
  })

  await apriSongOfTheSea(page)

  // Il video arriva dal disco (qui, un file che resta in caricamento).
  await expect(page.locator('video')).toHaveAttribute('src', /\/video-fermo\/Song\.of\.the\.Sea/)
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.getByText(/Italiano · dalla cartella/)).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Mostra' })).toHaveValue('-1')
  await expect(page.getByRole('combobox', { name: 'Mostra' }).locator('option')).toHaveText(['Nessun sottotitolo', 'Italiano'])
  // L'italiano c'era già; per l'inglese, che manca, si è cercato online (senza esito).
  await expect.poll(() => ricercheOnline).toBe(1)
  await expect(page.getByText(/Nessun sottotitolo in inglese/)).toBeVisible()

})

test('la lingua dell’audio si sceglie dal menu Audio, e resta per il film dopo', async ({ page }) => {
  await conVideoFermo(page)
  await mockCartella(page, { conLingueAudio: true })
  await page.route('**/api/sottotitoli', (route) => route.fulfill({ json: { candidati: [] } }))
  await apriSongOfTheSea(page)

  const video = page.locator('video')
  const audio = page.getByTestId('audio-lingua')
  // Si parte dalla traccia dentro il video: nessun <audio> a parte.
  const menu = page.getByRole('button', { name: 'Audio: Inglese. Cambia lingua' })
  await expect(menu).toBeVisible()
  await expect(audio).toHaveCount(0)

  await menu.click()
  await page.getByRole('group', { name: "Lingua dell'audio" }).getByRole('button', { name: 'Italiano' }).click()
  // L'italiano arriva dal suo file accanto al video; il video tace.
  await expect(audio).toHaveAttribute('src', /^blob:/)
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true)
  await expect(page.getByRole('button', { name: 'Audio: Italiano. Cambia lingua' })).toBeVisible()

  // Il muto (tasto M) è quello della lingua che si sente.
  await page.keyboard.press('m')
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.muted)).toBe(true)
  await page.keyboard.press('m')
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.muted)).toBe(false)

  // Riaprendo il film l'italiano è già scelto.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Audio: Italiano. Cambia lingua' })).toBeVisible()
  await expect(audio).toHaveAttribute('src', /^blob:/)

  // Tornando all'inglese il video riprende la voce.
  await page.getByRole('button', { name: 'Audio: Italiano. Cambia lingua' }).click()
  await page.getByRole('group', { name: "Lingua dell'audio" }).getByRole('button', { name: 'Inglese' }).click()
  await expect(audio).toHaveCount(0)
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(false)
})

test('un film con una lingua sola non ha il menu Audio', async ({ page }) => {
  await conVideoFermo(page)
  await mockCartella(page, { sottotitoliNellaCartella: true })
  await page.route('**/api/sottotitoli', (route) => route.fulfill({ json: { candidati: [] } }))
  await apriSongOfTheSea(page)
  // La cartella è stata letta: il sottotitolo che sta lì è già nel menu CC.
  await expect(page.getByRole('button', { name: /^Sottotitoli/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Audio:/ })).toHaveCount(0)
})

test('senza sottotitoli nella cartella li cerca online, in italiano e in inglese, e li salva accanto al film', async ({ page }) => {
  await conVideoFermo(page)
  await mockCartella(page)
  const richieste: Record<string, unknown>[] = []
  await page.route('**/api/sottotitoli', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    richieste.push(body)
    if (body.azione === 'cerca') {
      return route.fulfill({
        json: {
          candidati: [
            { fileId: 111, lingua: 'it', nome: 'song.it.srt', download: 50, hash: true },
            { fileId: 222, lingua: 'en', nome: 'song.en.srt', download: 900, hash: false },
            { fileId: 333, lingua: 'it', nome: 'song2.it.srt', download: 10, hash: false },
          ],
        },
      })
    }
    return route.fulfill({ json: { testo: SRT, rimasti: 9 } })
  })

  await apriSongOfTheSea(page)

  // Due tracce, italiano e inglese, da una ricerca sola.
  await expect(page.getByText(/Italiano · da OpenSubtitles, salvato nella cartella/)).toBeVisible()
  await expect(page.getByText(/Inglese · da OpenSubtitles, salvato nella cartella/)).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Mostra' }).locator('option')).toHaveText(['Nessun sottotitolo', 'Italiano', 'Inglese'])
  // Il film si cerca per titolo e anno, e con l'hash del file per trovare
  // sottotitoli già sincronizzati (qui i pezzi sono zeri: resta la dimensione).
  expect(richieste.filter((r) => r.azione === 'cerca')).toHaveLength(1)
  expect(richieste[0]).toMatchObject({
    azione: 'cerca',
    query: 'Song of the Sea',
    anno: 2014,
    hash: peso('video-song-0001').toString(16).padStart(16, '0'),
  })
  expect(richieste.filter((r) => r.azione === 'scarica').map((r) => r.fileId)).toEqual([111, 222])
  // Salvati nella cartella del film, col nome del video e la lingua: la volta dopo ci sono già.
  const cartella = 'FILM/Song of the Sea (2014) [1080p]/'
  await expect.poll(() => fileSulDisco(page)).toEqual(
    expect.arrayContaining([`${cartella}Song.of.the.Sea.2014.1080p.it.srt`, `${cartella}Song.of.the.Sea.2014.1080p.en.srt`]),
  )

  // L'italiano fuori sincrono: si passa al candidato dopo della stessa lingua,
  // che prende il posto di quello scartato. L'inglese non ha alternative:
  // nessun pulsante.
  await page.getByRole('button', { name: 'Italiano fuori sincrono? Prova un altro' }).click()
  await expect(page.getByRole('button', { name: /Inglese fuori sincrono/ })).toHaveCount(0)
  await expect.poll(() => richieste.filter((r) => r.azione === 'scarica').map((r) => r.fileId)).toEqual([111, 222, 333])
  await expect.poll(() => fileSulDisco(page)).toContain(`${cartella}Song.of.the.Sea.2014.1080p.it.srt`)

  // Riaprendo il film non si cerca più niente: i due .srt sono accanto al video.
  const ricerchePrima = richieste.length
  await page.reload()
  await expect(page.getByText(/Italiano · dalla cartella/)).toBeVisible()
  await expect(page.getByText(/Inglese · dalla cartella/)).toBeVisible()
  expect(richieste.length).toBe(ricerchePrima)
})

test('se il browser non legge il file lo dice, col rimedio', async ({ page }) => {
  await conVideoFermo(page, 'illeggibile')
  await mockCartella(page, { sottotitoliNellaCartella: true })

  await apriSongOfTheSea(page)

  const avviso = page.getByRole('alert')
  await expect(avviso).toContainText('Il browser non riesce a leggere questo file')
  await expect(avviso).toContainText('prepara-ciak')
  // Nessun lettore di riserva: il rimedio è convertire il file.
  await expect(page.locator('iframe')).toHaveCount(0)
})

// ── Il lettore collegato all'archivio ─────────────────────────────────────────

const SONG = {
  id: 110416,
  media_type: 'movie',
  title: 'La canzone del mare',
  original_title: 'Song of the Sea',
  release_date: '2014-09-06',
  poster_path: '/song.jpg',
  genre_ids: [16],
}

// Il catalogo risponde alla ricerca con i risultati dati; tutto il resto al
// mock generale.
async function cercaTmdb(page: Page, risultati: unknown[], dettaglioTv?: Record<string, unknown>) {
  await page.route('**/api/tmdb*', (route) => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? ''
    if (path === '/search/multi') return route.fulfill({ json: { results: risultati } })
    if (dettaglioTv && /^\/tv\/\d+$/.test(path)) return route.fulfill({ json: dettaglioTv })
    // La scheda di un film: il titolo italiano è quello dei risultati di ricerca.
    const film = /^\/movie\/(\d+)$/.exec(path)
    if (film) {
      const r = risultati.find((x) => (x as { id: number }).id === Number(film[1])) as
        | { title: string; original_title?: string }
        | undefined
      if (r) return route.fulfill({ json: movieDetail(Number(film[1]), r.title, { original_title: r.original_title ?? r.title }) })
    }
    return route.fallback()
  })
}

// Finge che il video sia a un certo punto e scorra: il lettore vero, nel dev
// server senza film, non si muove da solo.
async function portaIlVideoA(page: Page, secondi: number, durata: number) {
  await page.evaluate(
    ([t, d]) => {
      const v = document.querySelector('video') as HTMLVideoElement
      Object.defineProperty(v, 'duration', { configurable: true, get: () => d })
      Object.defineProperty(v, 'paused', { configurable: true, get: () => false })
      Object.defineProperty(v, 'currentTime', { configurable: true, get: () => t, set: () => {} })
      v.dispatchEvent(new Event('timeupdate'))
    },
    [secondi, durata],
  )
}

test('maratona: si salta la sigla, poi la sigla finale, e l episodio dopo parte da solo restando a schermo intero', async ({ page }) => {
  await conVideoFermo(page)
  await mockCartella(page, { conShogun: true })
  const riga = (id: string, episodio: number) => ({
    user_id: E2E_USER.id,
    drive_file_id: id,
    nome_file: `Shogun.S01E0${episodio}.mkv`,
    tmdb_id: 126308,
    media_type: 'tv',
    titolo: 'Shōgun',
    stagione: 1,
    episodio,
    posizione: 0,
    durata: 3600,
    secondi_visti: 0,
    visto_il: null,
    // Il file di Song of the Sea fa da S1E1: scelto a mano, se no il
    // riconoscimento lo riporterebbe giustamente al suo film.
    abbinato_a_mano: true,
  })
  await mockSupabase(page, { user_streaming: [riga(ID['video-song-0001'], 1), riga(ID['video-shogun-02'], 2)] })
  await cercaTmdb(page, [], movieDetail(126308, 'Shōgun', { name: 'Shōgun' }))

  await page.goto('/streaming')
  await collega(page)
  await page.getByRole('button', { name: '▶ Inizia S1E1' }).click()
  await expect(page.getByRole('heading', { name: 'Shōgun · S1E1' })).toBeVisible()

  // Schermo intero di Ciak, dal ⛶ della sua barra: è la pagina, così passa
  // indenne all'episodio dopo.
  await page.getByRole('button', { name: 'Schermo intero' }).click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true)

  // La sigla iniziale: il video va avanti della durata scelta per la serie.
  await page.evaluate(() => {
    const v = document.querySelector('video') as HTMLVideoElement & { salto?: number }
    Object.defineProperty(v, 'duration', { configurable: true, get: () => 3600 })
    Object.defineProperty(v, 'currentTime', { configurable: true, get: () => 30, set: (t: number) => (v.salto = t) })
    v.dispatchEvent(new Event('timeupdate'))
  })
  // In alto sul video: in basso la barra dei comandi di Firefox, alta il
  // doppio di quella di Chrome, lo copriva.
  const salta = await page.getByRole('button', { name: '⏭ Salta sigla' }).boundingBox()
  const video = await page.locator('video').boundingBox()
  expect(salta && video && salta.y + salta.height < video.y + video.height / 2).toBe(true)
  await page.getByRole('button', { name: '⏭ Salta sigla' }).click()
  expect(await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement & { salto?: number }).salto)).toBe(120)
  await expect(page.getByRole('button', { name: '⏭ Salta sigla' })).toHaveCount(0)
  // La sigla finale: si può già passare all'episodio dopo, ma non parte da solo.
  await portaIlVideoA(page, 3500, 3600)
  const prossimo = page.getByRole('region', { name: 'Prossimo episodio' })
  await expect(prossimo.getByRole('button', { name: '⏭ Prossimo episodio: S1E2' })).toBeVisible()

  // Finito l'episodio, il conto alla rovescia e poi l'episodio dopo da solo.
  await page.evaluate(() => document.querySelector('video')?.dispatchEvent(new Event('ended')))
  await expect(prossimo.getByText(/S1E2 fra \d+ s/)).toBeVisible()
  await expect(page).toHaveURL(alLettore('video-shogun-02'), { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Shōgun · S1E2' })).toBeVisible()
  expect(await page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true)

  await page.getByRole('button', { name: 'Esci dallo schermo intero' }).click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull()

  // Uscendo dal lettore si esce anche dallo schermo intero.
  await page.keyboard.press('f')
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true)
  await page.goBack()
  await page.goBack()
  await expect(page).toHaveURL(/\/streaming$/)
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull()
})

test('un episodio ricodificato: il prossimo episodio è il file nuovo, che eredita «visto» dal vecchio', async ({ page }) => {
  // Lo script che ricodifica in H.264 carica il file nuovo e cancella il
  // vecchio: due righe per lo stesso S1E2, una con un id che nella cartella non c'è
  // più. Il lettore ci portava (404, fermo su 0:00) e la spunta restava là.
  await conVideoFermo(page)
  await mockCartella(page, { conShogun: true })
  const riga = (id: string, episodio: number, campi: Record<string, unknown> = {}) => ({
    user_id: E2E_USER.id,
    drive_file_id: id,
    nome_file: `Shogun.S01E0${episodio}.mkv`,
    tmdb_id: 126308,
    media_type: 'tv',
    titolo: 'Shōgun',
    stagione: 1,
    episodio,
    posizione: 0,
    durata: 3600,
    secondi_visti: 0,
    visto_il: null,
    abbinato_a_mano: true,
    ...campi,
  })
  const db = await mockSupabase(page, {
    user_streaming: [
      riga(ID['video-song-0001'], 1),
      // Prima la riga vecchia: senza il filtro era lei la «prossima».
      riga('shogun-02-vecchio', 2, { visto_il: '2026-10-01T20:00:00Z', posizione: 3500, secondi_visti: 3400 }),
      riga(ID['video-shogun-02'], 2),
    ],
  })
  await cercaTmdb(page, [], movieDetail(126308, 'Shōgun', { name: 'Shōgun' }))

  await page.goto('/streaming')
  await collega(page)
  // Il file nuovo prende i progressi di quello che ha sostituito.
  await expect
    .poll(() => (db.tables.user_streaming.find((r) => r.drive_file_id === ID['video-shogun-02']) as Record<string, unknown>).visto_il)
    .toBe('2026-10-01T20:00:00Z')

  // S1E2 ora risulta visto: si apre l'episodio 1 direttamente.
  await page.goto(`/streaming/${ID['video-song-0001']}`)
  await expect(page.getByRole('heading', { name: 'Shōgun · S1E1' })).toBeVisible()
  await videoA(page, 3480)
  await page.getByRole('button', { name: '⏭ Prossimo episodio: S1E2' }).click()
  await expect(page).toHaveURL(alLettore('video-shogun-02'))
})

test('un video tolto dalla cartella non porta più al lettore: niente «Guarda» nelle liste e nelle schede', async ({ page }) => {
  // The Secret of Kells restava con «Riprendi da 7:40» anche dopo averlo
  // cancellato dalla cartella: il pulsante portava a un file che non c'era più.
  const riga = (id: string, tmdb: number, titolo: string) => ({
    user_id: E2E_USER.id,
    drive_file_id: id,
    nome_file: `${titolo}.mp4`,
    tmdb_id: tmdb,
    media_type: 'movie',
    titolo,
    posizione: 0,
    durata: 4800,
    secondi_visti: 0,
    visto_il: null,
    abbinato_a_mano: false,
  })
  const daVedere = (id: string, tmdb: number, title: string) => ({
    id,
    user_id: E2E_USER.id,
    tmdb_id: tmdb,
    media_type: 'movie',
    title,
    poster_path: '/p.jpg',
    status: 'to_watch',
    is_favorite: false,
    personal_rating: null,
    genre_ids: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })
  await mockSupabase(page, {
    user_titles: [daVedere('t1', 110416, 'Song of the Sea'), daVedere('t2', 26963, 'The Secret of Kells')],
    // Song of the Sea è ancora nella cartella; il file di Kells no.
    user_streaming: [riga(ID['video-song-0001'], 110416, 'Song of the Sea'), riga(ID['video-kells-gone1'], 26963, 'The Secret of Kells')],
  })
  await mockCartella(page)
  await cercaTmdb(page, [SONG])

  // La videoteca legge la cartella e ricorda quali file ci sono.
  await page.goto('/streaming')
  await collega(page)
  await expect(page.getByText('Song of the Sea', { exact: true })).toBeVisible()

  await page.goto('/lists/watchlist')
  await expect(page.getByText('The Secret of Kells')).toBeVisible()
  const pulsanti = page.getByRole('link', { name: /▶ (Guarda|Riprendi)/ })
  await expect(pulsanti).toHaveCount(1)
  await expect(pulsanti).toHaveAttribute('href', `/streaming/${ID['video-song-0001']}`)
})

// Il video a un certo punto, ricordando dove lo si fa saltare (in `salto`).
async function videoA(page: Page, secondi: number, durata = 3600) {
  await page.evaluate(
    ([t, d]) => {
      const v = document.querySelector('video') as HTMLVideoElement & { salto?: number }
      Object.defineProperty(v, 'duration', { configurable: true, get: () => d })
      Object.defineProperty(v, 'paused', { configurable: true, get: () => false })
      Object.defineProperty(v, 'currentTime', { configurable: true, get: () => t, set: (n: number) => (v.salto = n) })
      v.dispatchEvent(new Event('timeupdate'))
    },
    [secondi, durata],
  )
}
// Il film che scorre col mouse fuori dal video: la barra dei comandi sparisce,
// e resta a schermo solo ciò che è fisso.
async function senzaComandi(page: Page) {
  await page.evaluate(() => document.querySelector('video')?.dispatchEvent(new Event('play')))
  await page.getByRole('button', { name: 'Pausa o riprendi' }).hover()
  await page.mouse.move(0, 0)
  // Sparita vuol dire trasparente: resta nella pagina per la dissolvenza.
  await expect(page.getByTestId('barra-lettore')).toHaveCSS('opacity', '0')
}
const saltoDelVideo = (page: Page) =>
  page.evaluate(() => (document.querySelector('video') as HTMLVideoElement & { salto?: number }).salto)

// La barra trascinata a un punto, come farebbe chi corregge un salto.
async function trascinaA(page: Page, secondi: number) {
  await videoA(page, secondi)
  await page.evaluate(() => document.querySelector('video')?.dispatchEvent(new Event('seeked')))
}

test('dove finisce la sigla Ciak lo impara da chi corregge il salto, e vale per tutti gli episodi', async ({ page }) => {
  await conVideoFermo(page)
  await mockCartella(page, { conShogun: true })
  const riga = (id: string, episodio: number) => ({
    user_id: E2E_USER.id,
    drive_file_id: id,
    nome_file: `Shogun.S01E0${episodio}.mkv`,
    tmdb_id: 126308,
    media_type: 'tv',
    titolo: 'Shōgun',
    stagione: 1,
    episodio,
    posizione: 0,
    durata: 3600,
    secondi_visti: 0,
    visto_il: null,
    abbinato_a_mano: true,
  })
  await mockSupabase(page, { user_streaming: [riga(ID['video-song-0001'], 1), riga(ID['video-shogun-02'], 2)] })
  await cercaTmdb(page, [], movieDetail(126308, 'Shōgun', { name: 'Shōgun' }))

  await page.goto('/streaming')
  await collega(page)
  await page.getByRole('button', { name: '▶ Inizia S1E1' }).click()
  const sigle = page.getByRole('region', { name: 'Sigle di questa serie' })
  await expect(sigle).toBeVisible()
  // Niente campi da scrivere: i tempi si imparano guardando.
  await expect(sigle.getByRole('textbox')).toHaveCount(0)
  await expect(sigle.getByText(/La prima volta premi «⏭ Salta sigla»/)).toBeVisible()

  // «Salta sigla» a 0:12 va avanti di un minuto e mezzo (la durata di base)…
  await videoA(page, 12)
  await page.getByRole('button', { name: 'Pausa o riprendi' }).hover()
  await page.getByRole('button', { name: '⏭ Salta sigla' }).click()
  expect(await saltoDelVideo(page)).toBe(102)
  // …ma era troppo: la barra trascinata a 0:55 insegna dove finisce davvero.
  await trascinaA(page, 55)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('ciak:punti-sigla:tv-126308')))
    .toBe('{"inizio":12,"fine":55,"coda":null}')
  await expect(sigle.getByText(/la sigla iniziale parte a 0:12 e finisce a 0:55/)).toBeVisible()

  // Alla sigla finale, scelto «passa subito»: il conto alla rovescia parte lì.
  await sigle.getByLabel('passa subito al prossimo episodio').check()
  await videoA(page, 3501)
  await page.getByRole('button', { name: '⏭ Prossimo episodio: S1E2' }).click()

  // Nell'episodio dopo «Salta sigla» arriva proprio alla fine imparata.
  await expect(page.getByRole('heading', { name: 'Shōgun · S1E2' })).toBeVisible()
  await videoA(page, 14)
  await page.getByRole('button', { name: 'Pausa o riprendi' }).hover()
  await page.getByRole('button', { name: '⏭ Salta sigla' }).click()
  expect(await saltoDelVideo(page)).toBe(55)
})

test('nella serie gli episodi che mancano nella cartella si vedono in grigio, al loro posto', async ({ page }) => {
  // Nella cartella ci sono S03E01 e S03E02 di South Park: TMDB dice che la
  // stagione 3 ne ha 4, e che c'è una stagione 4 di cui non c'è niente.
  await mockCartella(page, { conSerie: true })
  const riga = (id: string, episodio: number) => ({
    user_id: E2E_USER.id,
    drive_file_id: id,
    nome_file: `0${episodio} Episodio.mp4`,
    tmdb_id: 2190,
    media_type: 'tv',
    titolo: 'South Park',
    poster_path: '/sp.jpg',
    stagione: 3,
    episodio,
    posizione: 0,
    durata: 1320,
    secondi_visti: 0,
    visto_il: null,
    abbinato_a_mano: true,
  })
  await mockSupabase(page, { user_streaming: [riga(ID['video-sp-000301'], 1), riga(ID['video-sp-000302'], 2)] })
  await cercaTmdb(page, [], movieDetail(2190, 'South Park', {
    name: 'South Park',
    seasons: [
      { id: 3, season_number: 3, episode_count: 4, name: 'Stagione 3', poster_path: null, air_date: '1999-04-07' },
      { id: 4, season_number: 4, episode_count: 2, name: 'Stagione 4', poster_path: null, air_date: '2000-04-05' },
    ],
  }))

  await page.goto('/streaming')
  await collega(page)
  await page.getByRole('button', { name: /^South Park/ }).click()

  const stagione3 = page.getByRole('list', { name: 'Stagione 3' })
  await expect(stagione3.getByRole('listitem')).toHaveCount(4)
  await expect(stagione3.getByRole('listitem').nth(2)).toContainText('Ep. 3')
  await expect(stagione3.getByRole('listitem').nth(2)).toContainText('non nella cartella')
  await expect(page.getByText(/mancano gli ep\. 3 e 4/)).toBeVisible()
  await expect(page.getByText('Stagione 4 · 2 episodi, nessuno nella cartella')).toBeVisible()
  // Chiusa, la riga della serie lo dice: ne mancano 4 (due della 3, due della 4).
  await page.getByRole('button', { name: /^South Park/ }).click()
  await expect(page.getByText(/4 non nella cartella/)).toBeVisible()
})

test('con le caselle le sigle si saltano da sole, nel punto imparato saltandole a mano', async ({ page }) => {
  await conVideoFermo(page)
  await mockCartella(page, { conShogun: true })
  const riga = (id: string, episodio: number) => ({
    user_id: E2E_USER.id,
    drive_file_id: id,
    nome_file: `Shogun.S01E0${episodio}.mkv`,
    tmdb_id: 126308,
    media_type: 'tv',
    titolo: 'Shōgun',
    stagione: 1,
    episodio,
    posizione: 0,
    durata: 3600,
    secondi_visti: 0,
    visto_il: null,
    // Il file di Song of the Sea fa da S1E1: scelto a mano, se no il
    // riconoscimento lo riporterebbe giustamente al suo film.
    abbinato_a_mano: true,
  })
  await mockSupabase(page, {
    user_streaming: [riga(ID['video-song-0001'], 1), riga(ID['video-shogun-02'], 2), riga(ID['video-shogun-03'], 3)],
  })
  await cercaTmdb(page, [], movieDetail(126308, 'Shōgun', { name: 'Shōgun' }))

  await page.goto('/streaming')
  await collega(page)
  await page.getByRole('button', { name: '▶ Inizia S1E1' }).click()
  await expect(page.getByRole('heading', { name: 'Shōgun · S1E1' })).toBeVisible()

  await page.getByLabel('Salta sempre la sigla iniziale').check()
  await page.getByLabel('passa subito al prossimo episodio').check()
  expect(await page.evaluate(() => localStorage.getItem('ciak:salta-sigle'))).toBe('{"inizio":true,"fine":true}')
  // Il punto non si sa ancora: lo si dice, invece di non saltare niente in silenzio.
  await expect(page.getByText(/La prima volta premi «⏭ Salta sigla»/)).toBeVisible()

  // Episodio 1: le sigle si saltano a mano, e Ciak impara dove stanno.
  await videoA(page, 95)
  await page.getByRole('button', { name: '⏭ Salta sigla' }).click()
  expect(await saltoDelVideo(page)).toBe(185)
  await videoA(page, 3480)
  await page.getByRole('button', { name: '⏭ Prossimo episodio: S1E2' }).click()
  await expect(page).toHaveURL(alLettore('video-shogun-02'))
  expect(await page.evaluate(() => localStorage.getItem('ciak:punti-sigla:tv-126308'))).toBe('{"inizio":95,"fine":null,"coda":120}')
  // I tempi sono di questa serie, e si vedono: ognuna ha i suoi.
  await expect(page.getByText(/In questa serie la sigla iniziale parte a 1:35, la finale negli ultimi 2:00/)).toBeVisible()

  // Episodio 2: la sigla iniziale si salta da sola, passandoci sopra…
  await expect(page.getByRole('heading', { name: 'Shōgun · S1E2' })).toBeVisible()
  await videoA(page, 60)
  expect(await saltoDelVideo(page)).toBeUndefined()
  // Lontano dal punto imparato (1:35) il pulsante non resta fisso sul video…
  await senzaComandi(page)
  await expect(page.getByRole('button', { name: '⏭ Salta sigla' })).toHaveCount(0)
  // …ma toccando lo schermo c'è: la scena prima della sigla cambia da un
  // episodio all'altro, e in uno che la apre subito sparire del tutto voleva
  // dire non poterla saltare (L'attacco dei giganti, a 0:13).
  await page.getByRole('button', { name: 'Pausa o riprendi' }).hover()
  await expect(page.getByRole('button', { name: '⏭ Salta sigla' })).toBeVisible()
  await videoA(page, 95.25)
  expect(await saltoDelVideo(page)).toBe(185.25)
  // …e se il punto era sbagliato si torna indietro.
  await page.getByRole('button', { name: '↩ Rivedi la sigla' }).click()
  expect(await saltoDelVideo(page)).toBe(95.25)

  // La sigla finale: il conto alla rovescia parte da lì, senza aspettare la fine.
  await videoA(page, 3470)
  await expect(page.getByRole('button', { name: '⏭ Prossimo episodio: S1E3' })).toBeVisible()
  await expect(page.getByText(/S1E3 fra \d+ s/)).toHaveCount(0)
  await videoA(page, 3485)
  await expect(page.getByRole('region', { name: 'Prossimo episodio' }).getByText(/S1E3 fra \d+ s/)).toBeVisible()
  await expect(page).toHaveURL(alLettore('video-shogun-03'), { timeout: 15_000 })

  // Punti sbagliati? Si dimenticano e si reimparano saltando di nuovo a mano.
  await page.getByRole('button', { name: 'Reimpara' }).click()
  expect(await page.evaluate(() => localStorage.getItem('ciak:punti-sigla:tv-126308'))).toBe('{"inizio":null,"fine":null,"coda":null}')
  await expect(page.getByText(/La prima volta premi «⏭ Salta sigla»/)).toBeVisible()
})

test('con i tempi esatti di TheIntroDB la sigla si salta proprio dove c’è, episodio per episodio', async ({ page }) => {
  await conVideoFermo(page)
  await mockCartella(page, { conShogun: true })
  const riga = (id: string, episodio: number) => ({
    user_id: E2E_USER.id,
    drive_file_id: id,
    nome_file: `Shogun.S01E0${episodio}.mkv`,
    tmdb_id: 126308,
    media_type: 'tv',
    titolo: 'Shōgun',
    stagione: 1,
    episodio,
    posizione: 0,
    durata: 3600,
    secondi_visti: 0,
    visto_il: null,
    // Il file di Song of the Sea fa da S1E1: scelto a mano, se no il
    // riconoscimento lo riporterebbe giustamente al suo film.
    abbinato_a_mano: true,
  })
  await mockSupabase(page, { user_streaming: [riga(ID['video-song-0001'], 1), riga(ID['video-shogun-02'], 2)] })
  await cercaTmdb(page, [], movieDetail(126308, 'Shōgun', { name: 'Shōgun' }))
  // Il browser chiede direttamente a TheIntroDB, nel suo formato: da Vercel la
  // protezione anti-bot rispondeva 403.
  const chieste: string[] = []
  let riserva = 0
  await page.route('https://api.theintrodb.org/**', (route) => {
    const u = new URL(route.request().url())
    chieste.push(`${u.searchParams.get('tmdb_id')}-${u.searchParams.get('season')}-${u.searchParams.get('episode')}`)
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: { tmdb_id: 126308, type: 'tv', intro: [{ start_ms: 200_000, end_ms: 290_000 }], credits: [{ start_ms: 3_400_000, end_ms: null }] },
    })
  })
  await page.route('**/api/sigle*', (route) => {
    riserva++
    return route.fulfill({ json: { inizio: null, finale: null } })
  })
  // La serie ha già i suoi tempi imparati: con quelli esatti non servono.
  await page.addInitScript(() => {
    if (!localStorage.getItem('ciak:punti-sigla:tv-126308')) {
      localStorage.setItem('ciak:punti-sigla:tv-126308', JSON.stringify({ inizio: 4, coda: 120 }))
    }
  })

  await page.goto('/streaming')
  await collega(page)
  await page.getByRole('button', { name: '▶ Inizia S1E1' }).click()
  await expect(page.getByText(/i tempi esatti di TheIntroDB: sigla da 3:20 a 4:50, titoli di coda da 56:40/)).toBeVisible()
  expect(chieste).toEqual(['126308-1-1'])
  expect(riserva).toBe(0)
  // Con i tempi esatti quelli della serie non si usano, e non si mostrano.
  await expect(page.getByText(/In questa serie/)).toHaveCount(0)

  // Prima della sigla il pulsante non è fisso: questo episodio la ha a 3:20.
  await videoA(page, 60)
  await senzaComandi(page)
  await expect(page.getByRole('button', { name: '⏭ Salta sigla' })).toHaveCount(0)
  // Durante la sigla sì, anche senza toccare niente.
  await videoA(page, 230)
  await expect(page.getByRole('button', { name: '⏭ Salta sigla' })).toBeVisible()
  await page.getByRole('button', { name: '⏭ Salta sigla' }).click()
  expect(await saltoDelVideo(page)).toBe(290)
  // I tempi esatti non si «imparano» per la serie: restano quelli di prima.
  expect(await page.evaluate(() => localStorage.getItem('ciak:punti-sigla:tv-126308'))).toBe('{"inizio":4,"coda":120}')

  // Con «salta sempre» si salta da sola, passandoci sopra.
  await page.getByLabel('Salta sempre la sigla iniziale').check()
  await page.getByLabel('passa subito al prossimo episodio').check()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Shōgun · S1E1' })).toBeVisible()
  await expect(page.getByText(/i tempi esatti di TheIntroDB/)).toBeVisible()
  await videoA(page, 200.25)
  expect(await saltoDelVideo(page)).toBe(290)
  await expect(page.getByRole('button', { name: '↩ Rivedi la sigla' })).toBeVisible()

  // I titoli di coda partono a 56:40: lì il conto alla rovescia, non prima.
  await videoA(page, 3390)
  await expect(page.getByText(/S1E2 fra \d+ s/)).toHaveCount(0)
  await videoA(page, 3401)
  await expect(page.getByText(/S1E2 fra \d+ s/)).toBeVisible()
})

test('la lista riconosce i film della cartella e li mostra col titolo e la locandina', async ({ page }) => {
  const db = await mockSupabase(page)
  await mockCartella(page)
  await cercaTmdb(page, [SONG])

  await page.goto('/streaming')
  await collega(page)

  // Il file «Song.of.the.Sea.2014.1080p.mp4» è diventato il film di TMDB.
  await expect(page.getByText('Song of the Sea', { exact: true })).toBeVisible()
  await expect.poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === ID['video-song-0001'])).toMatchObject({
    tmdb_id: 110416,
    media_type: 'movie',
    titolo: 'Song of the Sea',
    nome_file: 'Song.of.the.Sea.2014.1080p.mp4',
  })
  // «B99» non somiglia abbastanza a niente: resta il nome del file, e la riga
  // senza titolo evita di ricercarlo a ogni apertura.
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  await expect
    .poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === ID['video-b99-00001']))
    .toMatchObject({ nome_file: 'B99 S7E2.mp4' })
  expect(db.tables.user_streaming?.find((r) => r.drive_file_id === ID['video-b99-00001'])?.tmdb_id).toBeUndefined()
})

test('la videoteca si cerca, si ordina e si filtra per genere', async ({ page }) => {
  await mockCartella(page)
  // Song of the Sea riconosciuto: la sua scheda dice anno (2020 nel finto
  // catalogo) e genere (Horror); B99 resta un file senza titolo.
  await cercaTmdb(page, [SONG])
  // La scheda in inglese, come la chiede Ciak per anno, generi e titoli da
  // cercare: l'italiano arriva solo dalle traduzioni.
  await page.route('**/api/tmdb*', (route) => {
    const u = new URL(route.request().url())
    if (u.searchParams.get('path') === '/movie/110416' && u.searchParams.get('language') === 'en-US') {
      return route.fulfill({
        json: movieDetail(110416, 'Song of the Sea', { translations: { translations: [{ iso_639_1: 'it', data: { title: 'La canzone del mare' } }] } }),
      })
    }
    return route.fallback()
  })

  await page.goto('/streaming')
  await collega(page)
  await expect(page.getByText('Song of the Sea', { exact: true })).toBeVisible()
  const righe = () => page.getByRole('list', { name: 'Video della videoteca' }).getByRole('listitem').allTextContents()

  // Ricerca: per titolo originale, per titolo italiano, per nome del file.
  const cerca = page.getByRole('searchbox', { name: 'Cerca nella videoteca' })
  await cerca.fill('song of the')
  await expect(page.getByText('B99 S7E2', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Song of the Sea', { exact: true })).toBeVisible()
  await expect(page.getByText('1 di 2')).toBeVisible()
  await cerca.fill('canzone del')
  await expect(page.getByText('Song of the Sea', { exact: true })).toBeVisible()
  await expect(page.getByText('1 di 2')).toBeVisible()
  await cerca.fill('s7e2')
  await expect(page.getByText('Song of the Sea', { exact: true })).toHaveCount(0)
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  await cerca.fill('nessun film così')
  await expect(page.getByText('Nessun video corrisponde alla ricerca o al genere scelto.')).toBeVisible()
  await cerca.fill('')

  // Genere: compaiono solo quelli presenti, col numero di titoli.
  const genere = page.getByRole('combobox', { name: 'Filtra per genere' })
  await expect(genere.locator('option', { hasText: 'Horror (1)' })).toHaveCount(1)
  await genere.selectOption({ label: 'Horror (1)' })
  await expect(page.getByText('B99 S7E2', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Song of the Sea', { exact: true })).toBeVisible()
  await genere.selectOption({ label: 'Tutti i generi' })

  // Ordine: per titolo, per anno (chi non ha l'anno in fondo), per arrivo nella cartella.
  const ordina = page.getByRole('combobox', { name: 'Ordina la videoteca' })
  await expect.poll(righe).toEqual([expect.stringContaining('B99 S7E2'), expect.stringContaining('Song of the Sea')])
  await ordina.selectOption({ label: 'Anno: più recenti' })
  await expect.poll(righe).toEqual([expect.stringContaining('Song of the Sea'), expect.stringContaining('B99 S7E2')])
  await expect(page.getByText(/^2020 · MP4/)).toBeVisible()
  await ordina.selectOption({ label: 'Aggiunti di recente' })
  await expect.poll(righe).toEqual([expect.stringContaining('B99 S7E2'), expect.stringContaining('Song of the Sea')])

  // L'ordine scelto resta alla visita successiva.
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Ordina la videoteca' })).toHaveValue('aggiunti')
})

test('le serie in cartelle di stagione prendono il nome della serie e vengono riconosciute', async ({ page }) => {
  // SERIE TV/South Park/Season 03/01 Rainforest Shmainforest.mp4: mostrava
  // «Season 03» e cercava «01 Rainforest Shmainforest». Il file era già stato
  // provato una volta senza successo: con il nome nuovo si riprova.
  const db = await mockSupabase(page, {
    user_streaming: [{ user_id: E2E_USER.id, drive_file_id: ID['video-sp-000301'], nome_file: '01 Rainforest Shmainforest.mp4', abbinato_a_mano: false, posizione: 0, secondi_visti: 0 }],
  })
  await mockCartella(page, { conSerie: true })
  const cercati: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    // Una ricerca sono due richieste, in italiano e in inglese: conta la prima.
    if (u.searchParams.get('path') === '/search/multi' && u.searchParams.get('language') === 'it-IT') cercati.push(u.searchParams.get('query') ?? '')
  })
  await cercaTmdb(page, [
    SONG,
    { id: 2190, media_type: 'tv', name: 'South Park', original_name: 'South Park', first_air_date: '1997-08-13', poster_path: '/sp.jpg', genre_ids: [16, 35] },
  ], movieDetail(2190, 'South Park', { name: 'South Park', original_name: 'South Park' }))

  // TMDB risponde solo dopo che la serie è stata aperta: è il momento in cui,
  // riconosciuta, la serie cambiava identità e la lista aperta si richiudeva
  // da sola (e il test, a seconda dei tempi, a volte falliva).
  let rispondi!: () => void
  const risposta = new Promise<void>((r) => (rispondi = r))
  await page.route('**/api/tmdb*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('path') === '/search/multi') await risposta
    return route.fallback()
  })

  await page.goto('/streaming')
  await collega(page)

  await expect(page.getByText('Season 03', { exact: true })).toHaveCount(0)
  // Ancora da riconoscere, gli episodi stanno già sotto la serie della cartella.
  const serie = page.getByRole('button', { name: /^South Park/ })
  await expect(serie).toBeVisible()
  await serie.click()
  const stagione3 = page.getByRole('list', { name: 'Stagione 3' })
  await expect(stagione3.getByText('01 Rainforest Shmainforest')).toBeVisible()
  await expect(stagione3.getByText('02 Spontaneous Combustion')).toBeVisible()

  // Riconosciuta mentre è aperta: arriva la locandina, e la lista resta aperta.
  rispondi()
  await expect(page.locator('img[src*="/sp.jpg"]')).toBeVisible()
  await expect(stagione3.getByText('01 Rainforest Shmainforest')).toBeVisible()
  await expect.poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === ID['video-sp-000301'])).toMatchObject({
    tmdb_id: 2190,
    media_type: 'tv',
    titolo: 'South Park',
    stagione: 3,
    episodio: 1,
  })
  await expect.poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === ID['video-sp-000302'])?.tmdb_id).toBe(2190)
  // Due episodi della stessa serie: una ricerca sola, non una per file.
  expect(cercati.filter((q) => q === 'South Park')).toHaveLength(1)
})

test('un episodio non ancora riconosciuto sta sotto la serie già riconosciuta, non in una seconda riga', async ({ page }) => {
  // Si vedevano due «South Park»: una coi 50 episodi abbinati a TMDB e una coi
  // 264 non ancora abbinati.
  const riga = (id: string, extra: Record<string, unknown>) => ({ user_id: E2E_USER.id, drive_file_id: id, abbinato_a_mano: false, posizione: 0, secondi_visti: 0, ...extra })
  const db = await mockSupabase(page, {
    user_streaming: [
      riga(ID['video-sp-000301'], { nome_file: '01 Rainforest Shmainforest.mp4', tmdb_id: 2190, media_type: 'tv', titolo: 'South Park', poster_path: '/sp.jpg', stagione: 3, episodio: 1 }),
      riga(ID['video-sp-000302'], { nome_file: '02 Spontaneous Combustion.mp4' }),
    ],
  })
  // Il secondo è già stato provato senza esito: la ricerca non si ripete
  // (e il titolo del primo è già stato controllato: niente richieste a TMDB).
  await page.addInitScript(
    ([id1, id2]) => {
      localStorage.setItem(`ciak:riconoscimento-v3:${id2}`, '1')
      localStorage.setItem(`ciak:titolo-originale-v3:${id1}`, '1')
    },
    [ID['video-sp-000301'], ID['video-sp-000302']],
  )
  await mockCartella(page, { conSerie: true })
  await cercaTmdb(page, [SONG])

  const cercati: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.searchParams.get('path') === '/search/multi') cercati.push(u.searchParams.get('query') ?? '')
  })

  await page.goto('/streaming')
  await collega(page)

  await expect(page.getByText('Song of the Sea', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^South Park/ })).toHaveCount(1)
  await page.getByRole('button', { name: /^South Park/ }).click()
  const stagione3 = page.getByRole('list', { name: 'Stagione 3' })
  await expect(stagione3.getByRole('listitem')).toHaveCount(2)

  // E nell'archivio eredita la serie dal fratello, senza cercarla di nuovo: la
  // scheda della serie proponeva «Guarda S1E2» perché S1E1, provato prima della
  // correzione per «Shingeki no Kyojin», era rimasto senza titolo.
  await expect.poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === ID['video-sp-000302'])).toMatchObject({
    tmdb_id: 2190,
    media_type: 'tv',
    titolo: 'South Park',
    stagione: 3,
    episodio: 2,
  })
  expect(cercati.filter((q) => q === 'South Park')).toHaveLength(0)
})

test('una serie dentro una raccolta («South Park Season 1 to 26 Mp4 1080p») si chiama South Park e viene riconosciuta', async ({ page }) => {
  // Si cercava «South Park Season 1 to 26 Mp4»: niente titolo, quindi niente
  // episodio dopo, niente «Salta sigla», niente spunta a fine episodio.
  const db = await mockSupabase(page, {
    user_streaming: [
      { user_id: E2E_USER.id, drive_file_id: ID['video-sp-r-0306'], nome_file: 'South Park S03E06.mp4', abbinato_a_mano: false, posizione: 0, secondi_visti: 0 },
    ],
  })
  // Già provato senza esito con la lettura vecchia dei nomi: si riprova.
  await page.addInitScript((id) => localStorage.setItem(`ciak:riconoscimento-v3:${id}`, '1'), ID['video-sp-r-0306'])
  await mockCartella(page, { conRaccolta: true })
  const sp = { id: 2190, media_type: 'tv', name: 'South Park', original_name: 'South Park', first_air_date: '1997-08-13', poster_path: '/sp.jpg', genre_ids: [16, 35] }
  await cercaTmdb(page, [SONG, sp], movieDetail(2190, 'South Park', { name: 'South Park', original_name: 'South Park' }))

  await page.goto('/streaming')
  await collega(page)
  await expect(page.getByRole('button', { name: /^South Park/ })).toBeVisible()
  await expect(page.getByText(/Season 1 to 26/)).toHaveCount(0)
  await expect.poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === ID['video-sp-r-0306'])).toMatchObject({
    tmdb_id: 2190,
    media_type: 'tv',
    stagione: 3,
    episodio: 6,
  })
})

test('un episodio visto fino in fondo prima di essere riconosciuto si spunta, e la scheda della serie lo sa subito', async ({ page }) => {
  // S3E6 guardato tutto quando ancora non si sapeva che fosse South Park:
  // niente spunta, e la videoteca diceva «Riprendi S3E6» (che ripartiva da capo).
  const db = await mockSupabase(page, {
    user_streaming: [
      {
        user_id: E2E_USER.id,
        drive_file_id: ID['video-sp-r-0306'],
        nome_file: 'South Park S03E06.mp4',
        abbinato_a_mano: false,
        posizione: 1320,
        durata: 1328,
        secondi_visti: 1300,
        visto_il: null,
      },
    ],
  })
  await page.addInitScript((id) => localStorage.setItem(`ciak:riconoscimento-v3:${id}`, '1'), ID['video-sp-r-0306'])
  await mockCartella(page, { conRaccolta: true })
  const sp = { id: 2190, media_type: 'tv', name: 'South Park', original_name: 'South Park', first_air_date: '1997-08-13', poster_path: '/sp.jpg', genre_ids: [16, 35] }
  await cercaTmdb(page, [SONG, sp], movieDetail(2190, 'South Park', { name: 'South Park', original_name: 'South Park' }))

  // Prima la scheda: il file non è ancora di nessuno, niente pulsante.
  await page.goto('/title/tv/2190')
  await expect(page.getByRole('heading', { name: 'South Park', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: /▶ (Guarda|Riprendi)/ })).toHaveCount(0)

  // La videoteca lo riconosce e, visto che era arrivato alla fine, lo spunta.
  await page.getByRole('link', { name: /Streaming/ }).first().click()
  await collega(page)
  await expect.poll(() => db.tables.user_episodes?.[0]).toMatchObject({ tv_id: 2190, season_number: 3, episode_number: 6 })
  await expect.poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === ID['video-sp-r-0306'])?.visto_il).toBeTruthy()
  await expect(page.getByText(/tutti visti/)).toBeVisible()

  // Tornando alla scheda senza ricaricare, il pulsante c'è già.
  await page.evaluate(() => {
    history.pushState({}, '', '/title/tv/2190')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('link', { name: /▶ Guarda S3E6/ })).toHaveAttribute('href', `/streaming/${ID['video-sp-r-0306']}`)
})

test('dalla videoteca si sceglie il titolo di una serie intera, e di un film', async ({ page }) => {
  // TMDB la chiama in un altro modo: Ciak da solo non la riconosce.
  const db = await mockSupabase(page)
  await mockCartella(page, { conSerie: true })
  const sp = { id: 2190, media_type: 'tv', name: 'Parco del Sud', original_name: 'Parco del Sud', first_air_date: '1997-08-13', poster_path: '/sp.jpg', genre_ids: [16, 35] }
  await cercaTmdb(page, [SONG, sp], movieDetail(2190, 'Parco del Sud', { name: 'Parco del Sud', original_name: 'Parco del Sud' }))

  await page.goto('/streaming')
  await collega(page)
  // «Da sistemare»: solo ciò che Ciak non ha riconosciuto. Song of the Sea sì.
  await expect(page.getByRole('listitem').filter({ hasText: 'Song of the Sea' }).getByRole('button', { name: 'Scegli il titolo' })).toBeVisible()
  await page.getByRole('button', { name: /⚠ Da sistemare/ }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Song of the Sea' }).getByRole('button', { name: 'Scegli il titolo' })).toHaveCount(0)
  await page.getByRole('button', { name: /^South Park/, expanded: false }).click()
  await page.getByRole('button', { name: '✎ Scegli il titolo della serie' }).click()

  const finestra = page.getByRole('dialog')
  await expect(finestra.getByText(/Vale per tutti i 2 file/)).toBeVisible()
  await finestra.getByRole('button', { name: 'Cerca', exact: true }).click()
  await finestra.getByRole('button', { name: /Parco del Sud/ }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect
    .poll(() => db.tables.user_streaming?.filter((r) => r.tmdb_id === 2190).map((r) => [r.drive_file_id, r.stagione, r.episodio, r.abbinato_a_mano]))
    .toEqual(
      expect.arrayContaining([
        [ID['video-sp-000301'], 3, 1, true],
        [ID['video-sp-000302'], 3, 2, true],
      ]),
    )
  // Sistemata, esce da «Da sistemare»; tutto il resto c'è ancora.
  await expect(page.getByRole('button', { name: /^Parco del Sud/ })).toHaveCount(0)
  await page.getByRole('button', { name: /⚠ Da sistemare/ }).click()
  await expect(page.getByRole('button', { name: /^Parco del Sud/ })).toBeVisible()

  // Un film: il ✎ accanto alla riga.
  await page.getByRole('listitem').filter({ hasText: 'Song of the Sea' }).getByRole('button', { name: 'Scegli il titolo' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cerca', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /La canzone del mare/ }).click()
  await expect.poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === ID['video-song-0001'])?.abbinato_a_mano).toBe(true)
})

test('un film finito sotto una serie di un altro anno torna il suo film', async ({ page }) => {
  // «Memories of Murder (2003)» compariva come «Gap Dong» (2014), una serie
  // con un episodio senza numero.
  const db = await mockSupabase(page, {
    user_streaming: [
      {
        user_id: E2E_USER.id,
        drive_file_id: ID['video-song-0001'],
        nome_file: 'Song.of.the.Sea.2014.1080p.mp4',
        tmdb_id: 61375,
        media_type: 'tv',
        titolo: 'Gap Dong',
        poster_path: '/gd.jpg',
        stagione: null,
        episodio: null,
        abbinato_a_mano: false,
        posizione: 0,
        durata: null,
        secondi_visti: 0,
        visto_il: null,
      },
    ],
  })
  await mockCartella(page)
  await cercaTmdb(page, [SONG])

  await page.goto('/streaming')
  await collega(page)
  await expect
    .poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === ID['video-song-0001']))
    .toMatchObject({ tmdb_id: 110416, media_type: 'movie', stagione: null, episodio: null })
  await expect(page.getByText('Gap Dong')).toHaveCount(0)
})

test('i webisodes di una serie sono i suoi speciali, anche quelli già presi per film', async ({ page }) => {
  // SERIE TV/The Office/Webisodes/The Accountants.mp4 compariva come film a
  // sé, e qualcuno era stato abbinato al film sbagliato («The Accountant»).
  const riga = (id: string, nome: string, campi: Record<string, unknown>) => ({
    user_id: E2E_USER.id,
    drive_file_id: id,
    nome_file: nome,
    abbinato_a_mano: false,
    posizione: 0,
    durata: null,
    secondi_visti: 0,
    visto_il: null,
    ...campi,
  })
  const db = await mockSupabase(page, {
    user_streaming: [
      riga(ID['video-sp-000301'], '01 Rainforest Shmainforest.mp4', { tmdb_id: 2190, media_type: 'tv', titolo: 'South Park', poster_path: '/sp.jpg', stagione: 3, episodio: 1 }),
      riga(ID['video-sp-000302'], '02 Spontaneous Combustion.mp4', { tmdb_id: 2190, media_type: 'tv', titolo: 'South Park', poster_path: '/sp.jpg', stagione: 3, episodio: 2 }),
      riga(ID['video-sp-web-01'], 'The Accountants.mp4', { tmdb_id: 302946, media_type: 'movie', titolo: 'The Accountant', poster_path: '/acc.jpg', stagione: null, episodio: null }),
    ],
  })
  await mockCartella(page, { conSerie: true, conWebisodes: true })
  await cercaTmdb(page, [SONG])

  await page.goto('/streaming')
  await collega(page)

  // Prende la serie dai fratelli già riconosciuti, come speciale (stagione 0),
  // senza cercare niente.
  await expect
    .poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === ID['video-sp-web-01']))
    .toMatchObject({ tmdb_id: 2190, media_type: 'tv', stagione: 0 })
  await expect(page.getByText('The Accountant', { exact: true })).toHaveCount(0)
  // Nella serie (col titolo che il controllo dei titoli le dà dal TMDB finto),
  // fra gli speciali.
  await page.getByRole('button', { name: /^(South Park|Titolo 2190)/ }).click()
  await expect(page.getByRole('list', { name: /Speciali/ }).getByText('The Accountants')).toBeVisible()
})

test('un webisode preso per film, in una serie non ancora riconosciuta, si ricerca come episodio', async ({ page }) => {
  const db = await mockSupabase(page, {
    user_streaming: [
      { user_id: E2E_USER.id, drive_file_id: ID['video-sp-web-01'], nome_file: 'The Accountants.mp4', tmdb_id: 302946, media_type: 'movie', titolo: 'The Accountant', poster_path: '/acc.jpg', stagione: null, episodio: null, abbinato_a_mano: false, posizione: 0, secondi_visti: 0 },
    ],
  })
  await mockCartella(page, { conSerie: true, conWebisodes: true })
  await cercaTmdb(page, [
    SONG,
    { id: 2190, media_type: 'tv', name: 'South Park', original_name: 'South Park', first_air_date: '1997-08-13', poster_path: '/sp.jpg', genre_ids: [16, 35] },
  ])
  await page.goto('/streaming')
  await collega(page)
  await expect
    .poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === ID['video-sp-web-01']))
    .toMatchObject({ tmdb_id: 2190, media_type: 'tv', stagione: 0 })
})

test('un anime con gli OAD e il nome romaji: una serie sola, riconosciuta dagli altri nomi del titolo', async ({ page }) => {
  // «Shingeki no Kyojin [10bits x265]/OADs/… OADE01 …» compariva come «OADs»,
  // un video alla volta, e la serie non si trovava: TMDB la chiama «L'attacco
  // dei giganti» / «進撃の巨人», e «Shingeki no Kyojin» sta fra gli altri nomi.
  const db = await mockSupabase(page)
  await mockCartella(page, { conAnime: true })
  const aot = { id: 1429, media_type: 'tv', name: "L'attacco dei giganti", original_name: '進撃の巨人', first_air_date: '2013-04-07', poster_path: '/aot.jpg', genre_ids: [16] }
  await cercaTmdb(page, [SONG, aot], movieDetail(1429, "L'attacco dei giganti", {
    name: "L'attacco dei giganti",
    original_name: '進撃の巨人',
    original_title: '進撃の巨人',
    seasons: [{ id: 1, season_number: 1, episode_count: 25, name: 'Stagione 1', poster_path: null, air_date: '2013-04-07' }],
  }))
  const altriNomi: string[] = []
  await page.route('**/api/tmdb*', (route) => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? ''
    if (path === '/tv/1429/alternative_titles') {
      altriNomi.push(path)
      return route.fulfill({ json: { id: 1429, results: [{ iso_3166_1: 'JP', title: 'Shingeki no Kyojin', type: 'romaji' }] } })
    }
    return route.fallback()
  })

  await page.goto('/streaming')
  await collega(page)

  const serie = page.getByRole('button', { name: /^L'attacco dei giganti/ })
  await expect(serie).toBeVisible()
  await expect(page.getByText('OADs', { exact: true })).toHaveCount(0)
  await serie.click()
  await expect(page.getByRole('list', { name: 'Stagione 1' }).getByText(/S01E04/)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Speciali' }).getByText(/OADE01/)).toBeVisible()
  // Il riassunto «S01E13.5» non è un secondo episodio 13: sta fra gli speciali.
  await expect(page.getByRole('list', { name: 'Speciali' }).getByText(/S01E13\.5/)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Stagione 1' }).getByText(/S01E13\.5/)).toHaveCount(0)
  await expect.poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === ID['video-snk-oad01'])).toMatchObject({
    tmdb_id: 1429,
    media_type: 'tv',
    stagione: 0,
    episodio: 1,
  })
  await expect.poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === ID['video-snk-s01e135'])).toMatchObject({
    tmdb_id: 1429,
    media_type: 'tv',
    stagione: 0,
    episodio: null,
  })
  // Gli altri nomi si chiedono una volta per serie, non per episodio.
  expect(altriNomi).toHaveLength(1)
})

test('un film nella cartella di un anime, fra gli «Altri episodi», si sceglie da solo ed esce dalla serie', async ({ page }) => {
  // «Cowboy Bebop/Knockin' on Heaven's Door» stava fra gli «Altri episodi» e la
  // serie restava «da sistemare»: il ✎ c'era solo per la serie intera.
  const db = await mockSupabase(page)
  await mockCartella(page, { conAnime: true, conFilmAnime: true })
  const aot = { id: 1429, media_type: 'tv', name: "L'attacco dei giganti", original_name: '進撃の巨人', first_air_date: '2013-04-07', poster_path: '/aot.jpg', genre_ids: [16] }
  const film = { id: 297266, media_type: 'movie', title: "L'attacco dei giganti - Il film: L'arco e la freccia cremisi", original_title: '劇場版 進撃の巨人 前編 紅蓮の弓矢', release_date: '2014-11-22', poster_path: '/arco.jpg', genre_ids: [16] }
  await cercaTmdb(page, [aot, film], movieDetail(1429, "L'attacco dei giganti", { name: "L'attacco dei giganti", original_name: '進撃の巨人', original_title: '進撃の巨人' }))
  await page.route('**/api/tmdb*', (route) => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? ''
    if (path === '/tv/1429/alternative_titles') {
      return route.fulfill({ json: { id: 1429, results: [{ iso_3166_1: 'JP', title: 'Shingeki no Kyojin', type: 'romaji' }] } })
    }
    return route.fallback()
  })

  await page.goto('/streaming')
  await collega(page)
  await expect(page.getByRole('button', { name: /^L'attacco dei giganti/ })).toBeVisible()
  await page.getByRole('button', { name: /⚠ Da sistemare/ }).click()
  await page.getByRole('button', { name: /^L'attacco dei giganti/, expanded: false }).click()
  const altri = page.getByRole('list', { name: 'Altri episodi' })
  await altri.getByRole('button', { name: /^Scegli il titolo di Shingeki no Kyojin Crimson Bow and Arrow/ }).click()

  const finestra = page.getByRole('dialog')
  await finestra.getByRole('button', { name: 'Cerca', exact: true }).click()
  await finestra.getByRole('button', { name: /L'arco e la freccia cremisi/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await expect.poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === ID['video-snk-film'])).toMatchObject({
    tmdb_id: 297266,
    media_type: 'movie',
    abbinato_a_mano: true,
  })
  // Il film esce dalla serie, che non ha più niente da sistemare.
  await expect(page.getByRole('list', { name: 'Altri episodi' })).toHaveCount(0)
  const serie = page.getByRole('button', { name: /^L'attacco dei giganti [▸▾]/ })
  await expect(serie).toHaveCount(0)
  await page.getByRole('button', { name: /⚠ Da sistemare/ }).click()
  await expect(serie).toBeVisible()
  await expect(page.getByText(/L'arco e la freccia cremisi/).first()).toBeVisible()
})

test('un mezzo episodio già salvato come S1E13 passa fra gli speciali, senza cercare di nuovo', async ({ page }) => {
  // «S01E13.5 - Since That Day» compariva come un secondo «Ep. 13».
  const riga = (id: string, extra: Record<string, unknown>) => ({ user_id: E2E_USER.id, drive_file_id: id, abbinato_a_mano: false, posizione: 0, secondi_visti: 0, tmdb_id: 1429, media_type: 'tv', titolo: "L'attacco dei giganti", poster_path: '/aot.jpg', ...extra })
  const db = await mockSupabase(page, {
    user_streaming: [
      riga(ID['video-snk-s01e04'], { nome_file: 'Shingeki no Kyojin - S01E04 - Night of the Graduation Ceremony.mp4', stagione: 1, episodio: 4 }),
      riga(ID['video-snk-oad01'], { nome_file: "Shingeki no Kyojin - OADE01 - Ilse's Notebook.mp4", stagione: 0, episodio: 1 }),
      riga(ID['video-snk-s01e135'], { nome_file: 'Shingeki no Kyojin - S01E13.5 - Since That Day.mp4', stagione: 1, episodio: 13 }),
    ],
  })
  await page.addInitScript((ids) => {
    for (const id of ids) localStorage.setItem(`ciak:titolo-originale-v3:${id}`, '1')
  }, [ID['video-snk-s01e04'], ID['video-snk-oad01'], ID['video-snk-s01e135']])
  await mockCartella(page, { conAnime: true })
  await cercaTmdb(page, [SONG])
  const cercati: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.searchParams.get('path') === '/search/multi') cercati.push(u.searchParams.get('query') ?? '')
  })

  await page.goto('/streaming')
  await collega(page)
  await page.getByRole('button', { name: /^L'attacco dei giganti/ }).click()
  await expect(page.getByRole('list', { name: 'Speciali' }).getByText(/S01E13\.5/)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Stagione 1' }).getByText(/S01E13\.5/)).toHaveCount(0)

  await expect.poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === ID['video-snk-s01e135'])).toMatchObject({
    tmdb_id: 1429,
    stagione: 0,
    episodio: null,
  })
  expect(cercati.filter((q) => /Shingeki/.test(q))).toHaveLength(0)
})

test('a fine film lo segna visto nel diario, lo toglie da «Da vedere» e chiede il voto', async ({ page }) => {
  await conVideoFermo(page)
  await mockCartella(page, { sottotitoliNellaCartella: true })
  const db = await mockSupabase(page, {
    user_titles: [
      { id: 't1', user_id: 'e2e-user-0000-0000-000000000000', tmdb_id: 110416, media_type: 'movie', title: 'La canzone del mare', status: 'to_watch', genre_ids: [] },
    ],
    user_streaming: [
      {
        id: 's1',
        user_id: 'e2e-user-0000-0000-000000000000',
        drive_file_id: ID['video-song-0001'],
        tmdb_id: 110416,
        media_type: 'movie',
        titolo: 'La canzone del mare',
        poster_path: '/song.jpg',
        posizione: 0,
        durata: 5640,
        // Quasi tutto già guardato in una sera precedente.
        secondi_visti: 5000,
        visto_il: null,
        abbinato_a_mano: false,
      },
    ],
  })

  await apriSongOfTheSea(page)
  await expect(page.getByRole('link', { name: 'Song of the Sea' })).toHaveAttribute('href', '/title/movie/110416')

  await portaIlVideoA(page, 5400, 5640)

  await expect(page.getByText('Segnato come visto nel diario, oggi')).toBeVisible()
  await expect.poll(() => db.tables.user_diary?.[0]).toMatchObject({ tmdb_id: 110416, media_type: 'movie', rating: null })
  await expect.poll(() => db.tables.user_titles.find((r) => r.tmdb_id === 110416)?.status).toBe('watched')
  await expect.poll(() => db.tables.user_streaming.find((r) => r.drive_file_id === ID['video-song-0001'])?.visto_il).toBeTruthy()

  await page.getByRole('button', { name: '4 stelle', exact: true }).click()
  await expect(page.getByText('Voto salvato.')).toBeVisible()
  await expect.poll(() => db.tables.user_diary?.[0]?.rating).toBe(4)
})

test('saltare alla fine senza averlo guardato non lo segna come visto', async ({ page }) => {
  await conVideoFermo(page)
  await mockCartella(page, { sottotitoliNellaCartella: true })
  const db = await mockSupabase(page, {
    user_streaming: [
      { id: 's1', user_id: 'e2e-user-0000-0000-000000000000', drive_file_id: ID['video-song-0001'], tmdb_id: 110416, media_type: 'movie', titolo: 'La canzone del mare', posizione: 0, durata: 5640, secondi_visti: 0, visto_il: null, abbinato_a_mano: false },
    ],
  })

  await apriSongOfTheSea(page)
  await expect(page.getByRole('link', { name: 'Song of the Sea' })).toBeVisible()
  await portaIlVideoA(page, 5500, 5640)
  await page.waitForTimeout(500)

  await expect(page.getByText('Segnato come visto nel diario')).toHaveCount(0)
  expect(db.tables.user_diary ?? []).toHaveLength(0)
})

test('riapre il film dal punto in cui ci si era fermati', async ({ page }) => {
  await conVideoFermo(page)
  await mockCartella(page, { sottotitoliNellaCartella: true })
  await mockSupabase(page, {
    user_streaming: [
      { id: 's1', user_id: 'e2e-user-0000-0000-000000000000', drive_file_id: ID['video-song-0001'], tmdb_id: 110416, media_type: 'movie', titolo: 'La canzone del mare', posizione: 1345, durata: 5640, secondi_visti: 1300, visto_il: null, abbinato_a_mano: false, updated_at: new Date().toISOString() },
    ],
  })

  await apriSongOfTheSea(page)
  await expect(page.getByRole('link', { name: 'Song of the Sea' })).toBeVisible()
  // I metadati del video arrivano: si riparte qualche secondo prima.
  await page.evaluate(() => document.querySelector('video')?.dispatchEvent(new Event('loadedmetadata')))

  // Sopra il video, per qualche secondo (a schermo intero il pannello sotto
  // non si vede), e nel pannello.
  await expect(page.getByRole('status').filter({ hasText: 'Ripreso da 22:20' })).toBeVisible()
  await expect(page.getByText(/Ripreso da 22:20 · Ricomincia/)).toBeVisible()
  await expect(page.getByRole('button', { name: "Ricomincia dall'inizio" })).toBeVisible()
  // Anche col mouse il clic sul video ferma e riprende: i comandi sono di Ciak.
  await expect(page.getByRole('button', { name: 'Pausa o riprendi' })).toBeVisible()
})

test('sul tablet in orizzontale lo schermo intero del browser diventa quello di Ciak, col tocco e i pulsanti', async ({ page }) => {
  // Girando il tablet (o col pulsante di Firefox) il browser mette a schermo
  // intero il solo <video>: sopra non restava niente, nemmeno il tocco per la
  // pausa. Qui il browser non concede quello della pagina senza un tocco.
  await page.addInitScript(() => {
    const originale = window.matchMedia.bind(window)
    window.matchMedia = (q: string) =>
      q === '(hover: none) and (pointer: coarse)' ? ({ ...originale(q), matches: true } as MediaQueryList) : originale(q)
    let attuale: Element | null = null
    Object.defineProperty(Document.prototype, 'fullscreenElement', { configurable: true, get: () => attuale })
    const w = window as unknown as { richieste: number; schermoInteroDelVideo: () => void }
    w.richieste = 0
    Document.prototype.exitFullscreen = function () {
      attuale = null
      document.dispatchEvent(new Event('fullscreenchange'))
      return Promise.resolve()
    }
    Element.prototype.requestFullscreen = function () {
      w.richieste++
      return Promise.reject(new TypeError('Permissions check failed'))
    }
    w.schermoInteroDelVideo = () => {
      attuale = document.querySelector('video')
      document.dispatchEvent(new Event('fullscreenchange'))
    }
  })
  await conVideoFermo(page)
  await mockCartella(page, { sottotitoliNellaCartella: true })
  await apriSongOfTheSea(page)
  await expect(page.locator('video')).toBeAttached()

  await page.evaluate(() => (window as unknown as { schermoInteroDelVideo: () => void }).schermoInteroDelVideo())

  // Il lettore occupa tutta la finestra, coi pulsanti di Ciak e il tocco.
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull()
  const riquadro = await page.locator('video').locator('..').boundingBox()
  // La finestra visibile, senza le barre di scorrimento.
  const finestra = await page.evaluate(() => ({ width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }))
  expect(riquadro?.width).toBe(finestra.width)
  expect(riquadro?.height).toBe(finestra.height)
  // Il primo tocco riprova lo schermo intero vero (questa volta col gesto).
  const prima = await page.evaluate(() => (window as unknown as { richieste: number }).richieste)
  await page.getByRole('button', { name: 'Pausa o riprendi' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { richieste: number }).richieste)).toBe(prima + 1)

  await page.getByRole('button', { name: 'Esci dallo schermo intero' }).click()
  await expect(page.getByRole('button', { name: 'Schermo intero', exact: true })).toBeVisible()
})

test('sul telefono un tocco sul video lo ferma e lo fa ripartire', async ({ page }) => {
  await page.addInitScript(() => {
    const originale = window.matchMedia.bind(window)
    window.matchMedia = (q: string) =>
      q === '(hover: none) and (pointer: coarse)' ? ({ ...originale(q), matches: true } as MediaQueryList) : originale(q)
    const w = window as unknown as { comandi: string[] }
    w.comandi = []
    HTMLMediaElement.prototype.play = function () {
      w.comandi.push('play')
      Object.defineProperty(this, 'paused', { configurable: true, get: () => false })
      return Promise.resolve()
    }
    HTMLMediaElement.prototype.pause = function () {
      w.comandi.push('pausa')
      Object.defineProperty(this, 'paused', { configurable: true, get: () => true })
    }
  })
  await conVideoFermo(page)
  await mockCartella(page, { sottotitoliNellaCartella: true })
  await apriSongOfTheSea(page)
  await expect(page.locator('video')).toBeAttached()
  const comandi = () => page.evaluate(() => (window as unknown as { comandi: string[] }).comandi.filter(Boolean))

  const strato = page.getByRole('button', { name: 'Pausa o riprendi' })
  await page.evaluate(() => document.querySelector('video')?.pause())
  await strato.click()
  await expect.poll(comandi).toEqual(['pausa', 'play'])
  await strato.click()
  await expect.poll(comandi).toEqual(['pausa', 'play', 'pausa'])
})

test('il lettore legge solo la riga del file e gli episodi della sua serie, non tutta la videoteca', async ({ page }) => {
  // Centinaia di righe a ogni episodio: sul telefono arrivavano dopo che il
  // film era già partito, e intanto il lettore non sapeva da dove riprendere.
  await conVideoFermo(page)
  await mockCartella(page, { conShogun: true })
  const riga = (id: string, episodio: number) => ({
    user_id: E2E_USER.id,
    drive_file_id: id,
    nome_file: `Shogun.S01E0${episodio}.mkv`,
    tmdb_id: 126308,
    media_type: 'tv',
    titolo: 'Shōgun',
    stagione: 1,
    episodio,
    posizione: 0,
    durata: 3600,
    secondi_visti: 0,
    visto_il: null,
    abbinato_a_mano: false,
  })
  await mockSupabase(page, {
    user_streaming: [riga(ID['video-shogun-01'], 1), riga(ID['video-shogun-02'], 2), { ...riga(ID['video-altro-0001'], 1), tmdb_id: 999, titolo: 'Altro' }],
  })
  await page.goto('/streaming')
  await collega(page)
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  // La videoteca ha finito di leggere l'archivio (a pagine: l'ultima richiesta,
  // quella vuota, arriva dopo): la serie ha il suo titolo. Contando prima, la
  // coda di quella lettura finiva fra le letture del lettore.
  await expect(page.getByRole('button', { name: /Shōgun/ })).toBeVisible()

  const letture: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'GET' && r.url().includes('/rest/v1/user_streaming')) letture.push(decodeURIComponent(r.url()))
  })
  await page.goto(`/streaming/${ID['video-shogun-01']}`)
  // Il prossimo episodio c'è: gli episodi della serie sono arrivati.
  await expect(page.getByRole('button', { name: /Prossimo episodio: S1E2/ })).toBeVisible()
  expect(letture.length).toBeGreaterThan(0)
  for (const url of letture) expect(url).toMatch(new RegExp(`drive_file_id=eq\\.${ID['video-shogun-01']}|tmdb_id=eq\\.126308`))
})

// Due episodi di Shōgun, già riconosciuti, e la cartella già collegata.
async function apriShogun(page: Page, initScript?: () => void) {
  if (initScript) await page.addInitScript(initScript)
  // Titoli già verificati: altrimenti la videoteca li ricontrolla in sottofondo
  // e il finto TMDB li rinomina a test in corso.
  await page.addInitScript((ids) => {
    for (const id of ids) localStorage.setItem(`ciak:titolo-originale-v3:${id}`, '1')
  }, [ID['video-shogun-01'], ID['video-shogun-02']])
  await conVideoFermo(page)
  await mockCartella(page, { conShogun: true, conShogunPrimo: true })
  const riga = (id: string, episodio: number) => ({
    user_id: E2E_USER.id,
    drive_file_id: id,
    nome_file: `Shogun.S01E0${episodio}.mkv`,
    tmdb_id: 126308,
    media_type: 'tv',
    titolo: 'Shōgun',
    poster_path: '/shogun.jpg',
    stagione: 1,
    episodio,
    posizione: 0,
    durata: 3600,
    secondi_visti: 0,
    visto_il: null,
    abbinato_a_mano: false,
  })
  await mockSupabase(page, { user_streaming: [riga(ID['video-shogun-01'], 1), riga(ID['video-shogun-02'], 2)] })
  await page.goto('/streaming')
  await collega(page)
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  await page.goto(`/streaming/${ID['video-shogun-01']}`)
  await expect(page.getByRole('button', { name: /Prossimo episodio: S1E2/ })).toBeVisible()
}

test('dalla tastiera: pausa, salti, schermo intero, sigla ed episodio dopo', async ({ page }) => {
  await apriShogun(page, () => {
    const w = window as unknown as { comandi: string[] }
    w.comandi = []
    HTMLMediaElement.prototype.play = function () {
      w.comandi.push('play')
      return Promise.resolve()
    }
    HTMLMediaElement.prototype.pause = function () {
      w.comandi.push('pausa')
    }
    Element.prototype.requestFullscreen = function () {
      w.comandi.push('schermo intero')
      return Promise.resolve()
    }
  })
  const comandi = () => page.evaluate(() => (window as unknown as { comandi: string[] }).comandi)
  await expect(page.getByText(/Dalla tastiera: spazio pausa/)).toBeVisible()

  // Il video è fermo (non carica): spazio lo fa partire.
  await page.keyboard.press(' ')
  await expect.poll(comandi).toEqual(['play'])
  await page.keyboard.press('f')
  await expect.poll(comandi).toEqual(['play', 'schermo intero'])

  // All'inizio dell'episodio S salta la sigla, le frecce di 10 secondi.
  await videoA(page, 30)
  await page.keyboard.press('ArrowRight')
  expect(await saltoDelVideo(page)).toBe(40)
  await page.keyboard.press('ArrowLeft')
  expect(await saltoDelVideo(page)).toBe(20)
  await page.keyboard.press('s')
  expect(await saltoDelVideo(page)).toBeGreaterThan(30)

  // Mentre si scrive i tasti restano al campo.
  await page.getByRole('button', { name: 'Non è questo?' }).click()
  await page.getByRole('textbox').first().fill('')
  await page.getByRole('textbox').first().pressSequentially('fn ')
  await expect(page.getByRole('textbox').first()).toHaveValue('fn ')
  expect(await comandi()).toEqual(['play', 'schermo intero'])
  await expect(page).toHaveURL(alLettore('video-shogun-01'))

  // N: l'episodio dopo.
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('n')
  await expect(page).toHaveURL(alLettore('video-shogun-02'))

  // P: di nuovo quello prima.
  await expect(page.getByRole('button', { name: 'Episodio precedente: S1E1', exact: true })).toBeVisible()
  await page.keyboard.press('p')
  await expect(page).toHaveURL(alLettore('video-shogun-01'))
})

test('nel lettore si torna all’episodio prima e si va a quello dopo, coi pulsanti della barra', async ({ page }) => {
  await apriShogun(page)
  // Dal primo episodio non c'è niente prima.
  await expect(page.getByRole('button', { name: 'Episodio precedente: S1E1', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Episodio successivo: S1E2' }).click()
  await expect(page).toHaveURL(alLettore('video-shogun-02'))

  await page.getByRole('button', { name: 'Episodio precedente: S1E1', exact: true }).click()
  await expect(page).toHaveURL(alLettore('video-shogun-01'))
  // Anche dal pannello sotto il video.
  await page.getByRole('button', { name: 'Episodio successivo: S1E2' }).click()
  await page.getByRole('button', { name: '◀ Episodio precedente: S1E1' }).click()
  await expect(page).toHaveURL(alLettore('video-shogun-01'))
})

test('sulla schermata di blocco del telefono: titolo, locandina, pausa ed episodio dopo', async ({ page }) => {
  await apriShogun(page, () => {
    const w = window as unknown as { azioni: Record<string, ((d?: unknown) => void) | null>; comandi: string[] }
    w.azioni = {}
    w.comandi = []
    navigator.mediaSession.setActionHandler = (azione, gestore) => {
      w.azioni[azione] = gestore as ((d?: unknown) => void) | null
    }
    HTMLMediaElement.prototype.pause = function () {
      w.comandi.push('pausa')
    }
  })
  await expect
    .poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title))
    .toBe('Shōgun · S1E1')
  expect(await page.evaluate(() => navigator.mediaSession.metadata?.artwork.map((a) => a.src))).toEqual([
    'https://image.tmdb.org/t/p/w185/shogun.jpg',
    'https://image.tmdb.org/t/p/w500/shogun.jpg',
  ])

  await page.evaluate(() => (window as unknown as { azioni: Record<string, () => void> }).azioni.pause())
  await expect.poll(() => page.evaluate(() => (window as unknown as { comandi: string[] }).comandi)).toEqual(['pausa'])

  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { azioni: Record<string, unknown> }).azioni.nexttrack)).toBe('function')
  await page.evaluate(() => (window as unknown as { azioni: Record<string, () => void> }).azioni.nexttrack())
  await expect(page).toHaveURL(alLettore('video-shogun-02'))
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe('Shōgun · S1E2')

  // «Indietro» dalla schermata di blocco: l'episodio prima.
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { azioni: Record<string, unknown> }).azioni.previoustrack)).toBe('function')
  await page.evaluate(() => (window as unknown as { azioni: Record<string, () => void> }).azioni.previoustrack())
  await expect(page).toHaveURL(alLettore('video-shogun-01'))
})

test('con l archivio lento riprende lo stesso, senza cancellare il punto salvato', async ({ page }) => {
  // Sul telefono l'archivio rispondeva dopo che il film era già partito: il
  // primo istante (0:00) si salvava subito sopra il punto buono, e dopo cinque
  // secondi di visione la ripresa non si applicava più. Si ricominciava da capo.
  await conVideoFermo(page)
  await mockCartella(page, { sottotitoliNellaCartella: true })
  const db = await mockSupabase(page, {
    user_streaming: [
      { id: 's1', user_id: E2E_USER.id, drive_file_id: ID['video-song-0001'], tmdb_id: 110416, media_type: 'movie', titolo: 'La canzone del mare', posizione: 1345, durata: 5640, secondi_visti: 1300, visto_il: null, abbinato_a_mano: false, updated_at: new Date(Date.now() - 3_600_000).toISOString() },
    ],
  })
  await page.route('**/rest/v1/user_streaming*', async (route) => {
    if (route.request().method() === 'GET') await new Promise((r) => setTimeout(r, 1500))
    return route.fallback()
  })

  await apriSongOfTheSea(page)
  await expect(page.locator('video')).toBeAttached()
  // Il film parte prima che l'archivio risponda, e scorre per qualche secondo.
  await page.evaluate(() => {
    const v = document.querySelector('video') as HTMLVideoElement & { salto?: number }
    let t = 0.2
    Object.defineProperty(v, 'readyState', { configurable: true, get: () => 4 })
    Object.defineProperty(v, 'duration', { configurable: true, get: () => 5640 })
    Object.defineProperty(v, 'paused', { configurable: true, get: () => false })
    Object.defineProperty(v, 'currentTime', { configurable: true, get: () => t, set: (n: number) => (v.salto = t = n) })
    v.dispatchEvent(new Event('loadedmetadata'))
    v.dispatchEvent(new Event('timeupdate'))
    t = 8
    v.dispatchEvent(new Event('timeupdate'))
  })

  await expect(page.getByText(/Ripreso da 22:20 · Ricomincia/)).toBeVisible()
  expect(await saltoDelVideo(page)).toBe(1340)
  const posizioni = db.writes.flatMap((w) => (w.table === 'user_streaming' ? w.body.map((r) => r.posizione) : []))
  expect(posizioni.filter((p) => typeof p === 'number' && p < 1000)).toEqual([])
})

test('«Non è questo?» fa scegliere il titolo a mano, e resta scelto', async ({ page }) => {
  await conVideoFermo(page)
  await mockCartella(page, { sottotitoliNellaCartella: true })
  const db = await mockSupabase(page)
  await cercaTmdb(page, [SONG, { ...SONG, id: 42, title: 'Song of the Sea (corto)', original_title: 'Song of the Sea (corto)', release_date: '2012-01-01' }])

  await apriSongOfTheSea(page)
  // La lista l'ha già riconosciuto come «Song of the Sea»: lo si corregge.
  await expect(page.getByRole('link', { name: 'Song of the Sea' })).toBeVisible()
  await page.getByRole('button', { name: 'Non è questo?' }).click()
  await page.getByRole('button', { name: 'Cerca', exact: true }).click()
  // Accanto al titolo italiano c'è quello originale: i file hanno quel nome.
  await expect(page.getByRole('button', { name: /La canzone del mare.*Song of the Sea/ })).toBeVisible()
  await page.getByRole('button', { name: /Song of the Sea \(corto\)/ }).click()

  await expect(page.getByRole('link', { name: 'Song of the Sea (corto)' })).toHaveAttribute('href', '/title/movie/42')
  await expect
    .poll(() => db.tables.user_streaming?.find((r) => r.drive_file_id === ID['video-song-0001']))
    .toMatchObject({ tmdb_id: 42, abbinato_a_mano: true })
})

test('a fine episodio lo spunta, mette la serie in corso e propone il prossimo', async ({ page }) => {
  await conVideoFermo(page)
  await mockCartella(page, { sottotitoliNellaCartella: true, conShogun: true })
  const riga = (id: string, episodio: number, extra: Record<string, unknown> = {}) => ({
    id,
    user_id: 'e2e-user-0000-0000-000000000000',
    drive_file_id: id,
    nome_file: `Shogun.S01E0${episodio}.mkv`,
    tmdb_id: 126308,
    media_type: 'tv',
    titolo: 'Shōgun',
    stagione: 1,
    episodio,
    posizione: 0,
    durata: 3600,
    secondi_visti: 0,
    visto_il: null,
    // Il file di Song of the Sea fa da S1E1: scelto a mano, se no il
    // riconoscimento lo riporterebbe giustamente al suo film.
    abbinato_a_mano: true,
    ...extra,
  })
  const db = await mockSupabase(page, {
    // Il file aperto è l'episodio 1 (l'id del film di prova), il 2 è un altro file.
    user_streaming: [riga(ID['video-song-0001'], 1, { secondi_visti: 3400 }), riga(ID['video-shogun-02'], 2)],
  })
  await cercaTmdb(page, [], movieDetail(126308, 'Shōgun', {
    name: 'Shōgun',
    seasons: [{ id: 1, season_number: 1, episode_count: 10, name: 'Stagione 1', poster_path: null, air_date: '2024-02-27' }],
  }))

  // Nella videoteca l'episodio sta sotto la sua serie: si parte da «▶ Inizia».
  await page.goto('/streaming')
  await collega(page)
  await page.getByRole('button', { name: '▶ Inizia S1E1' }).click()
  await expect(page).toHaveURL(alLettore('video-song-0001'))
  await expect(page.getByRole('link', { name: 'Shōgun · S1E1' })).toHaveAttribute('href', '/title/tv/126308?season=1&episode=1')
  await portaIlVideoA(page, 3500, 3600)

  await expect(page.getByText('Episodio S1E1 spuntato: Shōgun è in corso.')).toBeVisible()
  await expect.poll(() => db.tables.user_episodes?.[0]).toMatchObject({ tv_id: 126308, season_number: 1, episode_number: 1 })
  await expect.poll(() => db.tables.user_titles?.find((r) => r.tmdb_id === 126308)?.status).toBe('in_progress')

  await page.getByRole('button', { name: /Prossimo episodio: S1E2/ }).first().click()
  await expect(page).toHaveURL(alLettore('video-shogun-02'))
})

test('i titoli restano quelli originali del film, tradotti solo se illeggibili', async ({ page }) => {
  const db = await mockSupabase(page, {
    // Riconosciuto prima della correzione: col titolo tradotto.
    user_streaming: [
      { id: 's0', user_id: 'e2e-user-0000-0000-000000000000', drive_file_id: ID['video-b99-00001'], nome_file: 'B99 S7E2.mp4', tmdb_id: 48891, media_type: 'tv', titolo: 'Brooklyn 99 - Nove-Nove', stagione: 7, episodio: 2, posizione: 0, secondi_visti: 0, abbinato_a_mano: true },
    ],
  })
  await mockCartella(page)
  await page.route('**/api/tmdb*', (route) => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? ''
    // La ricerca in italiano restituisce il titolo tradotto…
    if (path === '/search/multi') return route.fulfill({ json: { results: [SONG] } })
    // …ma il film è «Song of the Sea», ed è quello che si guarda.
    if (path === '/tv/48891') return route.fulfill({ json: movieDetail(48891, 'Brooklyn 99 - Nove-Nove', { original_title: 'Brooklyn Nine-Nine' }) })
    return route.fallback()
  })

  await page.goto('/streaming')
  await collega(page)

  await expect(page.getByText('Song of the Sea', { exact: true })).toBeVisible()
  // L'episodio sta sotto la sua serie, che ha il titolo originale.
  await expect(page.getByRole('button', { name: /^Brooklyn Nine-Nine/ })).toBeVisible()
  await expect
    .poll(() => db.tables.user_streaming.find((r) => r.drive_file_id === ID['video-song-0001'])?.titolo)
    .toBe('Song of the Sea')
  await expect
    .poll(() => db.tables.user_streaming.find((r) => r.drive_file_id === ID['video-b99-00001'])?.titolo)
    .toBe('Brooklyn Nine-Nine')
})

test('un film che non parte (un MKV che il browser non apre) lo dice, col rimedio', async ({ page }) => {
  await page.clock.install()
  await conVideoFermo(page)
  await mockCartella(page, { sottotitoliNellaCartella: true })

  await apriSongOfTheSea(page)
  // Il file preso dal disco: da qui si aspetta che parta.
  await expect(page.locator('video')).toHaveAttribute('src', /video-fermo/)
  // Il video resta «in caricamento» senza mai dare errore: dopo 20 s si avvisa.
  await page.clock.runFor(21_000)

  const avviso = page.getByRole('alert')
  await expect(avviso).toContainText('Il film non parte')
  await expect(avviso).toContainText('Convertilo in MP4 con prepara-ciak')
})

test('le cartelle dentro Ciak diventano le schede della videoteca', async ({ page }) => {
  await mockCartella(page)
  await page.goto('/streaming')
  await collega(page)

  const schede = page.getByRole('tablist', { name: 'Categorie della videoteca' })
  await expect(schede.getByRole('tab')).toHaveText(['Tutto 2', 'Film 1', 'Serie TV 1'])

  // «FILM» è una categoria, non il titolo di un film: il file dentro una
  // cartella di categoria prende il suo nome, non «FILM».
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  await expect(page.getByText('FILM', { exact: true })).toHaveCount(0)

  await schede.getByRole('tab', { name: /Serie TV/ }).click()
  await expect(page.getByText('B99 S7E2', { exact: true })).toBeVisible()
  await expect(page.getByText('Song of the Sea (2014) [1080p]', { exact: true })).toHaveCount(0)

  // La scheda scelta resta scelta alla prossima apertura.
  await page.reload()
  await expect(page.getByRole('tab', { name: /Serie TV/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Song of the Sea (2014) [1080p]', { exact: true })).toHaveCount(0)
})

test('la videoteca e «Riprendi a guardare» dicono lo stesso: stessi visti, stesso episodio dopo', async ({ page }) => {
  // La Sala legge il diario degli episodi, la videoteca leggeva solo il
  // lettore: una serie spuntata dalla scheda risultava «0 visti» in videoteca,
  // e la Sala ripartiva dal primo buco invece che dopo l'ultimo visto.
  await mockCartella(page, { conShogun: true, conShogunPrimo: true })
  const riga = (chiave: string, episodio: number) => ({
    user_id: E2E_USER.id,
    drive_file_id: ID[chiave],
    nome_file: `Shogun.S01E0${episodio}.mp4`,
    tmdb_id: 126308,
    media_type: 'tv',
    titolo: 'Shōgun',
    poster_path: '/shogun.jpg',
    stagione: 1,
    episodio,
    posizione: 0,
    durata: 3600,
    secondi_visti: 0,
    visto_il: null,
    abbinato_a_mano: true,
  })
  await mockSupabase(page, {
    user_streaming: [riga('video-shogun-01', 1), riga('video-shogun-02', 2), riga('video-shogun-03', 3)],
    // Spuntato dalla scheda della serie, non nel lettore: il secondo, con il primo saltato.
    user_episodes: [{ id: 'e2', user_id: E2E_USER.id, tv_id: 126308, season_number: 1, episode_number: 2, watched_at: '2026-10-01T20:00:00Z' }],
  })
  await cercaTmdb(
    page,
    [],
    movieDetail(126308, 'Shōgun', {
      name: 'Shōgun',
      number_of_seasons: 1,
      number_of_episodes: 10,
      seasons: [{ id: 1, season_number: 1, episode_count: 10, name: 'Stagione 1', air_date: '2024-02-27' }],
    }),
  )

  await page.goto('/streaming')
  await collega(page)
  const serie = page.getByRole('button', { name: /^Shōgun/ })
  await expect(serie).toContainText('3 episodi · 1 visti')
  await expect(page.getByRole('button', { name: '▶ Continua S1E3' })).toBeVisible()

  await page.goto('/')
  const riprendi = page.locator('section', { hasText: 'Riprendi a guardare' }).first()
  await expect(riprendi.getByText('▶ S1 · E3')).toBeVisible()
  await expect(riprendi.getByRole('link', { name: '▶ Guarda S1E3' })).toHaveAttribute('href', `/streaming/${ID['video-shogun-03']}`)
})

test('dalla videoteca si spunta a mano un episodio visto, e si toglie la spunta', async ({ page }) => {
  await mockCartella(page, { conShogun: true, conShogunPrimo: true })
  const riga = (chiave: string, episodio: number, campi: Record<string, unknown> = {}) => ({
    user_id: E2E_USER.id,
    drive_file_id: ID[chiave],
    nome_file: `Shogun.S01E0${episodio}.mp4`,
    tmdb_id: 126308,
    media_type: 'tv',
    titolo: 'Shōgun',
    poster_path: '/shogun.jpg',
    stagione: 1,
    episodio,
    posizione: 0,
    durata: 3600,
    secondi_visti: 0,
    visto_il: null,
    abbinato_a_mano: true,
    ...campi,
  })
  const db = await mockSupabase(page, {
    // Il primo l'ha visto nel lettore, fino in fondo.
    user_streaming: [riga('video-shogun-01', 1, { visto_il: '2026-10-01T20:00:00Z', posizione: 3590, secondi_visti: 3500 }), riga('video-shogun-02', 2), riga('video-shogun-03', 3)],
    user_episodes: [{ id: 'e1', user_id: E2E_USER.id, tv_id: 126308, season_number: 1, episode_number: 1, watched_at: '2026-10-01T20:00:00Z' }],
  })
  await cercaTmdb(
    page,
    [],
    movieDetail(126308, 'Shōgun', {
      name: 'Shōgun',
      number_of_seasons: 1,
      number_of_episodes: 10,
      seasons: [{ id: 1, season_number: 1, episode_count: 10, name: 'Stagione 1', air_date: '2024-02-27' }],
    }),
  )

  await page.goto('/streaming')
  await collega(page)
  const serie = page.getByRole('button', { name: /^Shōgun/ })
  await expect(serie).toContainText('1 visti')
  await serie.click()

  // Il secondo l'ha visto altrove: lo spunta, e va nel diario della serie.
  await page.getByRole('button', { name: 'Visto: Shogun.S01E02' }).click()
  await expect(serie).toContainText('2 visti')
  await expect(page.getByRole('button', { name: '▶ Continua S1E3' })).toBeVisible()
  await expect.poll(() => db.tables.user_episodes.some((r) => r.episode_number === 2)).toBe(true)

  // Il primo non lo ricorda: tolta la spunta, va via dal diario e dal lettore.
  await page.getByRole('button', { name: 'Visto: Shogun.S01E01' }).click()
  await expect(serie).toContainText('1 visti')
  await expect.poll(() => db.tables.user_episodes.some((r) => r.episode_number === 1)).toBe(false)
  await expect
    .poll(() => (db.tables.user_streaming.find((r) => r.drive_file_id === ID['video-shogun-01']) as Record<string, unknown>).visto_il)
    .toBeNull()
})

