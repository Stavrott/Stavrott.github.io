// ── Toast ────────────────────────────────────────────────────────────

const toastIcons = {
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;color:var(--color-success)"><polyline points="20 6 9 17 4 12"/></svg>`,
  error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:16px;height:16px;color:var(--color-error)"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;color:var(--color-warning)"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;color:var(--color-info)"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${toastIcons[type] || ''}<span>${message}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('dismiss');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, duration);
}

// ── Loading ──────────────────────────────────────────────────────────

export function showLoading() {
  document.getElementById('loading-overlay').classList.remove('hidden');
}

export function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

// ── Modal ────────────────────────────────────────────────────────────

export function openModal({ title = '', body = '', footer = '', onClose } = {}) {
  const overlay = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal-footer').innerHTML = footer;

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  const close = () => {
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
    if (onClose) onClose();
  };

  document.getElementById('modal-close').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  return close;
}

export function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

// ── Formatage ────────────────────────────────────────────────────────

export function formatDate(dateStr, options = {}) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', {
    weekday: options.weekday,
    day:     'numeric',
    month:   options.short ? 'short' : 'long',
    year:    options.year ? 'numeric' : undefined,
  });
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

export function formatWeight(kg) {
  return kg % 1 === 0 ? `${kg} kg` : `${kg.toFixed(1)} kg`;
}

export function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export function getGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'Bonne nuit';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

export function dayOfWeekFr(date = new Date()) {
  return date.toLocaleDateString('fr-FR', { weekday: 'short' });
}

// ── 1RM (formule Epley) ──────────────────────────────────────────────

export function calc1RM(weight, reps) {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

// ── Debounce ─────────────────────────────────────────────────────────

export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ── DOM helpers ──────────────────────────────────────────────────────

export function el(selector) { return document.querySelector(selector); }
export function els(selector) { return [...document.querySelectorAll(selector)]; }

export function html(strings, ...values) {
  return strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
}

export function emptyState(icon, title, desc, btnLabel, btnId) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <p class="empty-state-title">${title}</p>
      <p class="empty-state-desc">${desc}</p>
      ${btnLabel ? `<button class="btn btn-primary" id="${btnId}">${btnLabel}</button>` : ''}
    </div>`;
}

// ── Local storage helpers ─────────────────────────────────────────────

export function lsGet(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

export function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch {}
}

export function lsRemove(key) { localStorage.removeItem(key); }
