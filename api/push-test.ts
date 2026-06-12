import webpush from 'web-push'

// Sends a test Web Push to the subscription provided by the client, so the user
// can verify notifications end-to-end from Settings.

interface PushSubscriptionJSON {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}
interface RequestBody {
  subscription?: PushSubscriptionJSON
}
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

  const vapidPublic = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:noreply@cinevault.app'
  if (!vapidPublic || !vapidPrivate) {
    res.status(503).json({ error: 'Chiavi VAPID non configurate lato server.' })
    return
  }

  const body: RequestBody =
    typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  const sub = body.subscription
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    res.status(400).json({ error: 'Subscription mancante o incompleta.' })
    return
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
      JSON.stringify({
        title: '🔔 CineVault',
        body: 'Le notifiche funzionano! Ti avviserò all’uscita dei titoli che aspetti.',
        url: '/in-arrivo',
      }),
    )
    res.status(200).json({ ok: true })
  } catch (err) {
    const code = (err as { statusCode?: number }).statusCode
    res.status(502).json({ error: `Invio fallito${code ? ` (${code})` : ''}: ${(err as Error).message}` })
  }
}
