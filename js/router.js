// Routeur SPA basé sur les hash (#page)

const pages = ['home', 'seances', 'programmes', 'stats', 'nutrition', 'exercices', 'profil'];

let _currentPage = 'home';
let _pageLoaders = {};
let _titleMap = {};

export function registerPage(id, loader, title) {
  _pageLoaders[id] = loader;
  _titleMap[id] = title;
}

export function getCurrentPage() {
  return _currentPage;
}

export async function navigate(pageId, params = {}) {
  if (!pages.includes(pageId)) pageId = 'home';

  const prev = _currentPage;
  _currentPage = pageId;

  // Mettre à jour le hash sans recharger
  history.replaceState({ page: pageId }, '', `#${pageId}`);

  // Afficher / masquer les sections
  pages.forEach((id) => {
    const el = document.getElementById(`page-${id}`);
    if (el) el.classList.toggle('active', id === pageId);
    if (el) el.classList.toggle('hidden', id !== pageId);
  });

  // Mettre à jour la nav
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });

  // Mettre à jour le titre du header
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = _titleMap[pageId] || 'Forme';

  // Bouton retour (affiché uniquement si on n'est pas sur home)
  const backBtn = document.getElementById('back-btn');
  if (backBtn) backBtn.classList.toggle('hidden', pageId === 'home');

  // Charger la page via son loader
  if (_pageLoaders[pageId]) {
    const section = document.getElementById(`page-${pageId}`);
    await _pageLoaders[pageId](section, params);
  }
}

export function initRouter() {
  // Naviguer depuis la nav du bas
  document.getElementById('bottom-nav')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-item');
    if (btn?.dataset.page) navigate(btn.dataset.page);
  });

  // Bouton retour
  document.getElementById('back-btn')?.addEventListener('click', () => navigate('home'));

  // Lire le hash initial
  const hash = location.hash.replace('#', '');
  navigate(pages.includes(hash) ? hash : 'home');

  // Réagir aux changements de hash (bouton retour natif)
  window.addEventListener('hashchange', () => {
    const page = location.hash.replace('#', '');
    if (pages.includes(page) && page !== _currentPage) navigate(page);
  });
}
