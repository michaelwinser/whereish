/**
 * Whereish Service Worker
 * Provides offline capability and caching
 */

const CACHE_NAME = 'whereish-v45';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/storage.js',
    '/geofence.js',
    '/api.js',
    '/views.js',
    '/manifest.json',
    '/icon.svg'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch: cache-first for static assets, network-first for API calls
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Network-first for geocoding API (always want fresh data)
    if (url.hostname === 'nominatim.openstreetmap.org') {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    // If offline, we can't geocode - that's okay
                    return new Response(
                        JSON.stringify({ error: 'Offline - cannot geocode' }),
                        { headers: { 'Content-Type': 'application/json' } }
                    );
                })
        );
        return;
    }

    // Only cache GET requests (Cache API doesn't support POST, PUT, etc.)
    if (event.request.method !== 'GET') {
        return;
    }

    // Cache-first for static assets
    event.respondWith(
        caches.match(event.request)
            .then((cached) => {
                if (cached) {
                    return cached;
                }
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        // Clone and cache
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        return response;
                    });
            })
    );
});
