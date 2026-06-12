import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const pushSupported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

export const pushConfigured = !!VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready)
}

export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported) return false
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return !!sub
}

export async function enablePush(userId: string): Promise<void> {
  if (!pushSupported) throw new Error('Le notifiche push non sono supportate da questo browser.')
  if (!VAPID_PUBLIC_KEY) throw new Error('Notifiche push non configurate (manca VITE_VAPID_PUBLIC_KEY).')
  if (!supabase) throw new Error('Supabase non configurato.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Permesso notifiche negato.')

  const reg = await getRegistration()
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    }))

  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw new Error(error.message)
}

// Test that notifications actually display on this device. Shows a single
// local notification through the service worker — same mechanism as a real push.
export async function sendTestNotification(): Promise<void> {
  if (!pushSupported) throw new Error('Notifiche non supportate da questo browser.')
  if (Notification.permission !== 'granted') {
    throw new Error('Permesso notifiche non concesso dal browser/sistema.')
  }
  const reg =
    (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready)
  if (!reg) throw new Error('Service worker non attivo. Ricarica la pagina e riprova.')

  await reg.showNotification('Ciak', {
    body: 'Le notifiche funzionano! Ti avviserò all’uscita dei titoli che aspetti.',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    data: { url: '/in-arrivo' },
  })
}

export async function disablePush(): Promise<void> {
  if (!pushSupported || !supabase) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe().catch(() => {})
  }
}
