import type { Page, Route } from '@playwright/test'
import {
  MOVIE_GENRES,
  TV_GENRES,
  browsePage,
  collectionDetail,
  labelForDiscover,
  movieDetail,
  personDetail,
  type RawMedia,
} from './fixtures'

// Intercetta TUTTE le chiamate esterne (TMDB, Supabase, immagini) così i test
// sono ermetici e deterministici: nessuna rete reale, nessuna chiave vera.

const TMDB = 'https://api.themoviedb.org/3'
const SUPABASE = 'https://e2e-fake.supabase.co'

export interface TmdbOverrides {
  // Risposte per endpoint, con la pagina di discover come parametro.
  trending?: RawMedia[]
  searchMulti?: RawMedia[]
  discover?: (page: number, params: URLSearchParams) => RawMedia[]
  discoverTotalPages?: number
  detail?: Record<string, unknown>
  season?: Record<string, unknown>
  person?: Record<string, unknown>
  personCredits?: Record<string, unknown>
  company?: Record<string, unknown>
  collection?: Record<string, unknown>
  searchPerson?: unknown[]
  searchCompany?: unknown[]
  searchCollection?: unknown[]
}

// Conta le chiamate a discover per verificare, ad esempio, che cambiare
// "Ordina" faccia ripartire la lista dalla pagina 1.
export interface TmdbCalls {
  discover: { page: number; sortBy: string | null; genres: string | null; label: string }[]
}

export async function mockTmdb(page: Page, over: TmdbOverrides = {}): Promise<TmdbCalls> {
  const calls: TmdbCalls = { discover: [] }

  await page.route(`${TMDB}/**`, async (route: Route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/3', '')
    const json = (body: unknown) => route.fulfill({ json: body })

    if (path === '/trending/all/week') {
      return json({ results: over.trending ?? [] })
    }
    if (path === '/search/multi') {
      return json({ results: over.searchMulti ?? [] })
    }
    if (path === '/search/keyword') {
      return json({ results: [{ id: 9001 }] })
    }
    if (path === '/genre/tv/list') return json({ genres: TV_GENRES })
    if (path === '/genre/movie/list') return json({ genres: MOVIE_GENRES })

    if (path.startsWith('/discover/')) {
      const p = Number(url.searchParams.get('page') ?? '1')
      const label = labelForDiscover(url.searchParams)
      // Solo la richiesta in italiano conta come "pagina caricata": l'app ne
      // fa sempre una seconda in inglese per i titoli leggibili.
      if (url.searchParams.get('language') !== 'en-US') {
        calls.discover.push({
          page: p,
          sortBy: url.searchParams.get('sort_by'),
          genres: url.searchParams.get('with_genres'),
          label,
        })
      }
      const results = over.discover
        ? over.discover(p, url.searchParams)
        : browsePage(label, p)
      return json({ results, total_pages: over.discoverTotalPages ?? 5, page: p })
    }

    // Dettaglio film/serie (con append_to_response) e le sue liste correlate.
    const detailMatch = /^\/(movie|tv)\/(\d+)$/.exec(path)
    if (detailMatch) {
      const id = Number(detailMatch[2])
      return json(over.detail ?? movieDetail(id, `Titolo ${id}`))
    }
    if (/\/(recommendations|similar)$/.test(path)) return json({ results: [] })
    if (/^\/tv\/\d+\/season\/\d+$/.test(path)) {
      return json(over.season ?? { episodes: [] })
    }

    // Persone, studi e saghe.
    const personMatch = /^\/person\/(\d+)$/.exec(path)
    if (personMatch) {
      return json(over.person ?? personDetail(Number(personMatch[1]), 'Regista Uno'))
    }
    if (/^\/person\/\d+\/combined_credits$/.test(path)) {
      return json(over.personCredits ?? { cast: [], crew: [] })
    }
    const companyMatch = /^\/company\/(\d+)$/.exec(path)
    if (companyMatch) {
      return json(
        over.company ?? { id: Number(companyMatch[1]), name: 'Studio Uno', logo_path: null },
      )
    }
    const collectionMatch = /^\/collection\/(\d+)$/.exec(path)
    if (collectionMatch) {
      return json(over.collection ?? collectionDetail(Number(collectionMatch[1])))
    }
    if (path.startsWith('/search/person')) return json({ results: over.searchPerson ?? [] })
    if (path.startsWith('/search/company')) return json({ results: over.searchCompany ?? [] })
    if (path.startsWith('/search/collection')) return json({ results: over.searchCollection ?? [] })

    // Qualsiasi altro endpoint TMDB: risposta vuota ma valida.
    return json({ results: [], genres: [], total_pages: 1 })
  })

  // Le immagini TMDB: 1x1 PNG trasparente, così niente richieste reali.
  await page.route('https://image.tmdb.org/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      ),
    }),
  )

  return calls
}

