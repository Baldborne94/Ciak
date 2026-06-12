import Anthropic from '@anthropic-ai/sdk'

// Identify a film/series/anime from an uploaded image (scene, poster, character)
// using Claude's vision. Server-side only (ANTHROPIC_API_KEY).

interface RequestBody {
  image?: string // base64 (no data: prefix)
  mediaType?: string // image/jpeg | image/png | image/webp
}

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const SYSTEM_PROMPT = `Sei un esperto di cinema, serie TV e anime con enorme memoria visiva.
Ti viene mostrata un'immagine (fotogramma, locandina, personaggio, screenshot o un COLLAGE
con più titoli). Analizzala e restituisci:
1) "titles": TUTTI i film/serie/anime distinti che riconosci. Se è un collage con più opere,
   elencale tutte (una voce ciascuna). Se è una sola scena ambigua, metti fino a 3 ipotesi.
   Per ognuna: titolo (nome più conosciuto), anno se noto, tipo ("movie" o "tv"),
   confidenza ("alta"|"media"|"bassa"), e una motivazione brevissima (cosa riconosci).
2) "people": eventuali PERSONE riconoscibili (attori, registi). Per ognuna: nome,
   ruolo se evidente (es. "attore", "regista"), confidenza, e una motivazione.
Se non riconosci nulla in una categoria, restituisci lista vuota. Non inventare nomi/titoli.`

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    titles: {
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
    people: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
          confidence: { type: 'string', enum: ['alta', 'media', 'bassa'] },
          reason: { type: 'string' },
        },
        required: ['name', 'confidence', 'reason'],
      },
    },
  },
  required: ['titles', 'people'],
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
            { type: 'text', text: 'Identifica tutti i titoli e le persone riconoscibili nell\'immagine.' },
          ],
        },
      ],
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    })
    const textBlock = message.content.find((b) => b.type === 'text')
    const parsed =
      textBlock && 'text' in textBlock ? JSON.parse(textBlock.text) : { titles: [], people: [] }
    res.status(200).json(parsed)
  } catch (err) {
    res.status(502).json({ error: `Errore nell'identificare l'immagine: ${(err as Error).message}` })
  }
}
