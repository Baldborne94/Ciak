import Anthropic from '@anthropic-ai/sdk'

// Given a song, ask Claude in which films it was famously used (needle-drops,
// title themes, key scenes). Server-side only (ANTHROPIC_API_KEY).

interface RequestBody {
  song?: string
}

const SYSTEM_PROMPT = `Sei un esperto di musica nel cinema. Data una canzone, individua i FILM
(reali ed esistenti) in cui è stata usata in modo memorabile: needle-drop, scena chiave,
tema, sigla o nei titoli di coda. USA LA RICERCA WEB per verificare gli utilizzi reali
(fonti come Tunefind, WhatSong, IMDb soundtracks) invece di affidarti solo alla memoria.

REGOLE FERREE:
- Considera ESCLUSIVAMENTE la canzone esatta indicata (titolo e, se c'è, artista).
- NON sostituirla con un'altra canzone o un altro artista, nemmeno se simili.
- Includi un film SOLO se proprio QUELLA canzone vi è usata, confermato da una fonte.
- Per ogni film: titolo esatto come su IMDb/TMDB, l'anno, e una breve descrizione dell'uso.
- Se non trovi utilizzi affidabili di QUELLA precisa canzone, restituisci lista vuota.

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo, nella forma:
{"films":[{"title":"Titolo","year":"2005","scene":"descrizione dell'uso"}]}
Se non trovi nulla, rispondi {"films":[]}.`

// Best-effort JSON extraction from a free-form model answer (web search adds
// citation text around the JSON, so we can't use strict structured outputs).
function extractFilms(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence ? fence[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) return { films: [] }
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return { films: [] }
  }
}

// Give the web-search round-trips room before Vercel kills the function.
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
  const song = (body.song ?? '').trim()

  if (!song) {
    res.status(200).json({ films: [] })
    return
  }

  const client = new Anthropic({ apiKey })

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [
      {
        role: 'user',
        content: `Canzone: "${song}"\nIn quali film è stata usata? Verifica con la ricerca web e rispondi solo col JSON.`,
      },
    ]

    // Web search is a server-side tool; the API may pause after several rounds.
    // Re-send the assistant turn to let it finish (bounded loop).
    // Sonnet + low effort + few searches keeps it fast and under the timeout.
    const baseReq = {
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      thinking: { type: 'adaptive' as const },
      output_config: { effort: 'low' as const },
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
    }
    let message = await client.messages.create({ ...baseReq, messages })
    let guard = 0
    while (message.stop_reason === 'pause_turn' && guard++ < 3) {
      messages.push({ role: 'assistant', content: message.content })
      message = await client.messages.create({ ...baseReq, messages })
    }

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
    res.status(200).json(extractFilms(text))
  } catch (err) {
    res.status(502).json({ error: `Errore nella ricerca per canzone: ${(err as Error).message}` })
  }
}
