import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
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

// Tables exportées, dans l'ordre d'import (les séances avant leurs séries).
// onConflict : tables à une ligne par utilisateur (ou par jour), où la
// ligne existante est remplacée plutôt que dupliquée.
const _EXPORT_TABLES = [
  { table: 'seances' },
  { table: 'series' },
  { table: 'programmes' },
  { table: 'nutrition' },
  { table: 'exercices_custom' },
  { table: 'historique_poids',    onConflict: 'user_id,date' },
  { table: 'objectifs_nutrition', onConflict: 'user_id' },
];

// Toutes les lignes de l'utilisateur : Supabase plafonne chaque réponse à
// 1 000 lignes, on pagine (sinon l'export des séries était tronqué).
// Une table absente de la base (migration non jouée) est simplement vide.
async function _selectAllRows(table, userId) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*')
      .eq('user_id', userId).order('id').range(from, from + 999);
    if (error) {
      if (['42P01', 'PGRST205'].includes(error.code)) return out;
      throw error;
    }
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

export async function exportAllData(userId) {
  const [profil, ...rows] = await Promise.all([
    dbSelect('profils', { eq: { user_id: userId }, single: true }).catch(() => null),
    ..._EXPORT_TABLES.map(({ table }) => _selectAllRows(table, userId)),
  ]);
  const data = { profil };
  _EXPORT_TABLES.forEach(({ table }, i) => { data[table] = rows[i]; });
  return {
    exportedAt: new Date().toISOString(),
    version: '1.1.0',
    data,
  };
}

export async function importAllData(userId, json) {
  const { data } = json;
  if (!data) throw new Error('Format JSON invalide');

  for (const { table, onConflict } of _EXPORT_TABLES) {
    if (!data[table]?.length) continue;
    const rows = data[table].map((r) => {
      const row = { ...r, user_id: userId };
      if (onConflict) delete row.id;
      return row;
    });
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500), onConflict ? { onConflict } : undefined);
      if (error) throw error;
    }
  }
}
