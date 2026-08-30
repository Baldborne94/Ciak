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

// L'app non parla più direttamente con TMDB: passa da /api/tmdb, che tiene la
// chiave lato server. I mock intercettano quindi il proxy, e il percorso TMDB
// arriva nel parametro `path`.
const PROXY = '**/api/tmdb*'
const SUPABASE = 'https://e2e-fake.supabase.co'

// Da usare in page.route() quando un test vuole intercettare una richiesta al
// catalogo per conto suo. Prima bastava filtrare per URL (`**/discover/**`):
// ora il percorso TMDB non è più nell'indirizzo, sta nel parametro `path`, e
// una rotta scritta alla vecchia maniera non aggancia più niente — in silenzio.
export const TMDB_PROXY = PROXY

// Il percorso TMDB e i parametri di una richiesta intercettata sul proxy.
export function tmdbRequest(route: Route): { path: string; params: URLSearchParams } {
  const url = new URL(route.request().url())
  return { path: url.searchParams.get('path') ?? '', params: url.searchParams }
}

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

  await page.route(PROXY, async (route: Route) => {
    const url = new URL(route.request().url())
    const path = url.searchParams.get('path') ?? ''
    const json = (body: unknown) => route.fulfill({ json: body })

    // Le Impostazioni lo usano per dire se il catalogo è configurato.
    if (path === '/configuration') return json({ images: {} })

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
  [table: string]: Row[]
}

export type Row = Record<string, unknown>

// Ciò che il test può ispezionare dopo aver cliccato: lo stato corrente delle
// tabelle (le scritture dell'app lo modificano davvero) e l'elenco delle
// scritture ricevute, per verificare *cosa* è stato salvato.
export interface SupabaseMock {
  tables: SupabaseTables
  writes: { table: string; method: string; body: Row[] }[]
}

// PostgREST codifica i filtri come "colonna=op.valore". Ne interpretiamo il
// sottoinsieme che l'app usa davvero, così una GET filtrata torna le righe
// giuste invece di tutta la tabella: senza questo, per esempio, la lista
// "Da vedere" mostrerebbe anche i titoli già visti.
const SKIP_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

function sameValue(actual: unknown, expected: string): boolean {
  if (expected === 'null') return actual === null || actual === undefined
  if (expected === 'true') return actual === true
  if (expected === 'false') return actual === false
  return String(actual) === expected
}

function matchesCondition(row: Row, column: string, spec: string): boolean {
  const [op, ...rest] = spec.split('.')
  const value = rest.join('.')
  const actual = row[column]
  switch (op) {
    case 'eq':
      return sameValue(actual, value)
    case 'neq':
      return !sameValue(actual, value)
    case 'is':
      return sameValue(actual, value)
    case 'not':
      // "not.is.null" → nega la condizione che segue.
      return !matchesCondition(row, column, value)
    case 'in': {
      const list = value.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, ''))
      return list.some((v) => sameValue(actual, v))
    }
    case 'gte':
      return String(actual) >= value
    case 'lte':
      return String(actual) <= value
    case 'gt':
      return String(actual) > value
    case 'lt':
      return String(actual) < value
    default:
      return true
  }
}

function matchesQuery(row: Row, params: URLSearchParams): boolean {
  for (const [key, spec] of params.entries()) {
    if (SKIP_PARAMS.has(key)) continue
    if (key === 'or') {
      // "or=(status.eq.to_watch,rewatch.eq.true)"
      const parts = spec.replace(/^\(|\)$/g, '').split(',')
      const anyMatch = parts.some((part) => {
        const [col, ...opRest] = part.split('.')
        return matchesCondition(row, col, opRest.join('.'))
      })
      if (!anyMatch) return false
      continue
    }
    if (!matchesCondition(row, key, spec)) return false
  }
  return true
}

function applyOrder(rows: Row[], params: URLSearchParams): Row[] {
  const order = params.get('order')
  if (!order) return rows
  const clauses = order.split(',').map((c) => {
    const [column, ...mods] = c.split('.')
    return { column, desc: mods.includes('desc'), nullsFirst: mods.includes('nullsfirst') }
  })
  return [...rows].sort((a, b) => {
    for (const { column, desc, nullsFirst } of clauses) {
      const av = a[column]
      const bv = b[column]
      const aNull = av === null || av === undefined
      const bNull = bv === null || bv === undefined
      if (aNull || bNull) {
        if (aNull && bNull) continue
        return (aNull ? 1 : -1) * (nullsFirst ? -1 : 1)
      }
      if (av === bv) continue
      const cmp = String(av) < String(bv) ? -1 : 1
      return desc ? -cmp : cmp
    }
    return 0
  })
}

