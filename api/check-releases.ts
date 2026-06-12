import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

// Daily cron (Vercel): find alerts whose title has been released but the user
// hasn't received a push yet, send a Web Push to each of their devices, then
// mark them push_notified. Uses the Supabase service role (bypasses RLS).

interface ApiRequest {
  method?: string
  headers?: Record<string, string | string[] | undefined>
}
interface ApiResponse {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
}

interface AlertRow {
  id: string
  user_id: string
  title: string
  media_type: string
  tmdb_id: number
}
interface SubRow {
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // Allow Vercel Cron (GET) and manual POST. If CRON_SECRET is set, require it.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers?.authorization
    if (auth !== `Bearer ${secret}`) {
      res.status(401).json({ error: 'Non autorizzato.' })
      return
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const vapidPublic = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:noreply@cinevault.app'

  if (!supabaseUrl || !serviceKey) {
    res.status(503).json({ error: 'Supabase service role non configurato.' })
    return
  }
  if (!vapidPublic || !vapidPrivate) {
    res.status(503).json({ error: 'Chiavi VAPID non configurate.' })
    return
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
  const db = createClient(supabaseUrl, serviceKey)
  const today = new Date().toISOString().slice(0, 10)

  // Alerts released and not yet pushed.
  const { data: alerts, error: aErr } = await db
    .from('user_alerts')
    .select('id, user_id, title, media_type, tmdb_id')
    .eq('push_notified', false)
    .not('release_date', 'is', null)
    .lte('release_date', today)
  if (aErr) {
    res.status(500).json({ error: aErr.message })
    return
  }
  const rows = (alerts ?? []) as AlertRow[]
  if (rows.length === 0) {
    res.status(200).json({ sent: 0, alerts: 0 })
    return
  }

  // Subscriptions for the involved users.
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const { data: subs, error: sErr } = await db
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)
  if (sErr) {
    res.status(500).json({ error: sErr.message })
    return
  }
  const subsByUser = new Map<string, SubRow[]>()
  for (const s of (subs ?? []) as SubRow[]) {
    if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, [])
    subsByUser.get(s.user_id)!.push(s)
  }

  let sent = 0
  const staleEndpoints: string[] = []
  const notifiedIds: string[] = []

  for (const a of rows) {
    const userSubs = subsByUser.get(a.user_id) ?? []
    const type = a.media_type === 'movie' ? 'movie' : 'tv'
    const payload = JSON.stringify({
      title: '🎬 È uscito!',
      body: `«${a.title}» che aspettavi è ora disponibile.`,
      url: `/title/${type}/${a.tmdb_id}`,
    })
    for (const s of userSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        )
        sent++
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) staleEndpoints.push(s.endpoint)
      }
    }
    notifiedIds.push(a.id) // mark handled even if user has no device subscribed
  }

  if (notifiedIds.length > 0) {
    await db.from('user_alerts').update({ push_notified: true }).in('id', notifiedIds)
  }
  if (staleEndpoints.length > 0) {
    await db.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }

  res.status(200).json({ alerts: rows.length, sent, removedStale: staleEndpoints.length })
}
