const CACHE_NAME = 'freecell-v0.2.1'; // bump this when deploying updates

const urlsToCache = [
    '/',
    '/index.html',
    '/css/settings.css',
    '/css/style.css',
    '/js/app.js',
    '/manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            Promise.allSettled(
                urlsToCache.map(url =>
                    cache.add(url).catch(err =>
                        console.warn(`Failed to cache ${url}:`, err)
                    )
                )
            )
        ).then(() => self.skipWaiting()) // activate immediately, don't wait for old SW to die
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim()) // take control of all open tabs immediately
    );
});

self.addEventListener('fetch', event => {
    // Only handle GET requests — POST etc. always go to network
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.open(CACHE_NAME).then(cache =>
            cache.match(event.request).then(cachedResponse => {
                // Always try to fetch a fresh copy in the background
                const networkFetch = fetch(event.request).then(networkResponse => {
                    // Update the cache with the fresh response
                    if (networkResponse.ok) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(() => null); // network failed — that's OK, we have cache

                // Return cached version immediately if available,
                // otherwise wait for the network response
                return cachedResponse || networkFetch;
            })
        )
    );
});
