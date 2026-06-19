// Barre persistante affichant la séance en cours, ou le minuteur de repos
// minimisé, sur toutes les pages (sauf Séances elle-même qui a déjà sa
// propre barre — sauf si c'est le repos qui doit s'afficher, plus utile).
import { hasActiveSeance, getActiveSeance, getElapsedSeconds } from '../pages/seance-active.js';
import { isMinimized, getRemainingSeconds, restoreTimer } from '../components/timer.js';
import { navigate, getCurrentPage } from './router.js';
import { formatTime } from './utils.js';

let _intervalId = null;

export function initActiveBar() {
  const bar = document.getElementById('active-seance-bar');
  if (!bar) return;

  bar.addEventListener('click', () => {
    if (isMinimized()) restoreTimer();
    else navigate('seances');
  });

  if (_intervalId) clearInterval(_intervalId);
  _intervalId = setInterval(_tick, 500);
  _tick();
}

function _tick() {
  const bar = document.getElementById('active-seance-bar');
  if (!bar) return;

  const restActive   = isMinimized();
  const seanceActive = hasActiveSeance() && getCurrentPage() !== 'seances';
  const show = restActive || seanceActive;

  bar.classList.toggle('hidden', !show);
  if (!show) return;

  if (restActive) {
    document.getElementById('asb-nom').textContent  = 'Repos';
    document.getElementById('asb-time').textContent = formatTime(getRemainingSeconds());
  } else {
    const seance = getActiveSeance();
    document.getElementById('asb-nom').textContent  = seance?.nom ?? 'Séance';
    document.getElementById('asb-time').textContent = formatTime(getElapsedSeconds());
  }
}
