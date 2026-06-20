// Notifications push serveur — fiables même app fermée/écran éteint,
// contrairement aux notifications locales de components/timer.js qui
// dépendent du JS de la page (suspendu en arrière-plan par l'OS).
//
// Flux : l'utilisateur autorise les notifs → on s'abonne au PushManager du
// navigateur → l'abonnement (endpoint + clés) est stocké dans
// push_subscriptions → au démarrage d'un repos, schedule-notification
// programme une ligne dans push_pending → pg_cron + send-due-notifications
// l'envoient au bon moment, où que soit l'utilisateur.
import { supabase } from './supabase.js';
import { currentUser } from './auth.js';
import { VAPID_PUBLIC_KEY } from './config.js';

function _urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

let _subscribed = false;

// Abonne cet appareil aux notifications push — à appeler une fois la
// permission de notification accordée (cf. initTimer dans timer.js).
export async function ensurePushSubscription() {
  if (_subscribed) return true;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = sub.toJSON();
    await supabase.from('push_subscriptions').upsert({
      user_id: currentUser.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth_key: json.keys.auth,
    }, { onConflict: 'endpoint' });

    _subscribed = true;
    return true;
  } catch {
    return false;
  }
}

async function _invoke(method, body) {
  try {
    const { data, error } = await supabase.functions.invoke('schedule-notification', { method, body });
    if (error) throw error;
    return data;
  } catch {
    return null;
  }
}

// Programme la notification de fin de repos côté serveur. Retourne l'id
// de la ligne push_pending (à repasser à cancelRestPush si le repos est
// ajusté/passé avant son terme), ou null si l'abonnement n'a pas pu se faire
// (notifs refusées, hors ligne...) — le timer local reste le filet de
// sécurité dans ce cas.
export async function scheduleRestPush(durationSeconds, title, body) {
  const ok = await ensurePushSubscription();
  if (!ok) return null;
  const data = await _invoke('POST', { duration_seconds: durationSeconds, title, body });
  return data?.id ?? null;
}

export async function cancelRestPush(id) {
  if (!id) return;
  await _invoke('DELETE', { id });
}
