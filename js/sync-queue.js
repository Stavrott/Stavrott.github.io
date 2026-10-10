// ── File d'attente hors-ligne ──────────────────────────────────────────
// En salle, le réseau coupe souvent (sous-sol, Wi-Fi captif). Une série
// validée ne doit jamais être perdue pour autant : si l'écriture échoue,
// elle part dans cette file (localStorage) et est rejouée dès que le
// réseau revient — à l'ouverture de l'app, toutes les 30 s et à chaque
// retour en ligne. L'ordre des opérations est respecté.

import { supabase } from './supabase.js';

const KEY = 'forme_sync_queue';
let _busy = false;
let _started = false;

function _load() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? []; } catch { return []; }
}

function _save(q) {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch {}
  window.dispatchEvent(new CustomEvent('forme-sync-change', { detail: { pending: q.length } }));
}

const _newId = () => 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function pendingCount() { return _load().length; }

export function enqueueInsert(table, row) {
  const id = _newId();
  const q = _load();
  q.push({ id, op: 'insert', table, row, tries: 0 });
  _save(q);
  return id;
}

export function enqueueUpdate(table, matchId, changes) {
  const q = _load();
  q.push({ id: _newId(), op: 'update', table, matchId, changes, tries: 0 });
  _save(q);
}

export function enqueueDelete(table, matchId) {
  const q = _load();
  q.push({ id: _newId(), op: 'delete', table, matchId, tries: 0 });
  _save(q);
}

// Une série encore en attente qu'on dé-valide : on la retire de la file
// plutôt que de l'insérer puis la supprimer.
export function cancelQueued(id) {
  _save(_load().filter(x => x.id !== id));
}

// Valeur corrigée sur une série encore en attente.
export function patchQueuedInsert(id, changes) {
  const q = _load();
  const it = q.find(x => x.id === id && x.op === 'insert');
  if (!it) return false;
  Object.assign(it.row, changes);
  _save(q);
  return true;
}

// Erreur renvoyée par la base elle-même (contrainte, colonne absente…) :
// la rejouer ne changera rien. Sans code, c'est le réseau : on réessaiera.
function _isPermanent(error) {
  return !!error?.code && /^[0-9A-Z]{5}$/.test(String(error.code));
}

async function _run(it) {
  if (it.op === 'insert') {
    const { data, error } = await supabase.from(it.table).insert(it.row).select('id').single();
    if (!error && data?.id) {
      window.dispatchEvent(new CustomEvent('forme-sync-inserted', { detail: { localId: it.id, id: data.id, table: it.table } }));
    }
    return error ?? null;
  }
  if (it.op === 'update') {
    const { error } = await supabase.from(it.table).update(it.changes).eq('id', it.matchId);
    return error ?? null;
  }
  if (it.op === 'delete') {
    const { error } = await supabase.from(it.table).delete().eq('id', it.matchId);
    return error ?? null;
  }
  return null;
}

export async function flushQueue() {
  if (_busy || !navigator.onLine) return;
  _busy = true;
  try {
    for (const it of _load()) {
      let error = null;
      try { error = await _run(it); } catch (e) { error = { message: String(e) }; }
      let q = _load();
      const cur = q.find(x => x.id === it.id);
      if (!cur) continue; // annulée entre-temps
      if (!error) {
        _save(q.filter(x => x.id !== it.id));
        continue;
      }
      cur.tries = (cur.tries || 0) + 1;
      if (_isPermanent(error) && cur.tries >= 3) {
        console.warn('[sync] opération abandonnée', cur, error);
        _save(q.filter(x => x.id !== it.id));
        continue;
      }
      _save(q);
      break; // réseau indisponible : on garde l'ordre et on réessaiera
    }
  } finally {
    _busy = false;
  }
}

export function initSyncQueue() {
  if (_started) return;
  _started = true;
  window.addEventListener('online', () => flushQueue());
  setInterval(() => flushQueue(), 30000);
  flushQueue();
}
