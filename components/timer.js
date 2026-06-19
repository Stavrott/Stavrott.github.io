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
let audioCtx   = null;

// ── Accesseurs DOM ─────────────────────────────────────────────────────

const overlay   = () => document.getElementById('timer-overlay');
const display   = () => document.getElementById('timer-display');
const status    = () => document.getElementById('timer-status');
const ringFill  = () => document.getElementById('timer-ring-fill');
const btnStart  = () => document.getElementById('timer-start-stop');
const iconPlay  = () => document.querySelector('#timer-start-stop .icon-play');
const iconPause = () => document.querySelector('#timer-start-stop .icon-pause');

// ── État exposé (lu par js/active-bar.js pour la barre flottante unifiée) ─

export function isMinimized()        { return minimized; }
export function getRemainingSeconds() { return remaining; }
export function restoreTimer()        { restore(); }

// ── Rendu ──────────────────────────────────────────────────────────────

function updateDisplay() {
  const dispEl = display();
  if (!dispEl) return;

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
    minimized = false;
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
// (poignée glissée vers le bas, ou simple tap) et reprendre l'interaction
// avec la séance en dessous. L'état minimisé est lu par js/active-bar.js,
// qui affiche alors le décompte dans la même barre flottante que la
// séance en cours plutôt que d'avoir deux pastilles séparées.

function minimize() {
  minimized = true;
  overlay()?.classList.add('hidden');
}

function restore() {
  minimized = false;
  overlay()?.classList.remove('hidden');
  updateDisplay();
}

// ── Glisser la poignée vers le bas pour minimiser ───────────────────────

function _bindDragToMinimize() {
  const handle = document.getElementById('timer-minimize');
  const sheet  = document.querySelector('#timer-overlay .timer-sheet');
  if (!handle || !sheet) return;

  const DISMISS_THRESHOLD = 60;
  let startY = null, dy = 0;

  const onMove = (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    sheet.style.transition = 'none';
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const onUp = () => {
    if (startY === null) return;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > DISMISS_THRESHOLD) minimize();
    startY = null; dy = 0;
  };

  handle.addEventListener('pointerdown', (e) => { startY = e.clientY; dy = 0; });
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

// ── Son ──────────────────────────────────────────────────────────────────
// Les navigateurs exigent qu'un AudioContext soit créé/débloqué pendant un
// geste utilisateur — on le fait dès le premier tap dans l'app pour pouvoir
// rejouer un son plus tard depuis le tick du minuteur (qui n'est pas un
// geste utilisateur).

function _unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {}
}

function _beep() {
  if (!audioCtx) return;
  try {
    [[0, 880], [0.18, 1046], [0.36, 1318]].forEach(([delay, freq]) => {
      const osc = audioCtx.createOscillator();
      const g   = audioCtx.createGain();
      osc.connect(g); g.connect(audioCtx.destination);
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.35, audioCtx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + 0.28);
      osc.start(audioCtx.currentTime + delay);
      osc.stop(audioCtx.currentTime + delay + 0.32);
    });
  } catch {}
}

// ── Notifications ──────────────────────────────────────────────────────

function _notifyEnd() {
  _beep();
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

  // Débloquer l'audio dès le premier tap dans l'app (cf. note plus haut)
  document.addEventListener('pointerdown', _unlockAudio, { once: true });

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

  // Minimiser : tap sur la poignée, glisser la poignée vers le bas, ou tap sur le fond
  document.getElementById('timer-minimize')?.addEventListener('click', minimize);
  document.getElementById('timer-backdrop')?.addEventListener('click', minimize);
  _bindDragToMinimize();

  // Rattraper la dérive (et déclencher la notif si le temps est déjà
  // écoulé) dès que l'app redevient visible — utile quand les timers JS
  // sont throttlés ou suspendus en arrière-plan.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isRunning) tick();
  });
}
