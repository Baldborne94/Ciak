import { test, expect } from '@playwright/test'
import { mockTmdb, mockSupabase, mockAiApi, signIn, E2E_USER } from './support/mocks'
import { browsePage } from './support/fixtures'

// Due garanzie che è facile perdere senza accorgersene, perché si vedono solo
// su schermo stretto o con un lettore di schermo:
//
// 1. nessuna pagina deve scorrere in orizzontale su un telefono;
// 2. ogni comando deve avere un nome pronunciabile — un pulsante che "dice"
//    solo 🔍 non è un pulsante, per chi non vede l'icona.

const TELEFONO = { width: 375, height: 667 } // iPhone SE, il più stretto in giro

const ROTTE = [
  '/',
  '/search',
  '/lists/watchlist',
  '/diario',
  '/statistiche',
  '/liste',
  '/profilo',
  '/genre/movie/27',
  '/title/movie/550',
  '/ai?tab=tonight',
]

function savedRow(tmdbId: number, title: string, status = 'watched') {
  return {
    id: `row-${tmdbId}`,
    user_id: E2E_USER.id,
    tmdb_id: tmdbId,
    media_type: 'movie',
    title,
    poster_path: '/p.jpg',
    status,
    is_favorite: false,
    personal_rating: 4,
    notes: null,
    watched_at: '2025-03-01T00:00:00Z',
    genre_ids: [27],
    rewatch: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  }
}

test.describe('su schermo da telefono', () => {
  test.use({ viewport: TELEFONO })

  test.beforeEach(async ({ page }) => {
    await signIn(page)
    await mockTmdb(page, {
      trending: browsePage('Tendenza', 1),
      discover: () => browsePage('Scoperta', 1),
      searchMulti: browsePage('Ricerca', 1),
    })
    await mockAiApi(page)
    await mockSupabase(page, {
      user_titles: [savedRow(550, 'Fight Club'), savedRow(551, 'Heat', 'to_watch')],
    })
  })

  for (const rotta of ROTTE) {
    test(`${rotta} non scorre in orizzontale`, async ({ page }) => {
      await page.goto(rotta)
      // Aspetta che il contenuto sia montato, non solo la risposta HTTP.
      await page.waitForLoadState('networkidle')

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement
        if (doc.scrollWidth <= doc.clientWidth) return null
        // Trova il primo elemento che sborda: dire "la pagina scorre" senza
        // dire *cosa* la fa scorrere renderebbe il test inutile da diagnosticare.
        const colpevoli: string[] = []
        for (const el of Array.from(document.querySelectorAll('*'))) {
          const r = el.getBoundingClientRect()
          if (r.right > doc.clientWidth + 1 && r.width > 0) {
            colpevoli.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 60)}`)
            if (colpevoli.length >= 3) break
          }
        }
        return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, colpevoli }
      })

      expect(overflow, `${rotta} sborda in larghezza: ${JSON.stringify(overflow)}`).toBeNull()
    })
  }
})

test.describe('nomi accessibili', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
    await mockTmdb(page, { searchMulti: browsePage('Ricerca', 1) })
    await mockSupabase(page, { user_titles: [] })
  })

  for (const rotta of ['/search', '/genre/movie/27', '/lists/watchlist']) {
    test(`ogni comando di ${rotta} ha un nome pronunciabile`, async ({ page }) => {
      await page.goto(rotta)
      await page.waitForLoadState('networkidle')

      const muti = await page.evaluate(() => {
        const soloIcone = /^[\s\p{Extended_Pictographic}←-⇿✀-➿×✕]*$/u
        const out: string[] = []
        const controlli = document.querySelectorAll('button, select, input:not([type="hidden"]), a[href]')
        for (const el of Array.from(controlli)) {
          const nome =
            el.getAttribute('aria-label') ??
            el.getAttribute('title') ??
            el.getAttribute('placeholder') ??
            // Per un <select> il testo interno sono le opzioni, non un nome:
            // il lettore di schermo legge solo quella scelta.
            (el instanceof HTMLSelectElement ? '' : (el.textContent ?? ''))
          if (soloIcone.test(nome.trim())) {
            out.push(`${el.tagName.toLowerCase()}: ${(el.textContent ?? '').trim().slice(0, 20) || '(vuoto)'}`)
          }
        }
        return out
      })

      expect(muti, `comandi senza nome pronunciabile: ${muti.join(' | ')}`).toEqual([])
    })
  }
})
