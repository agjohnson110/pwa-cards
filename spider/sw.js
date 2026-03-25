const CACHE_NAME = 'spider-v0.2.0'; // bump this when deploying updates

const urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './appSpider.js',
    '../css/settings.css',
    '../css/style-card.css',
    '../css/style-spider.css',
    '../js/card.js',
    '../js/cardAnimator.js',
    '../js/columnLayout.js',
    '../js/dragHandler.js',
    '../js/gameTimer.js',
    '../js/qrcode.min.js',
    '../js/settingsManager.js',
    '../js/settingsUI.js',
    '../js/statsManager.js',
    '../js/storageManager.js'
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

// Network-first with cache fallback - latest even without version updates
self.addEventListener('fetch', event => {
    // Only handle GET requests — POST etc. always go to network
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
