const CACHE = 'gconfig-v41';

/** Static assets only — HTML is always fetched fresh (see fetch handler). */
const PRECACHE = [
    './manifest.json',
    './style.css',
    './styles-v2.css',
    './styles-v2-future.css',
    './styles-welcome-future.css',
    './script-v2.js',
    './eamf-countertop-thickness.js',
    './alien-logo.png',
    './alien-logo-padded.png'
];

function isHtmlRequest(request) {
    if (request.mode === 'navigate') return true;
    try {
        const path = new URL(request.url).pathname;
        return path.endsWith('.html') || path.endsWith('/') || path.includes('index');
    } catch (_) {
        return false;
    }
}

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE)
            .then((c) => c.addAll(PRECACHE))
            .then(() => self.skipWaiting())
            .catch((err) => console.warn('[SW] Precache failed:', err))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;

    if (isHtmlRequest(e.request)) {
        e.respondWith(
            fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request))
        );
        return;
    }

    e.respondWith(
        fetch(e.request)
            .then((res) => {
                if (res && res.status === 200 && res.type !== 'opaque') {
                    const clone = res.clone();
                    caches.open(CACHE).then((c) => c.put(e.request, clone));
                }
                return res;
            })
            .catch(() => caches.match(e.request))
    );
});
