const CACHE_NAME = 'forme-v39';
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

// Remontée du diagnostic vers la base, en plus du cache local : un bandeau
// dans l'app suppose que quelqu'un le lise au bon moment, ce qui s'est
// révélé peu praticable. Ces deux valeurs sont déjà publiques (js/config.js).
// Table et politiques temporaires — voir la note dans push_diag.
const DIAG_URL = 'https://ytkrjraoqmroankhidip.supabase.co/rest/v1/push_diag';
const DIAG_KEY = 'sb_publishable_bBM2IhLy67iX7-e-n6SaFg__WDrReHj';

async function _diagRemote(detail) {
  try {
    await fetch(DIAG_URL, {
      method: 'POST',
      headers: {
        'apikey': DIAG_KEY,
        'Authorization': `Bearer ${DIAG_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ evenement: 'push', detail }),
    });
  } catch { /* le diagnostic ne doit jamais casser la notification */ }
}

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
    // Ferme TOUTE notification de repos encore affichée — le décompte comme
    // une fin précédente. C'est le point clé : `requireInteraction` maintient
    // la notification de fin à l'écran jusqu'à ce qu'on la balaie, si bien
    // qu'à partir du deuxième repos la nouvelle ne faisait que remplacer
    // l'ancienne. Or un remplacement n'alerte pas de façon fiable, quoi que
    // dise `renotify` : ni son, ni vibration. D'où une seule notification
    // audible — la toute première — et le silence ensuite.
    const encore = await self.registration.getNotifications();
    encore.filter((n) => n.tag && n.tag.startsWith('timer-rest')).forEach((n) => n.close());

    // Tag unique par repos : la notification est toujours neuve, jamais un
    // remplacement. On ne dépend plus du tout du comportement de `renotify`.
    const tagFin = data.tag ?? `timer-rest-done-${Date.now()}`;

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
      renotify: data.renotify ?? true,
      // Ne jamais poser `silent` en même temps que `vibrate` : la spec
      // interdit qu'une notification silencieuse porte un motif de
      // vibration, et showNotification rejette alors avec une TypeError.
      vibrate: data.vibrate ?? [150, 80, 150],
    };

    await self.registration.showNotification(data.title, options).then(
      () => ['affichee', null],
      (e) => ['echec', String(e).slice(0, 200)],
    ).then(async ([etat, erreur]) => {
      // L'état des fenêtres ouvertes est la mesure qui manque : elle dit si
      // la page était encore vivante (et donc en train de réécrire ses
      // propres notifications) au moment où le push est arrivé.
      const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const affichees = await self.registration.getNotifications();
      const detail = {
        sw: CACHE_NAME,
        etat,
        erreur,
        options: { renotify: options.renotify, vibrate: !!options.vibrate, requireInteraction: options.requireInteraction, tag: options.tag },
        fenetres: fenetres.map((c) => ({ vis: c.visibilityState, focus: c.focused })),
        tags: affichees.map((n) => n.tag),
      };
      await _diagLog({ t: new Date().toISOString(), ...detail });
      await _diagRemote(detail);
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
