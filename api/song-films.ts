import Anthropic from '@anthropic-ai/sdk'

// Given a song, ask Claude in which films it was famously used (needle-drops,
// title themes, key scenes). Server-side only (ANTHROPIC_API_KEY).

interface RequestBody {
  song?: string
}

const SYSTEM_PROMPT = `Sei un esperto di musica nel cinema. Data una canzone, elenca i FILM
(reali ed esistenti) in cui è stata usata in modo memorabile: needle-drop, scena chiave,
tema, sigla o nei titoli di coda. Per ciascuno indica una breve descrizione dell'uso nel
film (la scena o il contesto). Includi l'anno del film quando lo conosci. Non inventare film.
Se la canzone è ambigua, considera la più famosa con quel titolo.`

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    films: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          year: { type: 'string' },
          scene: { type: 'string' },
        },
        required: ['title', 'scene'],
      },
    },
  },
  required: ['films'],
} as const

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
  const song = (body.song ?? '').trim()

  if (!song) {
    res.status(200).json({ films: [] })
    return
  }

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Canzone: "${song}"\nIn quali film è stata usata? Elencali con la scena/contesto.` },
      ],
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    })
    const textBlock = message.content.find((b) => b.type === 'text')
    const parsed = textBlock && 'text' in textBlock ? JSON.parse(textBlock.text) : { films: [] }
    res.status(200).json(parsed)
  } catch (err) {
    res.status(502).json({ error: `Errore nella ricerca per canzone: ${(err as Error).message}` })
  }
}
