// CineVault service worker — minimal, deploy-safe.
// Strategy:
//  - Navigations (HTML): network-first, fall back to cached shell when offline.
//    This guarantees users always get the latest deploy when online.
//  - Same-origin static assets (content-hashed JS/CSS/img): cache-first.
//  - Le locandine di TMDB: cache-first in una cache a parte, con un tetto.
//    Senza, offline la collezione si apre ma è una griglia di riquadri vuoti —
//    e una collezione di film senza copertine non si riconosce.
//  - /drive-video/{id}: i film di Google Drive per il lettore di Ciak (sotto).
//  - Tutto il resto cross-origin (API TMDB, Supabase, Anthropic) non si tocca:
//    sono dati che cambiano e richieste autenticate, non roba da cache muta.

const CACHE = 'ciak-v3'
const IMG_CACHE = 'ciak-img-v1'
// Circa la collezione di una persona più parecchio navigato: tenendone di più
// si evita di ri-scaricare le stesse locandine quando si sfoglia molto (anime,
// cartoni, cataloghi lunghi). Oltre il tetto si buttano le più vecchie: una
// cache che cresce senza fine se la prende il browser quando meno serve, di
// solito proprio offline. ~1000 locandine w342 stanno in qualche decina di MB.
const MAX_IMMAGINI = 1000

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html', '/ciak.svg'])))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // La cache delle immagini sopravvive ai deploy: le locandine non
            // cambiano, e ributtarle a ogni versione vanificherebbe l'offline.
            .filter((k) => k !== CACHE && k !== IMG_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  if (url.origin === self.location.origin && url.pathname.startsWith('/drive-video/')) {
    event.respondWith(videoDaDrive(event, url))
    return
  }

  // Locandine e ritratti: cache-first, perché non cambiano mai e sono ciò che
  // rende riconoscibile la collezione quando la rete non c'è.
  if (url.hostname === 'image.tmdb.org') {
    event.respondWith(
      caches.open(IMG_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached
          return fetch(req).then((res) => {
            if (res.ok) {
              cache.put(req, res.clone()).then(() => sfoltisci(cache))
            }
            return res
          })
        }),
      ),
    )
    return
  }

  if (url.origin !== self.location.origin) return // don't touch APIs / Supabase

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

// Toglie le immagini più vecchie quando la cache supera il tetto. `keys()` le
// restituisce in ordine di inserimento, quindi le prime sono le più vecchie.
function sfoltisci(cache) {
  return cache.keys().then((chiavi) => {
    if (chiavi.length <= MAX_IMMAGINI) return
    return Promise.all(chiavi.slice(0, chiavi.length - MAX_IMMAGINI).map((k) => cache.delete(k)))
  })
}

// ── I film di Google Drive ──────────────────────────────────────────────────
// Un <video> non sa aggiungere l'intestazione Authorization e Drive non accetta
// più il token nell'URL. Il video chiede quindi /drive-video/{id} a noi; qui ci
// si fa dare il token dalla pagina che lo sta guardando (resta solo lì, mai in
// un URL o in una cache) e si gira la richiesta a Drive, Range compreso, così
// si può saltare avanti e indietro senza scaricare il file intero.
function videoDaDrive(event, url) {
  const id = url.pathname.slice('/drive-video/'.length)
  if (!/^[\w-]{10,}$/.test(id)) return Promise.resolve(new Response('', { status: 400 }))
  return self.clients
    .get(event.clientId)
    .then((client) => (client ? chiediToken(client) : null))
    .then((token) => {
      if (!token) return new Response('', { status: 401 })
      const headers = { Authorization: 'Bearer ' + token }
      const range = event.request.headers.get('Range')
      if (range) headers.Range = range
      return fetch('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media', { headers })
    })
}

// Chiede il token alla pagina; se non risponde entro poco, niente token.
function chiediToken(client) {
  return new Promise((resolve) => {
    const canale = new MessageChannel()
    const scadenza = setTimeout(() => resolve(null), 3000)
    canale.port1.onmessage = (e) => {
      clearTimeout(scadenza)
      resolve((e.data && e.data.token) || null)
    }
    client.postMessage({ tipo: 'ciak:drive-token' }, [canale.port2])
  })
}

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

