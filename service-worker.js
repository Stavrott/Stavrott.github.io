const CACHE_NAME = 'forme-v35';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/fonts/inter-latin.woff2',
  '/css/variables.css',
  '/css/main.css',
  '/css/components.css',
  '/js/app.js',
  '/js/config.js',
  '/js/router.js',
  '/js/supabase.js',
  '/js/auth.js',
  '/js/utils.js',
  '/js/push.js',
  '/js/metrics.js',
  '/js/set-types.js',
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

// Notification push reçue depuis le serveur (send-due-notifications) —
// fonctionne même si l'app/onglet est complètement fermé, contrairement
// aux notifications locales déclenchées depuis components/timer.js.
// ── Journal de diagnostic (temporaire) ─────────────────────────────────
// Le service worker n'a ni console ni logs accessibles depuis un téléphone.
// On consigne donc chaque push reçu dans un cache dédié, que la page relit
// au lancement suivant pour l'afficher (voir _initDiag dans js/app.js).
// Objectif : savoir si le push atteint seulement le service worker quand
// l'app est en arrière-plan écran allumé, ou s'il l'atteint sans alerter.
// À retirer une fois la question tranchée.
const DIAG_CACHE = 'forme-diag';

async function _diagLog(entree) {
  try {
    const c = await caches.open(DIAG_CACHE);
    const precedent = await c.match('/diag').then((r) => (r ? r.json() : [])).catch(() => []);
    const liste = [entree, ...(Array.isArray(precedent) ? precedent : [])].slice(0, 10);
    await c.put('/diag', new Response(JSON.stringify(liste), {
      headers: { 'Content-Type': 'application/json' },
    }));
  } catch { /* le diagnostic ne doit jamais casser la notification */ }
}

// Deux garde-fous contre le même piège : une notification qui en remplace
// une autre de même tag n'alerte pas — ni son, ni vibration — sauf si
// `renotify` vaut true. La notification de fin de repos a donc son propre
// tag ET `renotify`, faute de quoi elle passait inaperçue précisément
// quand on n'est pas devant l'app.
self.addEventListener('push', (event) => {
  let data = { title: 'Forme', body: '' };
  try { data = event.data?.json() ?? data; } catch {}

  event.waitUntil((async () => {
    // Le décompte « Repos en cours » porte le tag 'timer-rest' et la page le
    // réécrit toutes les 5 s tant qu'elle vit. La notification de fin a donc
    // son propre tag : sinon elle ne serait qu'un remplacement de plus, et un
    // remplacement n'alerte pas de façon fiable. On ferme le décompte au
    // passage pour ne pas laisser deux notifications côte à côte.
    (await self.registration.getNotifications({ tag: 'timer-rest' })).forEach((n) => n.close());

    // Les deux chemins — minuteur local et push serveur — peuvent aboutir
    // pour un même repos, à quelques secondes d'écart. Le premier arrivé
    // alerte ; le second se contente de mettre la notification à jour, sans
    // refaire sonner le téléphone.
    const tagFin = data.tag ?? 'timer-rest-done';
    const dejaAffichee = (await self.registration.getNotifications({ tag: tagFin })).length > 0;

    const options = {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: tagFin,
      // Un repos terminé est une alarme : elle reste affichée jusqu'à ce
      // qu'on la balaie, au lieu de disparaître pendant qu'on a le nez
      // dans autre chose. (Retirer cette ligne suffit à revenir à une
      // notification éphémère.)
      requireInteraction: data.requireInteraction ?? true,
      timestamp: Date.now(),
    };

    // `silent` et `vibrate` sont mutuellement exclusifs : la spec interdit
    // qu'une notification silencieuse porte un motif de vibration, et
    // showNotification rejette avec une TypeError si on met les deux. Les
    // poser côte à côte faisait échouer l'affichage dans le seul cas où
    // `dejaAffichee` est vrai — c'est-à-dire exactement le cas visé.
    if (dejaAffichee) {
      options.silent = true;
      options.renotify = false;
    } else {
      options.renotify = data.renotify ?? true;
      // Même motif que la notification locale de fin de repos, pour que
      // les deux chemins se ressentent pareil au poignet comme en poche.
      options.vibrate = data.vibrate ?? [150, 80, 150];
    }

    await self.registration.showNotification(data.title, options).then(
      () => ['affichee', null],
      (e) => ['echec', String(e).slice(0, 200)],
    ).then(async ([etat, erreur]) => {
      // L'état des fenêtres ouvertes est la mesure qui manque : elle dit si
      // la page était encore vivante (et donc en train de réécrire ses
      // propres notifications) au moment où le push est arrivé.
      const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const affichees = await self.registration.getNotifications();
      await _diagLog({
        t: new Date().toISOString(),
        etat,
        erreur,
        fenetres: fenetres.map((c) => ({ vis: c.visibilityState, focus: c.focused })),
        tags: affichees.map((n) => n.tag),
      });
    });
  })());
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
      Promise.all(keys
        .filter((k) => k !== CACHE_NAME && k !== DIAG_CACHE)
        .map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore tout ce qui n'est pas http(s) (ex: chrome-extension://, injecté
  // par une extension du navigateur) — Cache.put() rejette ces schémas.
  if (!url.protocol.startsWith('http')) return;

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
