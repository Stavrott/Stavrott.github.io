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
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
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

    const { duration_seconds, title, body } = await req.json();
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