let idCounter = 0

// Come Supabase, che tronca ogni risposta REST a max_rows (1000 di default).
// Il finto backend lo imita, altrimenti un test non potrebbe accorgersi di una
// query che dimentica di paginare.
const SUPABASE_MAX_ROWS = 1000

// Mock del backend Supabase: auth + tabelle REST (con filtri, ordinamenti e
// scritture che modificano lo stato) + funzioni RPC. Di default ogni tabella è
// vuota; passa `tables` (o `rpc`) per popolarle.
export async function mockSupabase(
  page: Page,
  tables: SupabaseTables = {},
  rpc: Record<string, unknown> = {},
): Promise<SupabaseMock> {
  const mock: SupabaseMock = { tables, writes: [] }

  await page.route(`${SUPABASE}/**`, async (route: Route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const params = url.searchParams

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

    if (!path.startsWith('/rest/v1/')) return route.fulfill({ json: {} })

    const table = path.replace('/rest/v1/', '').split('?')[0]
    const method = route.request().method()
    const headers = route.request().headers()
    const wantsObject = (headers['accept'] ?? '').includes('vnd.pgrst.object')
    mock.tables[table] ??= []
    const rows = mock.tables[table]

    const respond = (payload: Row[]) => {
      if (wantsObject) return route.fulfill({ json: payload[0] ?? null })
      return route.fulfill({ json: payload })
    }

    if (method === 'GET' || method === 'HEAD') {
      let found = rows.filter((r) => matchesQuery(r, params))
      found = applyOrder(found, params)
      // .range(from, to) di supabase-js viaggia come offset+limit, non come
      // header Range. Rispettarli è ciò che rende testabile il troncamento di
      // Supabase, che ha già nascosto titoli salvati dalle card.
      const offset = Number(params.get('offset') ?? '0')
      const limit = params.get('limit')
      found = found.slice(offset, limit ? offset + Number(limit) : undefined)
      // Il tetto del server, applicato comunque: è il comportamento che una
      // query senza paginazione non può aggirare.
      found = found.slice(0, SUPABASE_MAX_ROWS)
      // .select(…, { count: 'exact', head: true }) legge solo il totale.
      if ((headers['prefer'] ?? '').includes('count=')) {
        return route.fulfill({
          json: method === 'HEAD' ? [] : found,
          headers: { 'content-range': `0-${Math.max(0, found.length - 1)}/${found.length}` },
        })
      }
      return respond(found)
    }

    const raw = route.request().postDataJSON() as Row | Row[] | null
    const body: Row[] = raw == null ? [] : Array.isArray(raw) ? raw : [raw]
    mock.writes.push({ table, method, body })

    if (method === 'POST') {
      // upsert: on_conflict indica le colonne che identificano la riga.
      const conflict = params.get('on_conflict')?.split(',')
      const saved: Row[] = []
      for (const incoming of body) {
        const existing = conflict
          ? rows.find((r) => conflict.every((c) => String(r[c]) === String(incoming[c])))
          : undefined
        if (existing) {
          Object.assign(existing, incoming, { updated_at: new Date().toISOString() })
          saved.push(existing)
        } else {
          const created: Row = {
            id: `mock-${++idCounter}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...incoming,
          }
          rows.push(created)
          saved.push(created)
        }
      }
      return respond(saved)
    }

    if (method === 'PATCH') {
      const patch = body[0] ?? {}
      const touched = rows.filter((r) => matchesQuery(r, params))
      for (const r of touched) Object.assign(r, patch, { updated_at: new Date().toISOString() })
      return respond(touched)
    }

    if (method === 'DELETE') {
      const removed = rows.filter((r) => matchesQuery(r, params))
      mock.tables[table] = rows.filter((r) => !removed.includes(r))
      return respond(removed)
    }

    return respond([])
  })

  return mock
}

// Endpoint AI serverless (/api/*): risposte finte e istantanee, così le pagine
// che li usano sono testabili senza chiave Anthropic né consumo di crediti.
export async function mockAiApi(
  page: Page,
  responses: Record<string, unknown> = {},
): Promise<void> {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    // Il catalogo passa anch'esso da /api, ma lo serve mockTmdb: questa rotta è
    // registrata dopo e vincerebbe, lasciando le pagine senza film.
    if (path === '/api/tmdb') return route.fallback()
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
