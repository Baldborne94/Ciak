// CineVault service worker — minimal, deploy-safe.
// Strategy:
//  - Navigations (HTML): network-first, fall back to cached shell when offline.
//    This guarantees users always get the latest deploy when online.
//  - Same-origin static assets (content-hashed JS/CSS/img): cache-first.
//  - Everything cross-origin (TMDB, Supabase, Anthropic) is left untouched.

const CACHE = 'ciak-v2'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html', '/ciak.svg'])))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // don't touch APIs / TMDB / Supabase

  // App navigations → network-first with offline fallback to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put('/index.html', res.clone()))
          return res
        })
        .catch(() => caches.match('/index.html').then((r) => r ?? caches.match('/'))),
    )
    return
  }

  // Static assets → cache-first, then populate the cache.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ??
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})

// ── Web Push ────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = data.title || 'Ciak'
  const options = {
    body: data.body || 'Un titolo che aspettavi è uscito!',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    data: { url: data.url || '/in-arrivo' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/in-arrivo'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) {
          c.navigate(url)
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})

