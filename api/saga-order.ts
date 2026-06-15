import Anthropic from '@anthropic-ai/sdk'
import { guardAi } from './_lib/aiGuard'

// Given a movie saga and its films, ask Claude for the recommended
// chronological (story) viewing order. Server-side only (ANTHROPIC_API_KEY).

interface FilmInput {
  title: string
  year?: string | number
}

interface RequestBody {
  name?: string
  films?: FilmInput[]
}

const SYSTEM_PROMPT = `Sei un esperto di cinema. Data una saga e i suoi film, restituisci
l'ordine di visione CRONOLOGICO secondo la storia narrata (non l'ordine di uscita),
quando differisce. Per ogni film aggiungi una nota brevissima (es. "prequel",
"ambientato prima", "seguito diretto"). Usa ESATTAMENTE i titoli forniti in input.
Includi tutti i film ricevuti, una sola volta ciascuno.`

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    order: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['title', 'note'],
      },
    },
  },
  required: ['order'],
} as const

export const config = { maxDuration: 60 }

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
    res.status(503).json({ error: 'AI non configurata (manca ANTHROPIC_API_KEY lato server).' })
    return
  }

  const body: RequestBody =
    typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  const { name = '', films = [] } = body

  if (films.length === 0) {
    res.status(200).json({ order: [] })
    return
  }

  const guard = await guardAi(req as never, res as never)
  if (!guard) return

  const client = new Anthropic({ apiKey })
  const list = films.map((f) => (f.year ? `${f.title} (${f.year})` : f.title)).join('\n')
  const userPrompt = `Saga: ${name}\nFilm (ordine di uscita):\n${list}\n\nDammi l'ordine cronologico secondo la storia.`

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1536,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    })
    const textBlock = message.content.find((b) => b.type === 'text')
    const parsed = textBlock && 'text' in textBlock ? JSON.parse(textBlock.text) : { order: [] }
    res.status(200).json({ ...parsed, aiCreditsLeft: guard.creditsLeft })
  } catch (err) {
    const msg = (err as Error).message
    if (/credit balance is too low/i.test(msg)) {
      res.status(502).json({ error: 'Crediti AI esauriti: ricarica il saldo su Anthropic (Plans & Billing).' })
      return
    }
    res.status(502).json({ error: `Errore nel calcolare l'ordine: ${msg}` })
  }
}
