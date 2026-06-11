const CACHE_NAME = 'esse-v1';
const STATIC_ASSETS = [
  '/esse-app/',
  '/esse-app/index.html',
  '/esse-app/manifest.json',
  '/esse-app/css/variables.css',
  '/esse-app/css/main.css',
  '/esse-app/css/components.css',
  '/esse-app/js/app.js',
  '/esse-app/js/config.js',
  '/esse-app/js/router.js',
  '/esse-app/js/supabase.js',
  '/esse-app/js/auth.js',
  '/esse-app/js/utils.js',
  '/esse-app/pages/home.js',
  '/esse-app/pages/seances.js',
  '/esse-app/pages/seance-active.js',
  '/esse-app/pages/programmes.js',
  '/esse-app/pages/stats.js',
  '/esse-app/pages/nutrition.js',
  '/esse-app/pages/exercices.js',
  '/esse-app/pages/profil.js',
  '/esse-app/pages/onboarding.js',
  '/esse-app/components/timer.js',
  '/esse-app/icons/icon-192.png',
  '/esse-app/icons/icon-512.png',
  '/esse-app/icons/icon-180.png',
  '/esse-app/icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.io')) {
    event.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify({ error: 'Hors ligne' }), {
        headers: { 'Content-Type': 'application/json' },
      }))
    );
    return;
  }

  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME + '-fonts').then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        if (request.mode === 'navigate') {
          return caches.match('/esse-app/index.html');
        }
      });
    })
  );
});
