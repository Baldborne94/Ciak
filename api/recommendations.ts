import Anthropic from '@anthropic-ai/sdk'

// Vercel serverless function (Node runtime).
// The Anthropic key lives ONLY on the server — never prefixed with VITE_, so it
// is never bundled into the browser. The browser POSTs the user's favorite and
// watched titles; we ask Claude for personalised picks with an explanation each.

interface TitleSummary {
  title: string
  mediaType?: string
  year?: string | number
  genres?: string[]
}

interface RequestBody {
  favorites?: TitleSummary[]
  watched?: TitleSummary[]
  excludedGenres?: string[]
}

const SYSTEM_PROMPT = `Sei il curatore cinematografico di Ciak, un cinefilo appassionato.
Analizzi i titoli preferiti e già visti dall'utente per individuare pattern — generi
ricorrenti, registi amati, temi narrativi, periodi storici — e proponi nuovi titoli.
Per ogni suggerimento scrivi una spiegazione personalizzata e calorosa in italiano,
del tipo "Te lo consiglio perché ami X e Y, e questo titolo condivide…".
Suggerisci titoli reali ed esistenti. Non ripetere titoli già visti o già preferiti.`

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['title', 'reason'],
      },
    },
  },
  required: ['suggestions'],
} as const

function describe(titles: TitleSummary[] = []): string {
  if (titles.length === 0) return '(nessuno)'
  return titles
    .map((t) => {
      const parts = [t.title]
      if (t.year) parts.push(`(${t.year})`)
      if (t.genres?.length) parts.push(`— ${t.genres.join(', ')}`)
      return parts.join(' ')
    })
    .join('\n')
}

// Minimal Vercel-style handler signature, kept framework-agnostic.
interface ApiRequest {
  method?: string
  body?: RequestBody | string
}
interface ApiResponse {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metodo non consentito. Usa POST.' })
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(503).json({
      error:
        'Le raccomandazioni AI non sono ancora configurate (manca ANTHROPIC_API_KEY lato server).',
    })
    return
  }

  const body: RequestBody =
    typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})

  const { favorites = [], watched = [], excludedGenres = [] } = body

  if (favorites.length === 0 && watched.length === 0) {
    res.status(200).json({ suggestions: [] })
    return
  }

  const client = new Anthropic({ apiKey })

  const userPrompt = [
    `Titoli PREFERITI dell'utente:\n${describe(favorites)}`,
    `\nTitoli GIÀ VISTI:\n${describe(watched)}`,
    excludedGenres.length
      ? `\nGeneri da ESCLUDERE dai suggerimenti: ${excludedGenres.join(', ')}`
      : '',
    `\nProponi da 5 a 8 titoli nuovi, ciascuno con una spiegazione personalizzata.`,
  ].join('\n')

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    const parsed = textBlock && 'text' in textBlock ? JSON.parse(textBlock.text) : { suggestions: [] }
    res.status(200).json(parsed)
  } catch (err) {
    res.status(502).json({
      error: `Errore nel generare le raccomandazioni: ${(err as Error).message}`,
    })
  }
}
