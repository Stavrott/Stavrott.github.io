// ── Espace coach : données ────────────────────────────────────────────
// Un coach invite ses membres avec un code, leur assigne ses programmes
// et suit leurs séances. Voir supabase/migrations/20261013_coaching.sql :
// les séances d'un membre ne sont lisibles par son coach qu'au travers
// des fonctions SQL (mes_membres, suivi_membre), jamais en direct.
import { currentUser } from './auth.js';
import { supabase }    from './supabase.js';

// La migration n'a pas encore été jouée : tables ou fonctions absentes.
export function isCoachingMissing(error) {
  return ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error?.code);
}

function _check({ data, error }) {
  if (error) throw error;
  return data;
}

// Message lisible pour les erreurs levées par les fonctions SQL.
export function coachingErrorMessage(error) {
  const msg = error?.message ?? '';
  if (msg.includes('code_invalide'))  return 'Code inconnu ou expiré. Demande un nouveau code à ton coach.';
  if (msg.includes('code_personnel')) return 'C’est ton propre code : envoie-le à tes membres.';
  if (isCoachingMissing(error))       return 'Le coaching n’est pas encore activé sur la base (migration à lancer).';
  return 'Une erreur est survenue, réessaie.';
}

// ── Côté membre ───────────────────────────────────────────────────────

export async function fetchMesCoachs() {
  return _check(await supabase.rpc('mes_coachs')) ?? [];
}

export async function rejoindreCoach(code) {
  return _check(await supabase.rpc('rejoindre_coach', { p_code: code }));
}

export async function quitterCoach(coachId) {
  _check(await supabase.from('coach_liens').delete()
    .eq('coach_id', coachId).eq('membre_id', currentUser.id));
}

// Programmes assignés par mes coachs, au même format que fetchProgrammes()
// (structure brute : à normaliser par l'appelant), marqués coach: true.
export async function fetchProgrammesAssignes() {
  const rows = _check(await supabase.from('programmes_assignes')
    .select('id, coach_id, created_at, programme:programmes(id, nom, description, structure)')
    .eq('membre_id', currentUser.id)
    .order('created_at', { ascending: true })) ?? [];
  return rows
    .filter(r => r.programme)
    .map(r => ({ ...r.programme, coach: true, coach_id: r.coach_id, assigne_le: r.created_at }));
}

// ── Côté coach ────────────────────────────────────────────────────────

export async function fetchMembres() {
  return _check(await supabase.rpc('mes_membres')) ?? [];
}

// { code, expire_le } — nouveau = true révoque le code en cours.
export async function fetchInvitation(nouveau = false) {
  return _check(await supabase.rpc('coach_invitation', { p_nouveau: nouveau }));
}

export function invitationLink(code) {
  return `${location.origin}${location.pathname}?coach=${encodeURIComponent(code)}`;
}

// 30 dernières séances du membre : { id, nom, date, duree_minutes,
// programme_id, records, nb_series, volume, exercices }.
export async function fetchSuiviMembre(membreId) {
  return _check(await supabase.rpc('suivi_membre', { p_membre: membreId })) ?? [];
}

export async function fetchAssignations(membreId) {
  return _check(await supabase.from('programmes_assignes')
    .select('id, programme_id, created_at')
    .eq('coach_id', currentUser.id).eq('membre_id', membreId)) ?? [];
}

export async function assignerProgramme(membreId, programmeId) {
  _check(await supabase.from('programmes_assignes')
    .insert({ coach_id: currentUser.id, membre_id: membreId, programme_id: programmeId }));
}

export async function retirerAssignation(id) {
  _check(await supabase.from('programmes_assignes').delete().eq('id', id));
}

export async function retirerMembre(membreId) {
  _check(await supabase.from('coach_liens').delete()
    .eq('coach_id', currentUser.id).eq('membre_id', membreId));
}

// ── Lien d'invitation (?coach=CODE) ───────────────────────────────────
// Lu au démarrage, gardé le temps de l'inscription (la confirmation par
// e-mail rouvre l'appli dans un autre onglet, d'où localStorage), de la
// connexion et de l'onboarding, puis consommé par l'onglet Coaching.

const PENDING_KEY = 'coach_code_pending';

export function capturePendingCode() {
  const params = new URLSearchParams(location.search);
  const code = params.get('coach');
  if (!code) return;
  try { localStorage.setItem(PENDING_KEY, code); } catch {}
  params.delete('coach');
  const qs = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}

export function takePendingCode() {
  try {
    const code = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
    return code;
  } catch { return null; }
}

export function hasPendingCode() {
  try { return !!localStorage.getItem(PENDING_KEY); } catch { return false; }
}
