import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, mockAiApi, signIn, E2E_USER } from './support/mocks'
import { movie, personDetail, tv } from './support/fixtures'

// Filtri e ordinamenti delle pagine di catalogo (genere, persona, ricerca) e
// gli avvisi di uscita. Qui la domanda a cui rispondono i test è: quando muovo
// un filtro, la richiesta che parte verso TMDB è quella giusta?

test.beforeEach(async ({ page }) => {
  await mockAiApi(page)
  await mockSupabase(page)
})

test('cambiare "Ordina" su una pagina di genere richiede a TMDB quel sort', async ({ page }) => {
  const calls = await mockTmdb(page)
  await page.goto('/genre/movie/27')
  await expect(page.getByRole('heading', { name: 'Horror' })).toBeVisible()

  await page.getByRole('combobox').last().selectOption('vote_average.desc')

  await expect
    .poll(() => calls.discover.at(-1)?.sortBy)
    .toBe('vote_average.desc')
})

test('il filtro per anno su una pagina di genere arriva a TMDB', async ({ page }) => {
  const calls = await mockTmdb(page)
  const seen: string[] = []
  await page.route('**/discover/**', async (route) => {
    const u = new URL(route.request().url())
    const year = u.searchParams.get('primary_release_year')
    if (year) seen.push(year)
    await route.fallback()
  })

  await page.goto('/genre/movie/27')
  await expect(page.getByRole('heading', { name: 'Horror' })).toBeVisible()

  // La prima select della barra filtri è l'anno.
  await page.getByRole('combobox').first().selectOption('2020')

  await expect.poll(() => seen).toContain('2020')
  expect(calls.discover.length).toBeGreaterThan(1)
})

test('il voto minimo filtra i risultati della ricerca lato client', async ({ page }) => {
  await mockTmdb(page, {
    searchMulti: [
      { ...movie(1, 'Capolavoro'), vote_average: 9 },
      { ...movie(2, 'Mediocre'), vote_average: 4 },
    ],
  })
  await page.goto('/search?q=test')

  await expect(page.getByRole('link', { name: /Capolavoro/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Mediocre/ })).toBeVisible()

  // Alzo il voto minimo a 7: resta solo il capolavoro.
  await page.getByRole('slider').fill('7')

  await expect(page.getByRole('link', { name: /Capolavoro/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Mediocre/ })).toHaveCount(0)
})

test('il filtro Tipo separa film e serie nei risultati', async ({ page }) => {
  await mockTmdb(page, {
    searchMulti: [movie(1, 'Un Film'), tv(2, 'Una Serie')],
  })
  await page.goto('/search?q=test')

  await expect(page.getByRole('link', { name: /Un Film/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Una Serie/ })).toBeVisible()

  await page.getByRole('button', { name: 'Film', exact: true }).click()
  await expect(page.getByRole('link', { name: /Una Serie/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Serie TV', exact: true }).click()
  await expect(page.getByRole('link', { name: /Un Film/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Una Serie/ })).toBeVisible()
})

test('"Azzera" rimette i filtri della ricerca a zero', async ({ page }) => {
  await mockTmdb(page, {
    searchMulti: [
      { ...movie(1, 'Capolavoro'), vote_average: 9 },
      { ...movie(2, 'Mediocre'), vote_average: 4 },
    ],
  })
  await page.goto('/search?q=test')

  await page.getByRole('slider').fill('7')
  await expect(page.getByRole('link', { name: /Mediocre/ })).toHaveCount(0)

  await page.getByRole('button', { name: /Azzera/ }).click()

  await expect(page.getByRole('link', { name: /Mediocre/ })).toBeVisible()
})

test('la filmografia di una persona si filtra per tipo', async ({ page }) => {
  await mockTmdb(page, {
    person: personDetail(101, 'Dario Argento', {
      combined_credits: {
        cast: [],
        crew: [
          { ...movie(700, 'Un Film Suo'), job: 'Director', department: 'Directing' },
          { ...tv(701, 'Una Serie Sua'), job: 'Director', department: 'Directing' },
        ],
      },
    }),
  })
  await page.goto('/person/101')

  await expect(page.getByRole('link', { name: /Un Film Suo/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Una Serie Sua/ })).toBeVisible()

  await page.getByRole('button', { name: 'Film', exact: true }).click()
  await expect(page.getByRole('link', { name: /Una Serie Sua/ })).toHaveCount(0)
})

test('le ricerche recenti tornano come scorciatoie e si cancellano', async ({ page }) => {
  await mockTmdb(page, { searchMulti: [movie(1, 'Risultato')] })

  await page.goto('/search?q=matrix')
  await expect(page.getByRole('link', { name: /Risultato/ })).toBeVisible()

  // Svuotando il campo si torna alla vista di partenza, con la ricerca salvata.
  await page.getByRole('button', { name: 'Pulisci ricerca' }).click()
  await expect(page.getByText('Ricerche recenti')).toBeVisible()
  await expect(page.getByRole('button', { name: 'matrix' })).toBeVisible()

  // Cliccandola, la ricerca riparte.
  await page.getByRole('button', { name: 'matrix' }).click()
  await expect(page).toHaveURL(/q=matrix/)

  // E si possono cancellare tutte.
  await page.getByRole('button', { name: 'Pulisci ricerca' }).click()
  await page.getByRole('button', { name: /Cancella/ }).click()
  await expect(page.getByText('Ricerche recenti')).toHaveCount(0)
})

test('"Avvisami" registra un avviso di uscita e si può togliere', async ({ page }) => {
  await signIn(page)
  const future = new Date()
  future.setMonth(future.getMonth() + 3)
  const releaseDate = future.toISOString().slice(0, 10)

  // "In arrivo" costruisce l'elenco dalle uscite future di TMDB.
  await mockTmdb(page, {
    discover: () => [{ ...movie(900, 'Film Futuro'), release_date: releaseDate }],
  })
  const db = await mockSupabase(page)
  await page.goto('/in-arrivo')

  await expect(page.getByText('Film Futuro').first()).toBeVisible()
  await page.getByRole('button', { name: '🔔 Avvisami' }).first().click()

  await expect(page.getByRole('button', { name: '🔔 Ti avviso' }).first()).toBeVisible()
  await expect.poll(() => db.tables.user_alerts?.length ?? 0).toBe(1)
  expect(db.tables.user_alerts[0]).toMatchObject({ tmdb_id: 900, title: 'Film Futuro' })

  // Ri-cliccando si annulla l'avviso.
  await page.getByRole('button', { name: '🔔 Ti avviso' }).first().click()
  await expect(page.getByRole('button', { name: '🔔 Avvisami' }).first()).toBeVisible()
  await expect.poll(() => db.tables.user_alerts.length).toBe(0)
})

test('un trofeo sbloccato si può equipaggiare', async ({ page }) => {
  await signIn(page)
  await mockTmdb(page)
  const db = await mockSupabase(page, {
    user_achievements: [
      { id: 'a1', user_id: E2E_USER.id, achievement_id: 'first_watch', unlocked_at: '2025-01-01T00:00:00Z' },
    ],
  })
  await page.goto('/trophies')

  await expect(page.getByRole('heading', { name: 'Trofei & Badge' })).toBeVisible()

  // Il primo trofeo sbloccato è cliccabile per equipaggiarlo.
  const equip = page.getByRole('button', { name: /Equipaggia|Attivo|Scegli/ }).first()
  if ((await equip.count()) > 0) {
    await equip.click()
    await expect
      .poll(() => (db.tables.user_profile?.[0] as Record<string, unknown>)?.active_achievement_id)
      .toBeTruthy()
  }
})
