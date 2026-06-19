import { formatTime } from '../js/utils.js';
import { APP_CONFIG } from '../js/config.js';

// Circonférence de l'anneau (r=88): 2π×88 ≈ 552.9
const CIRCUMFERENCE = 2 * Math.PI * 88;

let intervalId = null;
let remaining  = 0;
let totalTime  = 0;
let endTime    = 0;       // timestamp absolu de fin — sert à corriger toute dérive
let isRunning  = false;
let minimized  = false;

// ── Accesseurs DOM ─────────────────────────────────────────────────────

const overlay   = () => document.getElementById('timer-overlay');
const display   = () => document.getElementById('timer-display');
const status    = () => document.getElementById('timer-status');
const ringFill  = () => document.getElementById('timer-ring-fill');
const btnStart  = () => document.getElementById('timer-start-stop');
const iconPlay  = () => document.querySelector('#timer-start-stop .icon-play');
const iconPause = () => document.querySelector('#timer-start-stop .icon-pause');
const miniBar   = () => document.getElementById('rest-timer-mini');
const miniTime  = () => document.getElementById('rtm-time');

// ── Rendu ──────────────────────────────────────────────────────────────

function updateDisplay() {
  const dispEl = display();
  if (dispEl) {
    dispEl.textContent = formatTime(remaining);

    const ratio = totalTime > 0 ? remaining / totalTime : 1;
    let state = '';
    if (ratio < 0.25)      state = 'done';
    else if (ratio < 0.50) state = 'warning';
    dispEl.className = 'timer-display' + (state ? ' ' + state : '');

    const ring = ringFill();
    if (ring) {
      const offset = CIRCUMFERENCE * (1 - ratio);
      ring.style.strokeDashoffset = offset;
      ring.setAttribute('class', 'timer-ring-fill' + (state ? ' ' + state : ''));
    }

    const statEl = status();
    if (statEl) {
      if (remaining <= 0) statEl.textContent = 'Terminé !';
      else if (!isRunning) statEl.textContent = 'En pause';
      else statEl.textContent = 'En cours';
    }
  }

  if (minimized) {
    const mt = miniTime();
    if (mt) mt.textContent = formatTime(remaining);
  }
}

// ── Moteur ─────────────────────────────────────────────────────────────
// `remaining` est recalculé depuis `endTime` (timestamp absolu) à chaque
// tick plutôt que simplement décrémenté — ainsi, si l'intervalle est
// retardé ou suspendu (app en arrière-plan, écran verrouillé...), le
// premier tick qui s'exécute à nouveau rattrape immédiatement le temps
// réellement écoulé au lieu d'accumuler un décalage.

function tick() {
  if (isRunning) remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));

  if (remaining <= 0) {
    stop();
    updateDisplay();
    _notifyEnd();
    _hideMini();
    return;
  }
  updateDisplay();
}

function start() {
  if (intervalId) clearInterval(intervalId);
  isRunning  = true;
  endTime    = Date.now() + remaining * 1000;
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
  if (isRunning) endTime = Date.now() + remaining * 1000;
  updateDisplay();
}

// ── Minimiser / restaurer ───────────────────────────────────────────────
// Le repos n'a plus besoin de bloquer toute la page : on peut le réduire
// en petite pastille flottante (cf. js/active-bar.js pour l'équivalent
// séance en cours) et reprendre l'interaction avec la séance en dessous.

function minimize() {
  minimized = true;
  overlay()?.classList.add('hidden');
  miniBar()?.classList.remove('hidden');
  updateDisplay();
}

function restore() {
  minimized = false;
  miniBar()?.classList.add('hidden');
  overlay()?.classList.remove('hidden');
  updateDisplay();
}

function _hideMini() {
  minimized = false;
  miniBar()?.classList.add('hidden');
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
  minimized = false;
  miniBar()?.classList.add('hidden');

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
  minimized = false;
  miniBar()?.classList.add('hidden');
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

  // Passer le repos — arrêt complet, contrairement à minimiser
  document.getElementById('timer-skip')?.addEventListener('click', hideTimer);

  // Minimiser : poignée du bottom sheet + appui sur le fond
  document.getElementById('timer-minimize')?.addEventListener('click', minimize);
  document.getElementById('timer-backdrop')?.addEventListener('click', minimize);

  // Restaurer depuis la pastille flottante
  miniBar()?.addEventListener('click', restore);

  // Rattraper la dérive (et déclencher la notif si le temps est déjà
  // écoulé) dès que l'app redevient visible — utile quand les timers JS
  // sont throttlés ou suspendus en arrière-plan.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isRunning) tick();
  });
}
