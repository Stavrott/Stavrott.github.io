import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// ── Helpers génériques ───────────────────────────────────────────────

export async function dbSelect(table, query = {}) {
  const { eq, order, limit, single } = query;
  let req = supabase.from(table).select('*');
  if (eq)    Object.entries(eq).forEach(([k, v]) => { req = req.eq(k, v); });
  if (order) req = req.order(order.column, { ascending: order.asc ?? false });
  if (limit) req = req.limit(limit);
  if (single) req = req.single();
  const { data, error } = await req;
  if (error) throw error;
  return data;
}

export async function dbInsert(table, row) {
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function dbUpdate(table, id, changes) {
  const { data, error } = await supabase.from(table).update(changes).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function dbDelete(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

export async function dbUpsert(table, row) {
  const { data, error } = await supabase.from(table).upsert(row).select().single();
  if (error) throw error;
  return data;
}

// ── Export / Import JSON ─────────────────────────────────────────────

export async function exportAllData(userId) {
  const [seances, series, programmes, nutrition, profil] = await Promise.all([
    dbSelect('seances',    { eq: { user_id: userId } }),
    dbSelect('series',     { eq: { user_id: userId } }),
    dbSelect('programmes', { eq: { user_id: userId } }),
    dbSelect('nutrition',  { eq: { user_id: userId } }),
    dbSelect('profils',    { eq: { user_id: userId }, single: true }).catch(() => null),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    data: { seances, series, programmes, nutrition, profil },
  };
}

export async function importAllData(userId, json) {
  const { data } = json;
  if (!data) throw new Error('Format JSON invalide');

  const tables = ['seances', 'series', 'programmes', 'nutrition'];
  for (const table of tables) {
    if (!data[table]?.length) continue;
    const rows = data[table].map((r) => ({ ...r, user_id: userId }));
    const { error } = await supabase.from(table).upsert(rows);
    if (error) throw error;
  }
}
