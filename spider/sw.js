const CACHE_NAME = 'spider-v0.1.3'; // bump this when deploying updates

const urlsToCache = [
    '/pwa-cards/spider/',
    '/pwa-cards/spider/index.html',
    '/pwa-cards/spider/manifest.json',
    '/pwa-cards/spider/appSpider.js',
    '/pwa-cards/css/settings.css',
    '/pwa-cards/css/style.css',
    '/pwa-cards/js/card.js',
    '/pwa-cards/js/cardAnimator.js',
    '/pwa-cards/js/columnLayout.js',
    '/pwa-cards/js/dragHandler.js',
    '/pwa-cards/js/gameTimer.js',
    '/pwa-cards/js/qrcode.min.js',
    '/pwa-cards/js/setingsManager.js',
    '/pwa-cards/js/setingsUI.js',
    '/pwa-cards/js/statsManager.js',
    '/pwa-cards/js/storageManager.js'
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
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                // Got a fresh response — update cache and return it
                if (networkResponse.ok) {
                    caches.open(CACHE_NAME).then(cache =>
                        cache.put(event.request, networkResponse.clone())
                    );
                }
                return networkResponse;
            })
            .catch(() => {
                // Network failed — fall back to cache (offline support)
                return caches.match(event.request);
            })
    );
});
