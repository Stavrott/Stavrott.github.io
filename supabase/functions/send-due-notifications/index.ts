// Déclenchée toutes les minutes par pg_cron (voir supabase-schema.sql).
// Boucle elle-même par pas de ~10s pendant ~55s pour une précision
// correcte sans dépendre d'une granularité cron à la seconde.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_JWK = JSON.parse(Deno.env.get('VAPID_PUBLIC_JWK')!);
const VAPID_PRIVATE_JWK = JSON.parse(Deno.env.get('VAPID_PRIVATE_JWK')!);
const CONTACT_EMAIL = Deno.env.get('VAPID_CONTACT_EMAIL') || 'mailto:contact@example.com';

const STEP_MS = 10_000;
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

    for (const sub of subs ?? []) {
      try {
        const subscriber = appServer.subscribe({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        });
        await subscriber.pushTextMessage(JSON.stringify({ title: notif.title, body: notif.body }), {});
      } catch (e) {
        // Abonnement expiré/invalide (410 Gone typiquement) — on le supprime
        // pour ne pas réessayer indéfiniment sur un appareil désinstallé.
        const msg = String(e);
        if (msg.includes('410') || msg.includes('404')) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }
  }
}

Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.includes(SERVICE_ROLE_KEY)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const appServer = await webpush.ApplicationServer.new({
    contactInformation: CONTACT_EMAIL,
    vapidKeys: { publicKey: VAPID_PUBLIC_JWK, privateKey: VAPID_PRIVATE_JWK },
  });

  const start = Date.now();
  while (Date.now() - start < TOTAL_MS) {
    await sendDue(admin, appServer);
    await new Promise((r) => setTimeout(r, STEP_MS));
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});
