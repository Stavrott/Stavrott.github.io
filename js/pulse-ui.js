// ── Composants partagés de la charte « Pulse » ─────────────────────────
// Anneau d'objectif hebdo, bande des jours de la semaine, calendrier de
// régularité et barres de répartition musculaire. Rendus en HTML (comme
// le reste de l'app) et stylés par css/pulse.css.

import { MUSCLES_TO_GROUP } from './body-map.js';
import { escapeHtml } from './utils.js';

// ── Dates locales ─────────────────────────────────────────────────────
// Les séances sont datées 'YYYY-MM-DD'. On raisonne en jours locaux pour
// qu'une séance faite à 23 h reste sur le bon jour.

export function localKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function mondayOf(d = new Date()) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Nombre de jours distincts avec au moins une séance, par semaine.
function _daysWithSeance(seances) {
  return new Set((seances ?? []).map(s => String(s.date ?? '').slice(0, 10)));
}

// ── Objectif hebdo ────────────────────────────────────────────────────

export const DEFAULT_GOAL = 3;

export function goalOf(frequence) {
  const n = parseInt(frequence, 10);
  return Number.isFinite(n) && n >= 1 && n <= 7 ? n : DEFAULT_GOAL;
}

export const GOAL_LEVELS = {
  1: ['Entretien', 'Idéal pour reprendre ou garder le contact avec la salle.'],
  2: ['Entretien', 'Idéal pour reprendre ou garder le contact avec la salle.'],
  3: ['Régulier', 'Le bon équilibre entre progression et récupération.'],
  4: ['Soutenu', 'Demande une récupération soignée entre les séances.'],
  5: ['Intensif', 'Pour un planning chargé, avec des séances courtes.'],
  6: ['Intensif', 'Pour un planning chargé, avec des séances courtes.'],
  7: ['Tous les jours', 'Pense à alterner les groupes musculaires.'],
};

export function goalRingHTML(done, goal, size = 132) {
  const stroke = 10;
  const r = size / 2 - stroke;
  const C = 2 * Math.PI * r;
  const pct = Math.min(done / goal, 1);
  return `
    <div class="goal-ring" style="width:${size}px;height:${size}px">
      <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <circle class="goal-ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
        <circle class="goal-ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}"/>
      </svg>
      <div class="goal-ring-center" role="img" aria-label="${done} séance${done > 1 ? 's' : ''} sur ${goal} cette semaine">
        <span class="goal-ring-done">${done}</span><span class="goal-ring-goal">/${goal}</span>
      </div>
    </div>`;
}

export function goalLabel(done, goal) {
  const left = goal - done;
  if (left <= 0) return 'Objectif atteint, bien joué';
  return `Encore ${left} séance${left > 1 ? 's' : ''} pour ton objectif`;
}

// Séances distinctes (par jour) de la semaine en cours.
export function weekDoneCount(seances) {
  const start = localKey(mondayOf());
  const days = _daysWithSeance(seances);
  return [...days].filter(k => k >= start).length;
}

export function weekStripHTML(seances) {
  const names = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const letters = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const monday = mondayOf();
  const todayKey = localKey(new Date());
  const days = _daysWithSeance(seances);
  return `
    <div class="week-strip" role="list" aria-label="Jours de la semaine">
      ${letters.map((l, i) => {
        const key = localKey(addDays(monday, i));
        const done = days.has(key);
        const today = key === todayKey;
        const cls = done ? 'is-done' : today ? 'is-today' : '';
        const aria = `${names[i]} : ${done ? 'séance faite' : today ? 'aujourd’hui' : 'pas de séance'}`;
        return `<span class="week-strip-day ${cls}" role="listitem" aria-label="${aria}">${l}</span>`;
      }).join('')}
    </div>`;
}

// Semaines consécutives (terminées, plus la semaine en cours si l'objectif
// y est déjà atteint) où l'objectif a été tenu.
export function goalStreakWeeks(seances, goal) {
  const days = _daysWithSeance(seances);
  const thisMonday = mondayOf();
  const countWeek = (monday) => {
    let n = 0;
    for (let i = 0; i < 7; i++) if (days.has(localKey(addDays(monday, i)))) n++;
    return n;
  };
  let streak = countWeek(thisMonday) >= goal ? 1 : 0;
  for (let w = 1; w < 52; w++) {
    if (countWeek(addDays(thisMonday, -7 * w)) >= goal) streak++;
    else break;
  }
  return streak;
}

