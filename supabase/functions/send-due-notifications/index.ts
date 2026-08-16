// Déclenchée toutes les minutes par pg_cron (voir supabase-schema.sql).
// Boucle elle-même par pas de ~1s pendant ~55s pour une précision
// correcte sans dépendre d'une granularité cron à la seconde.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Ces deux secrets étaient lus avec `JSON.parse(...!)` directement : s'ils
// manquent, le module échoue au chargement, la fonction répond 500 à chaque
// appel, et pg_cron — qui poste sans jamais lire la réponse — n'en dit rien.
// Résultat : aucune notification n'part et rien ne le signale nulle part.
function _jwtRequis(nom: string) {
  const brut = Deno.env.get(nom);
  if (!brut) {
    console.error(`[push] secret manquant : ${nom} — aucune notification ne peut être signée. ` +
      `À définir avec : supabase secrets set ${nom}='{...}'`);
    throw new Error(`Secret ${nom} absent`);
  }
  try {
    return JSON.parse(brut);
  } catch {
    console.error(`[push] secret ${nom} illisible : ce doit être un JWK au format JSON.`);
    throw new Error(`Secret ${nom} invalide`);
  }
}

const VAPID_PUBLIC_JWK = _jwtRequis('VAPID_PUBLIC_JWK');
const VAPID_PRIVATE_JWK = _jwtRequis('VAPID_PRIVATE_JWK');
const CONTACT_EMAIL = Deno.env.get('VAPID_CONTACT_EMAIL') || 'mailto:contact@example.com';

const STEP_MS = 1_000;
const TOTAL_MS = 55_000;

async function sendDue(admin: ReturnType<typeof createClient>, appServer: webpush.ApplicationServer) {
  const { data: due, error } = await admin
    .from('push_pending')
    .select('id, user_id, title, body')
    .eq('sent', false)
    .lte('deliver_at', new Date().toISOString())
    .limit(50);

  if (error || !due?.length) return;

  for (const notif of due) {
    // Marquer envoyé en premier — évite qu'un échec sur un abonnement
    // fasse retenter indéfiniment et spam d'autres appareils du même user.
    await admin.from('push_pending').update({ sent: true }).eq('id', notif.id);

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_key')
      .eq('user_id', notif.user_id);

    if (!subs?.length) {
      console.warn(`[push] notif ${notif.id} : aucun abonnement pour l utilisateur ${notif.user_id}`);
    }

    for (const sub of subs ?? []) {
      const hote = (() => { try { return new URL(sub.endpoint).host; } catch { return '?'; } })();
      try {
        const subscriber = appServer.subscribe({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        });
        await subscriber.pushTextMessage(
          JSON.stringify({ title: notif.title, body: notif.body }),
          {
            // Sans urgence haute, la livraison part en `normal` : Android est
            // alors libre de la différer jusqu'au prochain réveil de
            // l'appareil, d'où une notification de fin de repos qui n'arrive
            // qu'au moment où l'on touche son téléphone. Une alarme doit
            // traverser la mise en veille.
            urgency: webpush.Urgency.High,
            // Le défaut est de 28 jours : une notification non livrée reste
            // en attente chez FCM tout ce temps et finit par arriver hors de
            // propos. Passé deux minutes, une fin de repos ne veut plus rien
            // dire — mieux vaut qu'elle expire.
            ttl: 120,
          },
        );
        console.info(`[push] envoyé -> ${hote} (notif ${notif.id})`);
      } catch (e) {
        const msg = String(e);
        // Sans cette trace, un échec de livraison était totalement muet :
        // la ligne push_pending est marquée envoyée avant la tentative (pour
        // éviter les renvois en boucle), donc rien nulle part n indiquait que
        // la notification n était jamais partie. Un 403 signale typiquement
        // des clés VAPID côté serveur qui ne correspondent pas à la clé
        // publique utilisée par le client pour s abonner.
        console.error(`[push] ÉCHEC -> ${hote} (notif ${notif.id}) : ${msg}`);
        if (msg.includes('403') || msg.includes('VapidPkHashMismatch')) {
          console.error('[push] 403 : les clés VAPID du serveur ne correspondent pas à VAPID_PUBLIC_KEY de js/config.js — les abonnements existants doivent être recréés après correction.');
        }
        // Abonnement expiré/invalide (410 Gone typiquement) — on le supprime
        // pour ne pas réessayer indéfiniment sur un appareil désinstallé.
        if (msg.includes('410') || msg.includes('404')) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
          console.warn(`[push] abonnement ${sub.id} supprimé (expiré)`);
        }
      }
    }
  }
}

Deno.serve(async (_req) => {
  // Pas de vérification d'auth supplémentaire ici : la passerelle Edge
  // Functions valide déjà le JWT (clé anon, suffisante — voir le cron dans
  // supabase-schema.sql), et cette fonction n'agit que sur des notifications
  // déjà dues d'après push_pending, rien qu'un appelant ne contrôle.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Les JWK doivent d'abord être importés en CryptoKey : ApplicationServer
  // attend une paire de clés WebCrypto, pas les objets JSON bruts. Les
  // passer tels quels laissait la construction réussir, puis échouer à la
  // signature de CHAQUE envoi avec « Argument 2 is not of type CryptoKey ».
  // L'erreur était avalée par le catch, d'où des mois d'échecs muets.
  const vapidKeys = await webpush.importVapidKeys(
    { publicKey: VAPID_PUBLIC_JWK, privateKey: VAPID_PRIVATE_JWK },
    { extractable: false },
  );
  const appServer = await webpush.ApplicationServer.new({
    contactInformation: CONTACT_EMAIL,
    vapidKeys,
  });

  const start = Date.now();
  while (Date.now() - start < TOTAL_MS) {
    await sendDue(admin, appServer);
    await new Promise((r) => setTimeout(r, STEP_MS));
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});
