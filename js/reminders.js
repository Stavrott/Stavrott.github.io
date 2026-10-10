// ── Jours prévus et rappels ───────────────────────────────────────────
// L'utilisateur choisit ses jours d'entraînement (0 = lundi … 6 = dimanche)
// et, s'il le veut, une heure de rappel. Les rappels des 7 prochains jours
// sont programmés côté serveur (push_pending, via schedule-notification) :
// ils arrivent même appli fermée. On les reprogramme à chaque ouverture
// de l'appli (au plus toutes les 12 h) et à chaque changement de réglage.
//
// Colonnes Supabase : profils.jours_prevus (int[]), profils.rappel_heure
// (text, « 08:30 » ; null = pas de rappel). Si elles n'existent pas encore,
// le réglage reste stocké sur l'appareil et rien ne casse.

import { supabase } from './supabase.js';
import { currentUser } from './auth.js';
import { localDateStr } from './utils.js';
import { scheduleReminders } from './push.js';

export const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const JOURS_LONGS  = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

const _lsKey   = () => `forme_planning_${currentUser?.id ?? 'anon'}`;
const _syncKey = () => `forme_rappels_sync_${currentUser?.id ?? 'anon'}`;

function _lsRead() {
  try { return JSON.parse(localStorage.getItem(_lsKey()) || 'null'); } catch { return null; }
}
function _lsWrite(v) {
  try { localStorage.setItem(_lsKey(), JSON.stringify(v)); } catch {}
}

function _clean(p) {
  const jours = Array.isArray(p?.jours) ? [...new Set(p.jours.map(Number).filter(d => d >= 0 && d <= 6))].sort() : [];
  const heure = /^\d{2}:\d{2}$/.test(p?.heure ?? '') ? p.heure : null;
  return { jours, heure };
}

// Dernier réglage connu sur cet appareil (synchrone, pour l'affichage).
export function getPlanningCached() { return _clean(_lsRead()); }

// { jours: [0..6], heure: '08:30' | null }
export async function getPlanning() {
  const local = _clean(_lsRead());
  try {
    const { data, error } = await supabase.from('profils')
      .select('jours_prevus, rappel_heure').eq('user_id', currentUser.id).maybeSingle();
    if (error || !data) return local;
    const remote = _clean({ jours: data.jours_prevus ?? [], heure: data.rappel_heure ?? null });
    _lsWrite(remote);
    return remote;
  } catch {
    return local;
  }
}

export async function savePlanning(p) {
  const v = _clean(p);
  _lsWrite(v);
  try {
    await supabase.from('profils').upsert(
      { user_id: currentUser.id, jours_prevus: v.jours, rappel_heure: v.heure },
      { onConflict: 'user_id' });
  } catch {}
  return syncReminders(v, { force: true });
}

// Jour de la semaine façon appli (0 = lundi).
export const weekdayIdx = (d) => (d.getDay() + 6) % 7;

// Ce qui est prévu ce jour-là dans les programmes (séances marquées
// pour ce jour de la semaine).
async function _plannedNames() {
  try {
    const { data } = await supabase.from('programmes').select('structure').eq('user_id', currentUser.id);
    const out = Array.from({ length: 7 }, () => []);
    for (const p of data ?? []) {
      for (const j of Array.isArray(p.structure) ? p.structure : []) {
        if (j && typeof j === 'object') (j.joursSemaine ?? []).forEach(d => out[d]?.push(j.nom));
      }
    }
    return out;
  } catch {
    return Array.from({ length: 7 }, () => []);
  }
}

export async function syncReminders(planning, { force = false } = {}) {
  if (!currentUser) return false;
  const p = _clean(planning ?? await getPlanning());
  // Aucun rappel réglé : rien à programmer (sauf pour effacer d'anciens rappels).
  if (!force && !(p.heure && p.jours.length)) return true;
  try {
    const last = Number(localStorage.getItem(_syncKey()) || 0);
    if (!force && Date.now() - last < 12 * 3600 * 1000) return true;
  } catch {}

  let items = [];
  if (p.heure && p.jours.length) {
    const [h, m] = p.heure.split(':').map(Number);
    const names = await _plannedNames();
    let doneToday = false;
    try {
      const { data } = await supabase.from('seances').select('id').eq('user_id', currentUser.id).eq('date', localDateStr()).limit(1);
      doneToday = !!data?.length;
    } catch {}
    const now = new Date();
    for (let k = 0; k < 7; k++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, h, m, 0);
      const wd = weekdayIdx(d);
      if (!p.jours.includes(wd) || d <= now) continue;
      if (k === 0 && doneToday) continue;
      const prevu = names[wd];
      items.push({
        deliver_at: d.toISOString(),
        body: prevu.length ? `Au programme : ${prevu.join(', ')}` : 'C’est un de tes jours d’entraînement.',
      });
    }
  }
  const ok = await scheduleReminders(items);
  if (ok) { try { localStorage.setItem(_syncKey(), String(Date.now())); } catch {} }
  return ok;
}

export function initReminders() {
  // Laisse l'appli finir de démarrer avant de parler au serveur.
  setTimeout(() => { syncReminders().catch(() => {}); }, 4000);
}
