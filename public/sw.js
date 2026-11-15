const CACHE_NAME = 'fieldshift-shell-v1'
const APP_ROOT = new URL('./', self.registration.scope)
const APP_INDEX = new URL('index.html', APP_ROOT).href
const PRECACHE_LIST = new URL('precache-manifest.json', APP_ROOT).href

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const response = await fetch(PRECACHE_LIST, { cache: 'no-store' })
    if (!response.ok) throw new Error('Offline asset manifest is unavailable.')
    const files = await response.json()
    const urls = [...new Set([APP_INDEX, ...files.map((file) => new URL(file, APP_ROOT).href)])]
    const cache = await caches.open(CACHE_NAME)
    await cache.addAll(urls)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('fieldshift-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(APP_INDEX, response.clone()))
      return response
    }).catch(async () => (await caches.match(APP_INDEX)) || Response.error()))
    return
  }
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
    return response
  }).catch(async () => (await caches.match(request)) || Response.error()))
})
