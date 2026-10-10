// Appelée par le client quand un repos démarre (voir js/push.js).
// Insère une notification programmée dans push_pending ; c'est
// send-due-notifications (déclenchée par pg_cron) qui l'envoie réellement
// au bon moment, même si l'app est fermée.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const userClient = createClient(SUPABASE_URL, ANON_KEY);
    // getUser(jwt) vérifie le jeton passé explicitement — getUser() sans
    // argument lit l'état de session interne du SDK, qui n'existe pas ici
    // (chaque appel d'Edge Function part d'un client neuf) et renvoyait
    // systématiquement "Auth session missing!".
    const { data: { user }, error: authError } = await userClient.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', reason: authError?.message ?? 'no user', hadAuthHeader: !!authHeader }), { status: 401, headers: CORS_HEADERS });
    }

    // Annuler une notification déjà programmée (repos passé/ajusté côté client).
    if (req.method === 'DELETE') {
      const { id } = await req.json();
      if (!id) return new Response(JSON.stringify({ error: 'id manquant' }), { status: 400, headers: CORS_HEADERS });
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      await admin.from('push_pending').update({ sent: true }).eq('id', id).eq('user_id', user.id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const payload = await req.json();

    // Rappels des jours de séance prévus : le client renvoie la liste
    // complète des 7 prochains jours ; on remplace les rappels encore en
    // attente par cette liste (changement de jours, d'heure, désactivation).
    if (payload?.kind === 'rappels') {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      await admin.from('push_pending').update({ sent: true })
        .eq('user_id', user.id).eq('sent', false).like('title', 'Forme — Séance prévue%');
      const now = Date.now();
      const max = now + 8 * 24 * 3600 * 1000;
      const rows = (Array.isArray(payload.items) ? payload.items : [])
        .map((it: { deliver_at?: string; body?: string }) => ({ at: Date.parse(String(it?.deliver_at ?? '')), body: String(it?.body ?? '').slice(0, 200) }))
        .filter((it: { at: number }) => Number.isFinite(it.at) && it.at > now && it.at <= max)
        .slice(0, 8)
        .map((it: { at: number; body: string }) => ({
          user_id: user.id,
          deliver_at: new Date(it.at).toISOString(),
          title: 'Forme — Séance prévue aujourd’hui',
          body: it.body || 'C’est un de tes jours d’entraînement.',
        }));
      if (rows.length) {
        const { error } = await admin.from('push_pending').insert(rows);
        if (error) throw error;
      }
      return new Response(JSON.stringify({ ok: true, count: rows.length }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const { duration_seconds, title, body } = payload;
    const duration = Number(duration_seconds);
    if (!duration || duration <= 0 || duration > 1800) {
      return new Response(JSON.stringify({ error: 'Durée invalide' }), { status: 400, headers: CORS_HEADERS });
    }

    const deliverAt = new Date(Date.now() + duration * 1000).toISOString();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await admin.from('push_pending').insert({
      user_id: user.id,
      deliver_at: deliverAt,
      title: title || 'Forme — Repos terminé !',
      body: body || "C'est l'heure de votre prochaine série",
    }).select('id').single();
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, id: data.id, deliver_at: deliverAt }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS_HEADERS });
  }
});
