import webpush from 'web-push'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { urlTmdb } from './tmdb'

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

// Decide se la richiesta può procedere. Estratta perché è la sola cosa che
// separa questo endpoint — che scrive nel database con la chiave service_role e
// manda notifiche a TUTTI gli utenti — da chiunque passi di lì.
//
// Fallisce CHIUSO quando il segreto non è configurato: prima l'autorizzazione
// era condizionata alla sua presenza, quindi una variabile d'ambiente
// dimenticata lasciava l'endpoint aperto senza che nulla lo segnalasse. Meglio
// un cron che non parte, e si nota, di uno che chiunque può far partire.
export function cronAuthError(
  secret: string | undefined,
  authHeader: string | string[] | undefined,
): { status: number; error: string } | null {
  if (!secret) {
    return {
      status: 503,
      error: 'CRON_SECRET non configurato lato server: endpoint disattivato.',
    }
  }
  const value = Array.isArray(authHeader) ? authHeader[0] : authHeader
  if (value !== `Bearer ${secret}`) {
    return { status: 401, error: 'Non autorizzato.' }
  }
  return null
}

// La data d'uscita che TMDB dà oggi, se è una data vera.
export function dataDaTmdb(raw: { release_date?: string | null; first_air_date?: string | null }, tipo: string): string | null {
  const d = tipo === 'movie' ? raw.release_date : raw.first_air_date
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

// Si aggiorna solo se TMDB dà una data, e diversa: una data che TMDB toglie
// (succede, fra un annuncio e l'altro) non cancella quella che si sapeva.
export function dataDaSalvare(salvata: string | null, daTmdb: string | null): string | null {
  return daTmdb && daTmdb !== salvata ? daTmdb : null
}

// Quanti avvisi in attesa si rileggono per giro: il cron ha pochi secondi.
const RILETTI_PER_GIRO = 80

// Le date cambiano (un film rinviato) e un film annunciato spesso non ne ha:
// senza rileggerle, un avviso salvato senza data non suonava mai, e uno con la
// data vecchia suonava il giorno sbagliato. Prima di cercare gli usciti, si
// chiede a TMDB la data di oggi degli avvisi ancora in attesa.
async function aggiornaDate(db: SupabaseClient, chiave: string, oggi: string): Promise<number> {
  const { data, error } = await db
    .from('user_alerts')
    .select('id, media_type, tmdb_id, release_date')
    .eq('push_notified', false)
    .or(`release_date.is.null,release_date.gt.${oggi}`)
    .order('release_date', { ascending: true, nullsFirst: true })
    .limit(RILETTI_PER_GIRO)
  if (error) throw new Error(error.message)
  const righe = (data ?? []) as { id: string; media_type: string; tmdb_id: number; release_date: string | null }[]
  let aggiornati = 0
  let falliti = 0
  for (let i = 0; i < righe.length; i += 8) {
    await Promise.all(
      righe.slice(i, i + 8).map(async (r) => {
        const tipo = r.media_type === 'movie' ? 'movie' : 'tv'
        try {
          const risposta = await fetch(urlTmdb(`/${tipo}/${r.tmdb_id}`, {}, chiave))
          if (!risposta.ok) throw new Error(`TMDB ${risposta.status}`)
          const nuova = dataDaSalvare(r.release_date, dataDaTmdb(await risposta.json(), tipo))
          if (!nuova) return
          const { error: e } = await db.from('user_alerts').update({ release_date: nuova }).eq('id', r.id)
          if (e) throw new Error(e.message)
          aggiornati++
        } catch {
          falliti++
        }
      }),
    )
  }
  // Una riga col totale, non una per avviso.
  if (falliti > 0) console.error(`[check-releases] date degli avvisi: ${falliti} su ${righe.length} non rilette`)
  return aggiornati
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // Vercel invia da sé questa intestazione ai cron quando CRON_SECRET è fra le
  // variabili d'ambiente del progetto.
  const denied = cronAuthError(process.env.CRON_SECRET, req.headers?.authorization)
  if (denied) {
    res.status(denied.status).json({ error: denied.error })
    return
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

  // Senza chiave TMDB si va avanti con le date salvate: meglio avvisi coi dati
  // di ieri che nessun avviso.
  const chiaveTmdb = process.env.TMDB_API_KEY
  let dateAggiornate = 0
  if (chiaveTmdb) {
    try {
      dateAggiornate = await aggiornaDate(db, chiaveTmdb, today)
    } catch (e) {
      console.error('[check-releases] date degli avvisi non rilette:', e instanceof Error ? e.message : e)
    }
  }

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
    res.status(200).json({ sent: 0, alerts: 0, dateAggiornate })
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
      icon: '/icon-192.png',
      badge: '/badge-96.png',
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

  res.status(200).json({ alerts: rows.length, sent, removedStale: staleEndpoints.length, dateAggiornate })
}
