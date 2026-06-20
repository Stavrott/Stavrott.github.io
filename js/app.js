import { initAuth, signIn, signUp, signOut, resetPassword, getUserPrenom, currentUser } from './auth.js';
import { initRouter, registerPage, navigate } from './router.js';
import { showToast, lsGet, lsSet, openModal, closeModal } from './utils.js';
import { exportAllData as exportData, importAllData } from './supabase.js';
import { getProfilSummary } from '../pages/profil.js';

import { loadHome }        from '../pages/home.js';
import { loadSeances }     from '../pages/seances.js';
import { loadProgrammes }  from '../pages/programmes.js';
import { loadStats }       from '../pages/stats.js';
import { loadNutrition }   from '../pages/nutrition.js';
import { loadExercices }   from '../pages/exercices.js';
import { loadProfil }      from '../pages/profil.js';
import { initTimer }       from '../components/timer.js';
import { initOnboarding, checkOnboardingDone, resetOnboardingDone } from '../pages/onboarding.js';
import { openQuickLaunchModal } from './quick-launch.js';
import { initActiveBar }        from './active-bar.js';

// ── Thème ────────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.getElementById('theme-meta');
  if (meta) meta.content = theme === 'dark' ? '#0E0C0A' : '#F4EFE6';
  lsSet('theme', theme);
}

// ── Couleur d'accent ────────────────────────────────────────────────
// Variantes sobres des couleurs classiques — pas de fluo, des teintes
// profondes/désaturées qui restent lisibles en thème sombre et clair.

const ACCENT_PALETTES = [
  { id: 'or',         label: 'Or (défaut)',     hex: '#C9A35C' },
  { id: 'braise',     label: 'Braise',          hex: '#E83000' },
  { id: 'bordeaux',   label: 'Bordeaux',        hex: '#7A2E38' },
  { id: 'marine',     label: 'Marine',          hex: '#1E3A5F' },
  { id: 'emeraude',   label: 'Émeraude',        hex: '#2F6B4F' },
  { id: 'aubergine',  label: 'Aubergine',       hex: '#5B3A6E' },
  { id: 'petrole',    label: 'Pétrole',         hex: '#1F5B5B' },
  { id: 'terracotta', label: 'Terracotta',      hex: '#A6633C' },
  { id: 'vieux-rose', label: 'Vieux rose',      hex: '#9C5564' },
  { id: 'ardoise',    label: 'Ardoise',         hex: '#51596B' },
];
const DEFAULT_ACCENT = ACCENT_PALETTES[0].hex;

