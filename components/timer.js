import { formatTime, lsGet, lsSet } from '../js/utils.js';
import { APP_CONFIG } from '../js/config.js';

let intervalId  = null;
let remaining   = 0;
let isRunning   = false;
let totalTime   = 0;

const widget    = () => document.getElementById('timer-widget');
const display   = () => document.getElementById('timer-display');
const startStop = () => document.getElementById('timer-start-stop');
const resetBtn  = () => document.getElementById('timer-reset');
const iconPlay  = () => document.querySelector('#timer-start-stop .icon-play');
const iconPause = () => document.querySelector('#timer-start-stop .icon-pause');

function tick() {
  if (remaining <= 0) {
    stop();
    display().textContent = '00:00';
    display().className = 'timer-display done';
    notifyEnd();
    return;
  }
  remaining--;
  updateDisplay();
}

function updateDisplay() {
  const el = display();
  if (!el) return;
  el.textContent = formatTime(remaining);

  const ratio = remaining / totalTime;
  el.className = 'timer-display';
  if (ratio < 0.25) el.classList.add('done');
  else if (ratio < 0.5) el.classList.add('warning');
}

function start() {
  if (intervalId) clearInterval(intervalId);
  isRunning  = true;
  intervalId = setInterval(tick, 1000);
  iconPlay()?.classList.add('hidden');
  iconPause()?.classList.remove('hidden');
}

function pause() {
  clearInterval(intervalId);
  intervalId = null;
  isRunning  = false;
  iconPlay()?.classList.remove('hidden');
  iconPause()?.classList.add('hidden');
}

function stop() {
  pause();
  isRunning = false;
}

function reset(seconds) {
  stop();
  remaining = seconds ?? totalTime;
  updateDisplay();
}

function notifyEnd() {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Esse — Repos terminé !', {
      body: 'C\'est l\'heure de votre prochaine série 💪',
      icon: '/esse-app/icons/icon-192.png',
      tag:  'timer-done',
    });
  }
  // Vibration
  if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
}

// ── API publique ──────────────────────────────────────────────────────

export function startRestTimer(seconds = APP_CONFIG.defaultRestTime) {
  totalTime = seconds;
  remaining = seconds;
  updateDisplay();
  widget()?.classList.remove('hidden');
  start();
}

export function hideTimer() {
  stop();
  widget()?.classList.add('hidden');
}

export function initTimer() {
  const w = widget();
  if (!w) return;

  startStop()?.addEventListener('click', () => {
    if (isRunning) pause();
    else {
      if (remaining <= 0) remaining = totalTime || APP_CONFIG.defaultRestTime;
      start();
    }
  });

  resetBtn()?.addEventListener('click', () => reset());

  // Demander la permission de notif au premier usage
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
