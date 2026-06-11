import { initAuth, signIn, signUp, signOut, resetPassword, getUserPrenom, currentUser } from './auth.js';
import { initRouter, registerPage, navigate } from './router.js';
import { showToast, lsGet, lsSet } from './utils.js';
import { exportAllData as exportData, importAllData } from './supabase.js';

import { loadHome }        from '../pages/home.js';
import { loadSeances }     from '../pages/seances.js';
import { loadProgrammes }  from '../pages/programmes.js';
import { loadStats }       from '../pages/stats.js';
import { loadNutrition }   from '../pages/nutrition.js';
import { loadExercices }   from '../pages/exercices.js';
import { loadProfil }      from '../pages/profil.js';
import { initTimer }       from '../components/timer.js';
import { initOnboarding, checkOnboardingDone } from '../pages/onboarding.js';

// ── Thème ────────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.getElementById('theme-meta');
  if (meta) meta.content = theme === 'dark' ? '#0f0f0f' : '#f0f0f0';

  const sun  = document.querySelector('.icon-sun');
  const moon = document.querySelector('.icon-moon');
  if (sun)  sun.classList.toggle('hidden', theme === 'dark');
  if (moon) moon.classList.toggle('hidden', theme === 'light');

  lsSet('theme', theme);
}

function initTheme() {
  const saved = lsGet('theme');
  const preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  applyTheme(saved || preferred);

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

// ── Auth UI ───────────────────────────────────────────────────────────

// Traduction des messages d'erreur Supabase
function _authErrFr(msg = '') {
  if (msg.includes('Invalid login credentials'))     return 'Email ou mot de passe incorrect.';
  if (msg.includes('Email not confirmed'))           return 'Email non confirmé. Vérifiez votre boîte mail.';
  if (msg.includes('User already registered'))       return 'Un compte existe déjà avec cet email.';
  if (msg.includes('Password should be at least'))  return 'Le mot de passe doit contenir au moins 6 caractères.';
  if (msg.includes('Unable to validate email'))     return 'Adresse e-mail invalide.';
  if (msg.includes('signup is disabled'))           return 'Les inscriptions sont désactivées.';
  if (msg.includes('rate limit'))                   return 'Trop de tentatives. Réessayez dans quelques minutes.';
  return msg;
}

function initAuthUI() {
  const authScreen = document.getElementById('auth-screen');
  const tabBtns    = authScreen.querySelectorAll('.tab-btn');
  const loginForm  = document.getElementById('login-form');
  const regForm    = document.getElementById('register-form');
  const resetForm  = document.getElementById('reset-form');
  const errorEl    = document.getElementById('auth-error');
  const successEl  = document.getElementById('auth-success');

  const showError   = (msg) => { errorEl.textContent = _authErrFr(msg); errorEl.classList.remove('hidden'); successEl?.classList.add('hidden'); };
  const showSuccess = (msg) => { if (successEl) { successEl.textContent = msg; successEl.classList.remove('hidden'); } errorEl.classList.add('hidden'); };
  const clearMsgs   = () => { errorEl.classList.add('hidden'); successEl?.classList.add('hidden'); };

  function showView(view) {
    loginForm.classList.toggle('hidden', view !== 'login');
    regForm.classList.toggle('hidden',   view !== 'register');
    resetForm?.classList.toggle('hidden', view !== 'reset');
    // Mettre à jour les onglets
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === view));
    clearMsgs();
  }

  // Onglets connexion / inscription
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.tab));
  });

  // Connexion
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsgs();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = loginForm.querySelector('button[type=submit]');
    btn.disabled   = true;
    btn.textContent = 'Connexion…';
    try {
      await signIn(email, password);
    } catch (err) {
      showError(err.message);
      btn.disabled   = false;
      btn.textContent = 'Se connecter';
    }
  });

  // Inscription
  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsgs();
    const prenom   = document.getElementById('register-name').value.trim();
    const email    = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const btn      = regForm.querySelector('button[type=submit]');
    btn.disabled   = true;
    btn.textContent = 'Création…';
    try {
      await signUp(email, password, prenom);
      showSuccess(`Compte créé ! Un e-mail de confirmation a été envoyé à ${email}. Cliquez sur le lien pour activer votre compte.`);
      showView('login');
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled   = false;
      btn.textContent = "S'inscrire";
    }
  });

  // Mot de passe oublié — lien
  document.getElementById('btn-forgot-password')?.addEventListener('click', () => showView('reset'));
  document.getElementById('btn-back-login')?.addEventListener('click',  () => showView('login'));

  // Formulaire reset
  resetForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMsgs();
    const email = document.getElementById('reset-email').value.trim();
    const btn   = resetForm.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Envoi…';
    try {
      await resetPassword(email);
      showSuccess(`Lien de réinitialisation envoyé à ${email}. Vérifiez votre boîte mail.`);
      showView('login');
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Envoyer le lien';
    }
  });
}

// ── Drawer utilisateur ────────────────────────────────────────────────

