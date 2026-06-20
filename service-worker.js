const CACHE_NAME = 'forme-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/variables.css',
  '/css/main.css',
  '/css/components.css',
  '/js/app.js',
  '/js/config.js',
  '/js/router.js',
  '/js/supabase.js',
  '/js/auth.js',
  '/js/utils.js',
  '/js/metrics.js',
  '/js/calories.js',
  '/js/body-map.js',
  '/js/exercisedb.js',
  '/js/quick-launch.js',
  '/js/active-bar.js',
  '/pages/home.js',
  '/pages/seances.js',
  '/pages/seance-active.js',
  '/pages/routine-builder.js',
  '/pages/routine-view.js',
  '/pages/programmes.js',
  '/pages/stats.js',
  '/pages/nutrition.js',
  '/pages/exercices.js',
  '/pages/profil.js',
  '/pages/onboarding.js',
  '/components/timer.js',
  '/icons/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
  '/icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Relaie le bouton d'action tapé sur une notif (ex: "+15 s" / "Passer" du
// minuteur de repos) vers la page ouverte — le SW n'a pas accès à l'état
// du minuteur, seule la page peut agir.
self.addEventListener('notificationclick', (event) => {
  const action = event.action || 'open';
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      if (list.length > 0) {
        list[0].focus();
        list[0].postMessage({ type: 'notification-action', action });
      } else {
        self.clients.openWindow('/');
      }
    })
  );
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
          return caches.match('/index.html');
        }
      });
    })
  );
});