export interface SupabaseTables {
  [table: string]: unknown[]
}

// Mock del backend Supabase: auth + tabelle REST + funzioni RPC. Di default
// ogni tabella è vuota; passa `tables` (o `rpc`) per popolarle.
export async function mockSupabase(
  page: Page,
  tables: SupabaseTables = {},
  rpc: Record<string, unknown> = {},
): Promise<void> {
  await page.route(`${SUPABASE}/**`, async (route: Route) => {
    const url = new URL(route.request().url())
    const path = url.pathname

    if (path.startsWith('/auth/v1')) {
      if (path.endsWith('/user')) return route.fulfill({ json: E2E_USER })
      if (path.endsWith('/logout')) return route.fulfill({ status: 204, body: '' })
      return route.fulfill({ json: { user: E2E_USER } })
    }

    // Funzioni SECURITY DEFINER (es. watchlist pubblica di un altro utente).
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.replace('/rest/v1/rpc/', '')
      return route.fulfill({ json: rpc[fn] ?? [] })
    }

    if (path.startsWith('/rest/v1/')) {
      const table = path.replace('/rest/v1/', '').split('?')[0]
      const method = route.request().method()
      // Scritture: rispondiamo con l'eco della riga, come farebbe PostgREST.
      if (method !== 'GET') {
        const body = route.request().postDataJSON() as unknown
        return route.fulfill({ json: Array.isArray(body) ? body : [body] })
      }
      const rows = tables[table] ?? []
      // .maybeSingle()/.single() chiedono un oggetto, non un array.
      const accept = route.request().headers()['accept'] ?? ''
      if (accept.includes('vnd.pgrst.object')) {
        return route.fulfill({ json: rows[0] ?? null })
      }
      return route.fulfill({ json: rows })
    }

    return route.fulfill({ json: {} })
  })
}

// Endpoint AI serverless (/api/*): risposte finte e istantanee, così le pagine
// che li usano sono testabili senza chiave Anthropic né consumo di crediti.
export async function mockAiApi(
  page: Page,
  responses: Record<string, unknown> = {},
): Promise<void> {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    const preset: Record<string, unknown> = {
      '/api/tonight': { suggestions: [] },
      '/api/song-films': { films: [] },
      '/api/identify': { guesses: [] },
      '/api/saga-order': { order: [] },
    }
    return route.fulfill({
      json: { ...(responses[path] ?? preset[path] ?? {}), aiCreditsLeft: 3 },
    })
  })
}

export const E2E_USER = {
  id: 'e2e-user-0000-0000-000000000000',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'spettatore@ciak.test',
  app_metadata: {},
  user_metadata: {},
  created_at: '2024-01-01T00:00:00Z',
}

// Inietta una sessione valida nello storage PRIMA che l'app parta, così
// supabase-js si considera loggato senza passare dal form di login.
export async function signIn(page: Page): Promise<void> {
  await page.addInitScript(
    ({ user }) => {
      const session = {
        access_token: 'e2e-access-token',
        refresh_token: 'e2e-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        // Scadenza lontana: evita il refresh automatico (che sarebbe una
        // chiamata di rete non deterministica).
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
        user,
      }
      localStorage.setItem('sb-e2e-fake-auth-token', JSON.stringify(session))
    },
    { user: E2E_USER },
  )
}