function initUserDrawer() {
  const drawer  = document.getElementById('user-drawer');
  const overlay = drawer.querySelector('.drawer-overlay');

  document.getElementById('user-menu-btn')?.addEventListener('click', () => {
    // Remplir les infos
    const user   = currentUser;
    const prenom = getUserPrenom();
    document.getElementById('drawer-avatar').textContent = prenom.charAt(0).toUpperCase();
    document.getElementById('drawer-name').textContent   = prenom;
    document.getElementById('drawer-email').textContent  = user?.email || '';
    drawer.classList.remove('hidden');
  });

  overlay.addEventListener('click', () => drawer.classList.add('hidden'));

  // Profil
  document.getElementById('btn-profil')?.addEventListener('click', () => {
    drawer.classList.add('hidden');
    import('../js/router.js').then(({ navigate }) => navigate('profil'));
  });

  // Déconnexion
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    drawer.classList.add('hidden');
    await signOut();
  });

  // Export JSON
  document.getElementById('btn-export')?.addEventListener('click', async () => {
    drawer.classList.add('hidden');
    try {
      const data = await exportData(currentUser.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `musclapp-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Export réussi !', 'success');
    } catch {
      showToast('Erreur lors de l\'export', 'error');
    }
  });

  // Import JSON
  document.getElementById('btn-import')?.addEventListener('click', () => {
    drawer.classList.add('hidden');
    document.getElementById('import-file-input').click();
  });

  document.getElementById('import-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      await importAllData(currentUser.id, json);
      showToast('Import réussi !', 'success');
      navigate('home');
    } catch {
      showToast('Fichier invalide ou erreur d\'import', 'error');
    }
    e.target.value = '';
  });
}

// ── Enregistrement des pages ──────────────────────────────────────────

function registerPages() {
  registerPage('home',        loadHome,       'Esse');
  registerPage('seances',     loadSeances,    'Séances');
  registerPage('programmes',  loadProgrammes, 'Programmes');
  registerPage('stats',       loadStats,      'Statistiques');
  registerPage('nutrition',   loadNutrition,  'Nutrition');
  registerPage('exercices',   loadExercices,  'Exercices');
  registerPage('profil',      loadProfil,     'Mon profil');
}

// ── Boot ──────────────────────────────────────────────────────────────

let _appInitialized = false;

function _initEmbers() {
  const screen = document.getElementById('auth-screen');
  if (!screen || screen.querySelector('.ember')) return;
  for (let i = 0; i < 24; i++) {
    const el    = document.createElement('div');
    el.className = 'ember';
    const size  = (1.5 + Math.random() * 3).toFixed(1);
    const left  = (5  + Math.random() * 90).toFixed(1);
    const dur   = (3.5 + Math.random() * 5).toFixed(1);
    const delay = (-(Math.random() * 9)).toFixed(1);
    const drift = ((Math.random() - 0.5) * 90).toFixed(0);
    const bright = (0.55 + Math.random() * 0.45).toFixed(2);
    el.style.cssText =
      `width:${size}px;height:${size}px;left:${left}%;bottom:0;` +
      `--dur:${dur}s;--delay:${delay}s;--drift:${drift}px;--bright:${bright};`;
    screen.appendChild(el);
  }
}

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('onboarding-screen').classList.add('hidden');
  document.getElementById('main-app').classList.add('hidden');
  _initEmbers();
}

function _launchApp() {
  _appInitialized = true;
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('onboarding-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  initTimer();
  initUserDrawer();
  registerPages();
  initRouter();
}

function _onLoggedIn(user) {
  if (_appInitialized) {
    // Rafraîchissement de token — l'app tourne déjà
    document.getElementById('auth-screen').classList.add('hidden');
    return;
  }

  if (!checkOnboardingDone(user.id)) {
    document.getElementById('auth-screen').classList.add('hidden');
    const screen = document.getElementById('onboarding-screen');
    screen.classList.remove('hidden');
    initOnboarding(screen, () => _launchApp());
  } else {
    _launchApp();
  }
}

async function boot() {
  initTheme();
  initAuthUI();
  _initDemoButton();

  await initAuth(_onLoggedIn, showAuth);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/esse-app/service-worker.js')
      .catch(() => {});
  }
}

// ── Bouton Mode démo (localhost uniquement) ───────────────────────────

function _initDemoButton() {
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!isLocalhost) return;

  const section = document.getElementById('auth-demo-section');
  const btn     = document.getElementById('btn-demo');
  if (!section || !btn) return;

  section.classList.remove('hidden');

  btn.addEventListener('click', () => {
    // S'assurer d'être sur l'onglet Connexion
    document.querySelector('.tab-btn[data-tab="login"]')?.click();
    const emailEl = document.getElementById('login-email');
    const pwdEl   = document.getElementById('login-password');
    if (emailEl) emailEl.value = 'demo@musclapp.fr';
    if (pwdEl)   pwdEl.value   = 'Demo1234!';
    document.getElementById('login-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

boot();
