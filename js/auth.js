import { supabase } from './supabase.js';
import { showToast, showLoading, hideLoading } from './utils.js';

// Utilisateur courant (mis à jour par onAuthChange)
export let currentUser = null;

// ── Initialisation ───────────────────────────────────────────────────

export async function initAuth(onLoggedIn, onLoggedOut) {
  // Récupérer la session existante
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    onLoggedIn(session.user);
  } else {
    onLoggedOut();
  }

  // Écouter les changements d'état d'authentification
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      currentUser = session.user;
      onLoggedIn(session.user);
    } else {
      currentUser = null;
      onLoggedOut();
    }
  });
}

// ── Connexion ────────────────────────────────────────────────────────

export async function signIn(email, password) {
  showLoading();
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  } finally {
    hideLoading();
  }
}

// ── Inscription ──────────────────────────────────────────────────────

export async function signUp(email, password, prenom) {
  showLoading();
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { prenom } },
    });
    if (error) throw error;

    // Créer le profil utilisateur
    if (data.user) {
      await supabase.from('profils').upsert({
        user_id: data.user.id,
        prenom,
        created_at: new Date().toISOString(),
      });
    }
    return data.user;
  } finally {
    hideLoading();
  }
}

// ── Mot de passe oublié ──────────────────────────────────────────────

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) throw error;
}

// ── Déconnexion ──────────────────────────────────────────────────────

export async function signOut() {
  showLoading();
  try {
    await supabase.auth.signOut();
    showToast('Déconnecté avec succès', 'success');
  } catch (e) {
    showToast('Erreur lors de la déconnexion', 'error');
  } finally {
    hideLoading();
  }
}

// ── Profil ───────────────────────────────────────────────────────────

export function getUserPrenom() {
  if (!currentUser) return 'Sportif';
  return currentUser.user_metadata?.prenom
    || currentUser.email?.split('@')[0]
    || 'Sportif';
}
