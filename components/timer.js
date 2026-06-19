import { formatTime } from '../js/utils.js';
import { APP_CONFIG } from '../js/config.js';

// Circonférence de l'anneau (r=88): 2π×88 ≈ 552.9
const CIRCUMFERENCE = 2 * Math.PI * 88;

let intervalId = null;
let remaining  = 0;
let totalTime  = 0;
let isRunning  = false;

// ── Accesseurs DOM ─────────────────────────────────────────────────────

const overlay   = () => document.getElementById('timer-overlay');
const display   = () => document.getElementById('timer-display');
const status    = () => document.getElementById('timer-status');
const ringFill  = () => document.getElementById('timer-ring-fill');
const btnStart  = () => document.getElementById('timer-start-stop');
const iconPlay  = () => document.querySelector('#timer-start-stop .icon-play');
const iconPause = () => document.querySelector('#timer-start-stop .icon-pause');

// ── Rendu ──────────────────────────────────────────────────────────────

function updateDisplay() {
  const dispEl = display();
  if (!dispEl) return;

  dispEl.textContent = formatTime(remaining);

  const ratio = totalTime > 0 ? remaining / totalTime : 1;

  // Couleur selon le temps restant
  let state = '';
  if (ratio < 0.25)      state = 'done';
  else if (ratio < 0.50) state = 'warning';

  dispEl.className = 'timer-display' + (state ? ' ' + state : '');

  // Anneau SVG
  const ring = ringFill();
  if (ring) {
    const offset = CIRCUMFERENCE * (1 - ratio);
    ring.style.strokeDashoffset = offset;
    ring.setAttribute('class', 'timer-ring-fill' + (state ? ' ' + state : ''));
  }

  // Statut texte
  const statEl = status();
  if (statEl) {
    if (remaining <= 0) statEl.textContent = 'Terminé !';
    else if (!isRunning) statEl.textContent = 'En pause';
    else statEl.textContent = 'En cours';
  }
}

// ── Moteur ─────────────────────────────────────────────────────────────

function tick() {
  if (remaining <= 0) {
    stop();
    updateDisplay();
    _notifyEnd();
    return;
  }
  remaining--;
  updateDisplay();
}

function start() {
  if (intervalId) clearInterval(intervalId);
  isRunning  = true;
  intervalId = setInterval(tick, 1000);
  iconPlay()?.classList.add('hidden');
  iconPause()?.classList.remove('hidden');
  updateDisplay();
}

function pause() {
  clearInterval(intervalId);
  intervalId = null;
  isRunning  = false;
  iconPlay()?.classList.remove('hidden');
  iconPause()?.classList.add('hidden');
  updateDisplay();
}

function stop() {
  clearInterval(intervalId);
  intervalId = null;
  isRunning  = false;
}

function adjust(delta) {
  remaining = Math.max(0, Math.min(remaining + delta, 600));
  if (totalTime < remaining) totalTime = remaining;
  updateDisplay();
}

// ── Notifications ──────────────────────────────────────────────────────

function _notifyEnd() {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Esse — Repos terminé !', {
      body: 'C\'est l\'heure de votre prochaine série',
      icon: '/esse-app/icons/icon-192.png',
      tag:  'timer-done',
    });
  }
  if ('vibrate' in navigator) navigator.vibrate([150, 80, 150]);
}

// ── API publique ───────────────────────────────────────────────────────

export function startRestTimer(seconds = APP_CONFIG.defaultRestTime) {
  totalTime = seconds;
  remaining = seconds;

  // Initialiser l'anneau
  const ring = ringFill();
  if (ring) {
    ring.style.strokeDasharray  = CIRCUMFERENCE;
    ring.style.strokeDashoffset = 0;
  }

  overlay()?.classList.remove('hidden');
  updateDisplay();
  start();
}

export function hideTimer() {
  stop();
  overlay()?.classList.add('hidden');
}

export function initTimer() {
  const ov = overlay();
  if (!ov) return;

  // Initialiser l'anneau
  const ring = ringFill();
  if (ring) ring.style.strokeDasharray = CIRCUMFERENCE;

  // Demander permission notifications
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Pause / Reprendre
  btnStart()?.addEventListener('click', () => {
    if (isRunning) pause();
    else {
      if (remaining <= 0) { remaining = totalTime || APP_CONFIG.defaultRestTime; }
      start();
    }
  });

  // ±15 secondes
  document.getElementById('timer-minus')?.addEventListener('click', () => adjust(-15));
  document.getElementById('timer-plus')?.addEventListener('click',  () => adjust(+15));

  // Passer le repos
  document.getElementById('timer-skip')?.addEventListener('click', hideTimer);

  // Backdrop : ferme l'overlay sans stopper
  document.getElementById('timer-backdrop')?.addEventListener('click', () => {
    overlay()?.classList.add('hidden');
  });
}
