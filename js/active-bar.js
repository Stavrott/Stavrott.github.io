// Barre persistante affichant la séance en cours sur toutes les pages
// (sauf sur la page Séances elle-même, qui a déjà sa propre barre).
import { hasActiveSeance, getActiveSeance, getElapsedSeconds } from '../pages/seance-active.js';
import { navigate, getCurrentPage } from './router.js';
import { formatTime } from './utils.js';

let _intervalId = null;

export function initActiveBar() {
  const bar = document.getElementById('active-seance-bar');
  if (!bar) return;

  bar.addEventListener('click', () => navigate('seances'));

  if (_intervalId) clearInterval(_intervalId);
  _intervalId = setInterval(_tick, 1000);
  _tick();
}

function _tick() {
  const bar = document.getElementById('active-seance-bar');
  if (!bar) return;

  const active = hasActiveSeance() && getCurrentPage() !== 'seances';
  bar.classList.toggle('hidden', !active);
  if (!active) return;

  const seance = getActiveSeance();
  document.getElementById('asb-nom').textContent  = seance?.nom ?? 'Séance';
  document.getElementById('asb-time').textContent = formatTime(getElapsedSeconds());
}
