// Barre persistante affichant la séance en cours ou le minuteur de repos
// minimisé. Le contenu dépend de la page :
// - Sur la page Séances (qui a déjà sa propre barre inline détaillée),
//   cette barre flottante ne concerne QUE le repos minimisé — tap pour le
//   rouvrir.
// - Sur toute autre page (accueil, etc.), elle concerne toujours la séance
//   elle-même (jamais le repos, qui est un détail interne à la séance) —
//   tap pour y retourner ; le repos minimisé s'affichera alors une fois sur
//   place.
import { hasActiveSeance, getActiveSeance, getElapsedSeconds, getCurrentExerciceNom, getNextExerciceNom, requestFinishSeance } from '../pages/seance-active.js';
import { isMinimized, getRemainingSeconds, restoreTimer } from '../components/timer.js';
import { navigate, getCurrentPage } from './router.js';
import { formatTime } from './utils.js';

let _intervalId = null;

export function initActiveBar() {
  const bar = document.getElementById('active-seance-bar');
  if (!bar) return;

  const open = () => {
    if (getCurrentPage() === 'seances' && isMinimized()) restoreTimer();
    else navigate('seances');
  };

  bar.addEventListener('click', open);
  bar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });

  document.getElementById('asb-stop')?.addEventListener('click', (e) => {
    e.stopPropagation();
    requestFinishSeance();
  });

  if (_intervalId) clearInterval(_intervalId);
  _intervalId = setInterval(_tick, 500);
  _tick();
}

function _tick() {
  const bar = document.getElementById('active-seance-bar');
  if (!bar) return;

  const onSeancesPage = getCurrentPage() === 'seances';
  const showRest      = onSeancesPage && isMinimized();
  const showSeance     = !onSeancesPage && hasActiveSeance();
  const show           = showRest || showSeance;

  bar.classList.toggle('hidden', !show);
  if (!show) return;

  if (showRest) {
    const next = getNextExerciceNom();
    document.getElementById('asb-nom').textContent  = 'Repos';
    document.getElementById('asb-sub').textContent  = next ? `Prochain : ${next}` : '';
    document.getElementById('asb-time').textContent = formatTime(getRemainingSeconds());
  } else {
    const seance  = getActiveSeance();
    const current = getCurrentExerciceNom();
    document.getElementById('asb-nom').textContent  = seance?.nom ?? 'Séance';
    document.getElementById('asb-sub').textContent  = current ?? '';
    document.getElementById('asb-time').textContent = formatTime(getElapsedSeconds());
  }
}
