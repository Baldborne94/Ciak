// ════════════════════════════════════════════════════════════════════
//  Serverless function (Vercel) — Raccomandazioni AI
//  Gira SERVER-SIDE: qui la ANTHROPIC_API_KEY non è mai esposta al browser.
//
//  Stato: stub per la Fase 6. La logica completa leggerà i titoli
//  preferiti/visti (passati dal client o letti via Supabase service role),
//  costruirà un prompt e chiamerà Anthropic per generare suggerimenti
//  con spiegazione personalizzata.
// ════════════════════════════════════════════════════════════════════

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'Metodo non consentito' }, 405)
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return json(
      { error: 'ANTHROPIC_API_KEY non configurata sul server.' },
      500,
    )
  }

  // TODO (Fase 6): leggere preferiti/visti + preferenze, costruire il prompt
  // e chiamare l'API Anthropic (modello consigliato: claude-sonnet-4-6).
  // Esempio di flusso previsto:
  //
  //   import Anthropic from '@anthropic-ai/sdk'
  //   const client = new Anthropic({ apiKey })
  //   const msg = await client.messages.create({
  //     model: 'claude-sonnet-4-6',
  //     max_tokens: 1024,
  //     messages: [{ role: 'user', content: buildPrompt(payload) }],
  //   })
  //
  return json(
    {
      status: 'not_implemented',
      message:
        'Raccomandazioni AI in arrivo nella Fase 6. La function è pronta e la chiave è server-side.',
    },
    501,
  )
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