function _hexToRgb(hex) {
  const v = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(v.substr(i, 2), 16));
}
function _mixHex(hex, withHex, amount) {
  const [r1, g1, b1] = _hexToRgb(hex);
  const [r2, g2, b2] = _hexToRgb(withHex);
  const m = (a, b) => Math.round(a * (1 - amount) + b * amount);
  return `rgb(${m(r1, r2)}, ${m(g1, g2)}, ${m(b1, b2)})`;
}
function _rgba(hex, a) {
  const [r, g, b] = _hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function applyAccent(hex) {
  const root  = document.documentElement.style;
  const dark  = _mixHex(hex, '#000000', 0.32);
  const hover = _mixHex(hex, '#000000', 0.18);
  const light = _mixHex(hex, '#ffffff', 0.14);

  root.setProperty('--color-primary',       hex);
  root.setProperty('--color-primary-hover', hover);
  root.setProperty('--color-primary-light', _rgba(hex, 0.12));
  root.setProperty('--color-primary-glow',  _rgba(hex, 0.50));
  root.setProperty('--color-primary-glow-s',_rgba(hex, 0.25));
  root.setProperty('--color-primary-grad',  `linear-gradient(135deg, ${dark} 0%, ${hex} 48%, ${light} 100%)`);
  root.setProperty('--color-primary-grad-v',`linear-gradient(180deg, ${dark} 0%, ${hex} 55%, ${light} 100%)`);
  root.setProperty('--shadow-accent',       `0 8px 32px ${_rgba(hex, 0.50)}`);
  root.setProperty('--shadow-accent-sm',    `0 4px 16px ${_rgba(hex, 0.38)}`);
  root.setProperty('--border-focus',        _rgba(hex, 0.58));
  root.setProperty('--border-ember',        _rgba(hex, 0.26));
  root.setProperty('--chart-line',          hex);

  lsSet('accent', hex);
}

function initTheme() {
  const saved = lsGet('theme');
  const preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  applyTheme(saved || preferred);
  applyAccent(lsGet('accent') || DEFAULT_ACCENT);

  document.getElementById('appearance-btn')?.addEventListener('click', _openAppearanceModal);
}

function _appearanceModalBody() {
  const theme  = document.documentElement.getAttribute('data-theme');
  const accent = lsGet('accent') || DEFAULT_ACCENT;
  return `
    <div style="display:flex;flex-direction:column;gap:var(--space-5)">
      <div>
        <p class="form-label" style="margin-bottom:var(--space-3)">Mode</p>
        <div style="display:flex;gap:var(--space-2)">
          <button class="btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'} appearance-mode-btn" data-mode="dark" style="flex:1">🌙 Sombre</button>
          <button class="btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'} appearance-mode-btn" data-mode="light" style="flex:1">☀️ Clair</button>
        </div>
      </div>
      <div>
        <p class="form-label" style="margin-bottom:var(--space-3)">Couleur d'accent</p>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:var(--space-3)">
          ${ACCENT_PALETTES.map(p => `
            <button class="appearance-swatch" data-color="${p.hex}" title="${p.label}" aria-label="${p.label}"
              style="aspect-ratio:1;border-radius:50%;background:${p.hex};cursor:pointer;
                border:2px solid var(--surface);
                box-shadow:${p.hex.toLowerCase() === accent.toLowerCase() ? '0 0 0 2px var(--text-primary)' : 'none'};
                display:flex;align-items:center;justify-content:center">
              ${p.hex.toLowerCase() === accent.toLowerCase() ? `
                <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>` : ''}
            </button>`).join('')}
        </div>
      </div>
    </div>`;
}

function _openAppearanceModal() {
  openModal({ title: 'Apparence', body: _appearanceModalBody() });
  _bindAppearanceModal();
}

function _bindAppearanceModal() {
  document.querySelectorAll('.appearance-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.mode);
      document.getElementById('modal-body').innerHTML = _appearanceModalBody();
      _bindAppearanceModal();
    });
  });
  document.querySelectorAll('.appearance-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      applyAccent(btn.dataset.color);
      document.getElementById('modal-body').innerHTML = _appearanceModalBody();
      _bindAppearanceModal();
    });
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

  document.getElementById('user-menu-btn')?.addEventListener('click', async () => {
    const user   = currentUser;
    const prenom = getUserPrenom();
    document.getElementById('drawer-avatar').textContent = prenom.charAt(0).toUpperCase();
    document.getElementById('drawer-name').textContent   = prenom;
    document.getElementById('drawer-email').textContent  = user?.email || '';
    drawer.classList.remove('hidden');

    // Afficher le résumé du profil (objectif + niveau)
    const badgesEl = document.getElementById('drawer-profile-badges');
    if (badgesEl) {
      badgesEl.innerHTML = '';
      const summary = await getProfilSummary();
      if (summary) {
        [summary.objectifLabel, summary.niveauLabel].filter(Boolean).forEach(label => {
          const span = document.createElement('span');
          span.style.cssText = 'font-size:11px;padding:3px 10px;border-radius:999px;background:var(--color-primary-light);color:var(--color-primary);font-weight:700;white-space:nowrap';
          span.textContent = label;
          badgesEl.appendChild(span);
        });
      }
    }
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
  registerPage('home',        loadHome,       'Forme');
  registerPage('seances',     loadSeances,    'Séances');
  registerPage('programmes',  loadProgrammes, 'Programmes');
  registerPage('stats',       loadStats,      'Statistiques');
  registerPage('nutrition',   loadNutrition,  'Nutrition');
  registerPage('exercices',   loadExercices,  'Exercices');
  registerPage('profil',      loadProfil,     'Mon profil');
}

// ── Boot ──────────────────────────────────────────────────────────────

let _appInitialized = false;

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('onboarding-screen').classList.add('hidden');
  document.getElementById('main-app').classList.add('hidden');
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
  initQuickLaunchLongPress();
  initActiveBar();
}

// ── Appui long sur l'onglet "Séances" → lancement rapide d'une routine ─

function initQuickLaunchLongPress() {
  const btn = document.querySelector('.nav-item[data-page="seances"]');
  if (!btn) return;

  const LONG_PRESS_MS = 500;
  let timer = null;
  let triggered = false;

  const start = () => {
    triggered = false;
    timer = setTimeout(() => {
      triggered = true;
      navigator.vibrate?.(10);
      openQuickLaunchModal();
    }, LONG_PRESS_MS);
  };
  const cancel = () => clearTimeout(timer);

  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup', cancel);
  btn.addEventListener('pointerleave', cancel);
  btn.addEventListener('pointercancel', cancel);

  // Empêche la navigation normale si l'appui long a déjà déclenché la modale
  btn.addEventListener('click', (e) => {
    if (triggered) {
      e.stopPropagation();
      e.preventDefault();
      triggered = false;
    }
  });
}

function _onLoggedIn(user) {
  if (_appInitialized) {
    // Rafraîchissement de token — l'app tourne déjà
    document.getElementById('auth-screen').classList.add('hidden');
    return;
  }

  if (sessionStorage.getItem('force_onboarding') === '1') {
    sessionStorage.removeItem('force_onboarding');
    resetOnboardingDone(user.id);
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
    navigator.serviceWorker.register('/service-worker.js')
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
    sessionStorage.setItem('force_onboarding', '1');
    document.querySelector('.tab-btn[data-tab="login"]')?.click();
    const emailEl = document.getElementById('login-email');
    const pwdEl   = document.getElementById('login-password');
    if (emailEl) emailEl.value = 'demo@musclapp.fr';
    if (pwdEl)   pwdEl.value   = 'Demo1234!';
    document.getElementById('login-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

boot();
