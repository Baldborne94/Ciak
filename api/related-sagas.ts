import Anthropic from '@anthropic-ai/sdk'

// Given a saga and candidate collections (from TMDB recommendations, which
// are genre-based and can include unrelated franchises like Riddick for
// Alien), ask Claude which candidates truly belong to the same fictional
// universe (prequels, sequels, spin-offs, crossovers).

interface CandidateInput {
  id: number
  name: string
}

interface RequestBody {
  name?: string
  candidates?: CandidateInput[]
}

const SYSTEM_PROMPT = `Sei un esperto di cinema. Ti viene data una saga cinematografica e una
lista di collezioni candidate. Restituisci SOLO gli id delle collezioni che appartengono
allo STESSO universo narrativo della saga: prequel, sequel, spin-off, crossover o reboot
canonici (es. per "Alien": Prometheus, Alien vs Predator, Predator, Alien Romulus).
ESCLUDI le saghe semplicemente simili per genere o atmosfera ma di universi diversi
(es. per "Alien": Riddick, Pitch Black, Species NON appartengono all'universo di Alien).
Se nessuna candidata appartiene allo stesso universo, restituisci una lista vuota.`

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ids: {
      type: 'array',
      items: { type: 'integer' },
    },
  },
  required: ['ids'],
} as const

export const config = { maxDuration: 30 }

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
  const { name = '', candidates = [] } = body

  if (!name || candidates.length === 0) {
    res.status(200).json({ ids: [] })
    return
  }

  const client = new Anthropic({ apiKey })
  const list = candidates.map((c) => `${c.id}: ${c.name}`).join('\n')
  const userPrompt = `Saga: ${name}\nCollezioni candidate (id: nome):\n${list}\n\nQuali id appartengono allo stesso universo narrativo?`

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 512,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    })
    const textBlock = message.content.find((b) => b.type === 'text')
    const parsed = textBlock && 'text' in textBlock ? JSON.parse(textBlock.text) : { ids: [] }
    // Only return ids that were actually among the candidates.
    const valid = new Set(candidates.map((c) => c.id))
    const ids = Array.isArray(parsed.ids) ? parsed.ids.filter((id: number) => valid.has(id)) : []
    res.status(200).json({ ids })
  } catch (err) {
    const msg = (err as Error).message
    if (/credit balance is too low/i.test(msg)) {
      res.status(502).json({ error: 'Crediti AI esauriti: ricarica il saldo su Anthropic (Plans & Billing).' })
      return
    }
    res.status(502).json({ error: `Errore nel filtrare le saghe collegate: ${msg}` })
  }
}
