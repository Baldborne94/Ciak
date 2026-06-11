import Anthropic from '@anthropic-ai/sdk'

// Identify a film/series/anime from an uploaded image (scene, poster, character)
// using Claude's vision. Server-side only (ANTHROPIC_API_KEY).

interface RequestBody {
  image?: string // base64 (no data: prefix)
  mediaType?: string // image/jpeg | image/png | image/webp
}

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const SYSTEM_PROMPT = `Sei un esperto di cinema, serie TV e anime con enorme memoria visiva.
Ti viene mostrata un'immagine (un fotogramma, una locandina, un personaggio o uno screenshot).
Identifica il titolo da cui proviene. Restituisci da 1 a 3 candidati ordinati dal più probabile,
ognuno con: titolo (nel suo nome più conosciuto), anno se lo sai, tipo ("movie" o "tv"),
confidenza ("alta" | "media" | "bassa") e una motivazione brevissima su COSA riconosci
(personaggio, scena, stile, locandina). Se non riconosci nulla con ragionevolezza, restituisci
una lista vuota. Non inventare titoli inesistenti.`

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          year: { type: 'string' },
          type: { type: 'string', enum: ['movie', 'tv'] },
          confidence: { type: 'string', enum: ['alta', 'media', 'bassa'] },
          reason: { type: 'string' },
        },
        required: ['title', 'type', 'confidence', 'reason'],
      },
    },
  },
  required: ['candidates'],
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
  const image = body.image ?? ''
  const mediaType = body.mediaType ?? 'image/jpeg'

  if (!image) {
    res.status(400).json({ error: 'Nessuna immagine ricevuta.' })
    return
  }
  if (!ALLOWED.has(mediaType)) {
    res.status(400).json({ error: 'Formato immagine non supportato.' })
    return
  }

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1536,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType as 'image/jpeg', data: image },
            },
            { type: 'text', text: 'Che film, serie o anime è? Elenca i candidati più probabili.' },
          ],
        },
      ],
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    })
    const textBlock = message.content.find((b) => b.type === 'text')
    const parsed = textBlock && 'text' in textBlock ? JSON.parse(textBlock.text) : { candidates: [] }
    res.status(200).json(parsed)
  } catch (err) {
    res.status(502).json({ error: `Errore nell'identificare l'immagine: ${(err as Error).message}` })
  }
}