// ── Calendrier de régularité (4 semaines, lundi → dimanche) ────────────

export function regularityHTML(seances, goal) {
  const days = _daysWithSeance(seances);
  const thisMonday = mondayOf();
  const todayKey = localKey(new Date());
  const weeks = [];
  for (let w = 3; w >= 0; w--) {
    const monday = addDays(thisMonday, -7 * w);
    const cells = [];
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const key = localKey(addDays(monday, i));
      const done = days.has(key);
      if (done) n++;
      const cls = done ? 'is-done' : key === todayKey ? 'is-today' : key > todayKey ? 'is-future' : '';
      cells.push(`<span class="reg-cell ${cls}"></span>`);
    }
    weeks.push({ cells, n, current: w === 0 });
  }

  const finished = weeks.filter(w => !w.current);
  let streak = 0;
  for (let i = finished.length - 1; i >= 0 && finished[i].n >= goal; i--) streak++;
  const met = finished.filter(w => w.n >= goal).length;
  const summary = streak === finished.length
    ? `Objectif tenu ${streak} semaines d’affilée`
    : `Objectif tenu ${met} semaine${met > 1 ? 's' : ''} sur ${finished.length}`;

  const aria = `${summary}. Séances par semaine : ${weeks.map(w => `${w.n} sur ${goal}`).join(', ')}.`;

  return `
    <div class="reg">
      <p class="reg-summary">${summary}</p>
      <div class="reg-grid" role="img" aria-label="${escapeHtml(aria)}">
        <div class="reg-row reg-head" aria-hidden="true">
          ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(l => `<span>${l}</span>`).join('')}<span class="reg-total">Total</span>
        </div>
        ${weeks.map(w => `
          <div class="reg-row" aria-hidden="true">
            ${w.cells.join('')}
            <span class="reg-total ${w.n >= goal ? 'is-met' : ''}">${w.n}/${goal}</span>
          </div>`).join('')}
      </div>
      <div class="reg-legend" aria-hidden="true">
        <span><i class="reg-cell is-done"></i>Séance</span>
        <span><i class="reg-cell"></i>Repos</span>
        <span><i class="reg-cell is-today"></i>Aujourd’hui</span>
      </div>
    </div>`;
}

// ── Répartition musculaire ────────────────────────────────────────────

const GROUP_LABELS = {
  'Poitrine': 'Pectoraux', 'Dos': 'Dos', 'Épaules': 'Épaules', 'Biceps': 'Biceps',
  'Triceps': 'Triceps', 'Jambes': 'Jambes', 'Abdominaux': 'Abdominaux',
};

// counts : [[nomDuMuscle, poids], …] → parts par grand groupe musculaire.
export function muscleShares(counts) {
  const byGroup = new Map();
  for (const [m, c] of counts ?? []) {
    const g = MUSCLES_TO_GROUP[m] ?? (GROUP_LABELS[m] ? m : null);
    if (!g) continue;
    byGroup.set(g, (byGroup.get(g) ?? 0) + c);
  }
  const total = [...byGroup.values()].reduce((a, b) => a + b, 0);
  if (!total) return [];
  const max = Math.max(...byGroup.values());
  return [...byGroup.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([g, c]) => ({ group: g, label: GROUP_LABELS[g] ?? g, pct: Math.round((c * 100) / total), weight: c / max }));
}

export function muscleWeights(shares) {
  return Object.fromEntries(shares.map(s => [s.group, s.weight]));
}

export function muscleBarsHTML(shares) {
  if (!shares.length) return '';
  return `
    <div class="pulse-bars">
      ${shares.map(s => `
        <div class="pulse-bar">
          <div class="pulse-bar-head"><span>${escapeHtml(s.label)}</span><span class="pulse-bar-val">${s.pct} %</span></div>
          <div class="pulse-bar-track"><div class="pulse-bar-fill" style="width:${Math.max(4, Math.round(s.weight * 100))}%"></div></div>
        </div>`).join('')}
    </div>`;
}

export function formatKg(n) {
  return `${Math.round(n).toLocaleString('fr-FR')} kg`;
}
