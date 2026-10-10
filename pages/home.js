import { currentUser, getUserPrenom } from '../js/auth.js';
import { supabase }                   from '../js/supabase.js';
import { navigate }                   from '../js/router.js';
import { formatDate, getGreeting, todayStr, formatDuration, showToast, confirmDialog, escapeHtml, openModal, closeModal } from '../js/utils.js';
import { openQuickLaunchModal }       from '../js/quick-launch.js';
import { bodyMapHTML, highlightMuscles, groupsFromMuscleNames } from '../js/body-map.js';
import {
  goalOf, goalRingHTML, goalLabel, weekDoneCount, weekStripHTML, goalStreakWeeks, GOAL_LEVELS,
  muscleShares, muscleWeights, muscleBarsHTML, formatKg, localKey, mondayOf, addDays,
} from '../js/pulse-ui.js';

// ── Données du tableau de bord ────────────────────────────────────────

async function fetchDashboard(userId) {
  const today = todayStr();
  const dow = new Date().getDay();
  const weekStart = new Date(Date.now() - (dow === 0 ? 6 : dow - 1) * 86400000).toISOString().split('T')[0];

  // Douze semaines de dates suffisent pour la série « objectif tenu ».
  const since = localKey(addDays(mondayOf(), -7 * 11));
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [{ data: seancesWeek }, { data: seanceToday }, { data: lastSeance },
         { data: recent }, { data: profil }, { data: seriesMonth }] = await Promise.all([
    supabase.from('seances')
      .select('id, date, duree_minutes, nom, calories_estimees, muscles_travailles')
      .eq('user_id', userId)
      .gte('date', weekStart)
      .order('date', { ascending: false }),

    supabase.from('seances')
      .select('id, nom, date')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle(),

    supabase.from('seances')
      .select('id, nom, date, duree_minutes, calories_estimees')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(3),

    supabase.from('seances')
      .select('date')
      .eq('user_id', userId)
      .gte('date', since),

    supabase.from('profils')
      .select('frequence')
      .eq('user_id', userId)
      .maybeSingle(),

    supabase.from('series')
      .select('poids_kg, repetitions')
      .eq('user_id', userId)
      .gte('created_at', monthStart.toISOString()),
  ]);

  return {
    seancesWeek: seancesWeek ?? [],
    seanceToday: seanceToday ?? null,
    lastSeances: lastSeance ?? [],
    recent:      recent ?? [],
    frequence:   profil?.frequence ?? null,
    seriesMonth: seriesMonth ?? [],
  };
}

function _muscleCounts(seances) {
  const counts = new Map();
  for (const s of seances) {
    for (const m of s.muscles_travailles ?? []) {
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function _buildCtx(prenom, dash) {
  const seancesCount = dash.seancesWeek.length;
  const totalMin     = dash.seancesWeek.reduce((s, x) => s + (x.duree_minutes || 0), 0);
  const weekCalories = dash.seancesWeek.reduce((s, x) => s + (x.calories_estimees || 0), 0);
  const weekMuscles  = _muscleCounts(dash.seancesWeek);

  const goal        = goalOf(dash.frequence);
  const recent      = dash.recent ?? [];
  const weekDone    = weekDoneCount(recent);
  const streak      = goalStreakWeeks(recent, goal);
  const monthKey    = localKey(new Date()).slice(0, 7);
  const monthCount  = new Set(recent.map(s => String(s.date)).filter(d => d.startsWith(monthKey))).size;
  const monthVolume = (dash.seriesMonth ?? []).reduce((t, x) => t + (Number(x.poids_kg) || 0) * (Number(x.repetitions) || 0), 0);

  return { prenom, dash, seancesCount, totalMin, weekCalories, weekMuscles,
           goal, recent, weekDone, streak, monthCount, monthVolume };
}

// ── Widgets de l'accueil ────────────────────────────────────────────────
// Chaque widget rend son propre wrapper complet (avec data-widget="id") afin
// que le mode personnalisation puisse réordonner/masquer sans connaître les
// détails de mise en page de chacun.

const WIDGETS = {
  greeting:       { label: 'Salutation',              render: _renderGreeting },
  goal:           { label: 'Objectif de la semaine',  render: _renderGoal },
  highlights:     { label: 'Chiffres clés',           render: _renderHighlights },
  'week-stats':   { label: 'Stats de la semaine',     render: _renderWeekStats },
  'week-activity': { label: 'Activité de la semaine', render: _renderWeekActivity },
  'start-button': { label: 'Bouton démarrer',         render: _renderStartButton },
  shortcuts:      { label: 'Raccourcis',              render: _renderShortcuts },
  muscles:        { label: 'Muscles travaillés',      render: _renderMuscles },
  'last-seances': { label: 'Dernières séances',       render: _renderLastSeancesWidget },
};

// Disposition « Pulse » : l'objectif hebdo en tête, puis l'action, puis
// le détail. Les anciens blocs restent disponibles dans Personnaliser.
const DEFAULT_LAYOUT = [
  { id: 'greeting',      hidden: false },
  { id: 'goal',          hidden: false },
  { id: 'start-button',  hidden: false },
  { id: 'highlights',    hidden: false },
  { id: 'last-seances',  hidden: false },
  { id: 'muscles',       hidden: false },
  { id: 'shortcuts',     hidden: true },
  { id: 'week-stats',    hidden: true },
  { id: 'week-activity', hidden: true },
];

function _renderGreeting(ctx) {
  return `
    <div class="page-section" data-widget="greeting">
      <h2 style="font-size:var(--font-size-xl);font-weight:700;margin-bottom:2px">
        ${getGreeting()}, ${escapeHtml(ctx.prenom)}
      </h2>
      <p style="color:var(--text-secondary);font-size:var(--font-size-sm)">
        ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
    </div>`;
}

function _renderWeekStats(ctx) {
  const { seancesCount, totalMin, weekCalories } = ctx;
  return `
    <div class="grid-3 page-section" data-widget="week-stats">
      <div class="card">
        <p class="card-title">Séances</p>
        <p class="card-value">${seancesCount}</p>
      </div>
      <div class="card">
        <p class="card-title">Temps</p>
        <p class="card-value">${totalMin >= 60 ? Math.floor(totalMin/60) + 'h' + String(totalMin%60).padStart(2,'0') : totalMin} <span>${totalMin >= 60 ? '' : 'min'}</span></p>
      </div>
      <div class="card">
        <p class="card-title">Calories</p>
        <p class="card-value">${weekCalories}<span> kcal</span></p>
      </div>
    </div>`;
}

function _renderWeekActivity(ctx) {
  return `
    <div class="card page-section" data-widget="week-activity">
      <p class="card-title" style="margin-bottom:var(--space-3)">Activité de la semaine</p>
      <div class="week-dots" style="justify-content:space-around">
        ${renderWeekDots(ctx.dash.seancesWeek)}
      </div>
    </div>`;
}

function _renderMuscles(ctx) {
  if (!ctx.weekMuscles.length) return '';
  return `
    <div class="card page-section" data-widget="muscles" style="padding:var(--space-4)">
      <p class="card-title" style="margin-bottom:var(--space-3)">Muscles travaillés cette semaine</p>
      ${bodyMapHTML('home')}
      <div style="margin-top:var(--space-4)">${muscleBarsHTML(muscleShares(ctx.weekMuscles))}</div>
    </div>`;
}

const _SVG_PENCIL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>`;
const _SVG_FLAME  = `<svg viewBox="0 0 24 24" aria-hidden="true" style="fill:var(--color-primary)"><path d="M12 2c-1.5 3-5 5.5-5 10a5 5 0 0010 0c0-1-.3-2-.8-2.8.3 1.8-.5 3-1.7 3-1.5 0-2-1.3-1.5-2.7C13.8 8 12 5 12 2z"/></svg>`;

function _renderGoal(ctx) {
  return `
    <div class="page-section goal-card" data-widget="goal">
      <div class="goal-head">
        ${goalRingHTML(ctx.weekDone, ctx.goal)}
        <div class="goal-text">
          <p class="goal-eyebrow">Cette semaine</p>
          <p class="goal-title">${goalLabel(ctx.weekDone, ctx.goal)}</p>
          <button class="goal-edit" id="btn-edit-goal">${_SVG_PENCIL}Objectif : ${ctx.goal} / semaine</button>
        </div>
      </div>
      ${weekStripHTML(ctx.recent)}
    </div>`;
}

function _renderHighlights(ctx) {
  return `
    <div class="page-section highlight-row" data-widget="highlights">
      <div class="highlight-pill">
        <p class="highlight-value">${formatKg(ctx.monthVolume)}</p>
        <p class="highlight-label">soulevés ce mois</p>
      </div>
      <div class="highlight-pill">
        <p class="highlight-value">${ctx.monthCount}</p>
        <p class="highlight-label">séance${ctx.monthCount > 1 ? 's' : ''} ce mois</p>
      </div>
      <div class="highlight-pill">
        <p class="highlight-value">${_SVG_FLAME}${ctx.streak} sem.</p>
        <p class="highlight-label">objectif tenu d'affilée</p>
      </div>
    </div>`;
}

// ── Objectif hebdo : réglage ─────────────────────────────────────────
// L'objectif est la « fréquence » du profil (déjà demandée à l'onboarding),
// désormais réglable de 1 à 7 séances par semaine.

function _openGoalModal() {
  let n = _dashCtx.goal;
  const body = () => `
    <div class="goal-editor">
      <p class="goal-editor-label">Séances par semaine</p>
      <div class="goal-editor-row">
        <button class="goal-editor-btn" data-goal-step="-1" aria-label="Une séance de moins" ${n <= 1 ? 'disabled' : ''}>−</button>
        <span class="goal-editor-value" aria-live="polite">${n}</span>
        <button class="goal-editor-btn" data-goal-step="1" aria-label="Une séance de plus" ${n >= 7 ? 'disabled' : ''}>+</button>
      </div>
      <p class="goal-editor-level">${GOAL_LEVELS[n][0]}</p>
      <p class="goal-editor-desc">${GOAL_LEVELS[n][1]}</p>
    </div>`;

  openModal({
    title: 'Mon objectif hebdo',
    body: body(),
    footer: `
      <button class="btn btn-secondary" id="btn-goal-cancel">Annuler</button>
      <button class="btn btn-primary" id="btn-goal-save" style="flex:1">Enregistrer</button>`,
  });

  const mb = document.getElementById('modal-body');
  // Affectation (et non addEventListener) : #modal-body est réutilisé par
  // toutes les modales, un écouteur ajouté à chaque ouverture s'empilerait.
  mb.onclick = (e) => {
    const b = e.target.closest('[data-goal-step]');
    if (!b) return;
    n = Math.max(1, Math.min(7, n + parseInt(b.dataset.goalStep, 10)));
    mb.innerHTML = body();
  };
  const done = () => { mb.onclick = null; closeModal(); };

  document.getElementById('btn-goal-cancel')?.addEventListener('click', done);
  document.getElementById('btn-goal-save')?.addEventListener('click', async () => {
    try {
      const { error } = await supabase.from('profils')
        .upsert({ user_id: currentUser.id, frequence: n }, { onConflict: 'user_id' });
      if (error) throw error;
      done();
      showToast('Objectif enregistré', 'success');
      _dashCtx.goal   = n;
      _dashCtx.streak = goalStreakWeeks(_dashCtx.recent, n);
      _render();
    } catch {
      showToast('L\'objectif n\'a pas pu être enregistré', 'error');
    }
  });
}

function _renderStartButton() {
  return `
    <div class="page-section" data-widget="start-button">
      <button id="btn-start-seance" class="btn btn-primary btn-full btn-lg" style="gap:var(--space-3)">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px">
          <polygon points="6 4 20 12 6 20"/>
        </svg>
        Lancer une séance
      </button>
    </div>`;
}

function _renderShortcuts() {
  return `
    <div class="grid-2 page-section" data-widget="shortcuts">
      <button class="card card-interactive" data-nav="programmes" style="text-align:left">
        <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-2)">
          <div class="item-icon" style="width:36px;height:36px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <span style="font-size:var(--font-size-sm);font-weight:700">Programmes</span>
        </div>
        <p style="font-size:var(--font-size-xs);color:var(--text-muted)">PPL, Full Body, 5×5…</p>
      </button>
      <button class="card card-interactive" data-nav="stats" style="text-align:left">
        <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-2)">
          <div class="item-icon" style="width:36px;height:36px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </div>
          <span style="font-size:var(--font-size-sm);font-weight:700">Statistiques</span>
        </div>
        <p style="font-size:var(--font-size-xs);color:var(--text-muted)">Records, progression…</p>
      </button>
      <button class="card card-interactive" data-nav="nutrition" style="text-align:left">
        <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-2)">
          <div class="item-icon accent" style="width:36px;height:36px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
          </div>
          <span style="font-size:var(--font-size-sm);font-weight:700">Nutrition</span>
        </div>
        <p style="font-size:var(--font-size-xs);color:var(--text-muted)">Calories, macros…</p>
      </button>
      <button class="card card-interactive" data-nav="exercices" style="text-align:left">
        <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-2)">
          <div class="item-icon success" style="width:36px;height:36px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
          </div>
          <span style="font-size:var(--font-size-sm);font-weight:700">Exercices</span>
        </div>
        <p style="font-size:var(--font-size-xs);color:var(--text-muted)">Bibliothèque complète</p>
      </button>
    </div>`;
}

function _renderLastSeancesWidget(ctx) {
  return `
    <div class="page-section" data-widget="last-seances">
      <div class="section-header">
        <h3 class="section-title">Dernières séances</h3>
        <button class="section-link" data-nav="seances">Voir tout</button>
      </div>
      <div class="item-list">
        ${renderLastSeances(ctx.dash.lastSeances)}
      </div>
    </div>`;
}

function renderWeekDots(seancesWeek) {
  const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const today = new Date();
  const dayOfWeek = (today.getDay() + 6) % 7; // 0=lundi

  const done = new Set(
    seancesWeek.map((s) => {
      const d = new Date(s.date);
      return (d.getDay() + 6) % 7;
    })
  );

  return days.map((label, i) => {
    const isDone = done.has(i);
    const isToday = i === dayOfWeek;
    return `
      <div class="week-dot">
        <span class="week-dot-label" style="${isToday ? 'color:var(--color-primary)' : ''}">${label}</span>
        <div class="week-dot-circle ${isDone ? 'done' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
      </div>`;
  }).join('');
}

function renderLastSeances(seances) {
  if (!seances.length) {
    return `<p style="color:var(--text-muted);font-size:var(--font-size-sm);text-align:center;padding:var(--space-4) 0">Aucune séance pour le moment</p>`;
  }
  return seances.map((s) => `
    <div class="list-item clickable" data-id="${s.id}">
      <div class="item-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/><polyline points="8.5 12.5 11 15 16 9"/>
        </svg>
      </div>
      <div class="item-body">
        <p class="item-title">${escapeHtml(s.nom) || 'Séance'}</p>
        <p class="item-subtitle">${formatDate(s.date, { weekday: 'long', year: true })}</p>
      </div>
      <div class="item-meta">
        ${s.duree_minutes ? `<p class="item-meta-primary">${formatDuration(s.duree_minutes)}</p>` : ''}
        ${s.calories_estimees != null ? `<p class="item-meta-secondary">${s.calories_estimees} kcal</p>` : ''}
      </div>
      <button class="icon-btn" data-del-seance="${s.id}" data-del-nom="${escapeHtml(s.nom) || 'Séance'}"
        aria-label="Supprimer" style="color:var(--color-error);flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
        </svg>
      </button>
    </div>`).join('');
}

async function deleteLastSeance(id, nom, section) {
  if (!await confirmDialog(`Supprimer "${nom}" ? Cette action est définitive.`)) return;
  try {
    const { error } = await supabase.from('seances').delete().eq('id', id);
    if (error) throw error;
    showToast('Séance supprimée', 'success');
    loadHome(section);
  } catch {
    showToast('Erreur lors de la suppression', 'error');
  }
}

// ── Disposition personnalisée (mode édition) ────────────────────────────

async function _fetchLayout() {
  try {
    const { data } = await supabase.from('profils').select('home_layout').eq('user_id', currentUser.id).maybeSingle();
    const saved = data?.home_layout;
    if (!Array.isArray(saved) || !saved.length) return DEFAULT_LAYOUT.map(w => ({ ...w }));

    const merged = saved.filter(w => WIDGETS[w?.id]).map(w => ({ id: w.id, hidden: !!w.hidden }));
    // Un bloc ajouté depuis la dernière personnalisation (ex. l'objectif
    // hebdo) prend sa place par défaut au lieu d'atterrir tout en bas.
    DEFAULT_LAYOUT.forEach((w, i) => {
      if (!merged.some(m => m.id === w.id)) merged.splice(Math.min(i, merged.length), 0, { ...w });
    });
    return merged;
  } catch {
    return DEFAULT_LAYOUT.map(w => ({ ...w }));
  }
}

async function _saveLayout(layout) {
  try {
    const { error } = await supabase.from('profils').upsert({ user_id: currentUser.id, home_layout: layout }, { onConflict: 'user_id' });
    if (error) throw error;
  } catch {
    // Le cas le plus probable est l'absence de la colonne home_layout côté
    // Supabase (migration non exécutée) — on le signale plutôt que de
    // laisser l'utilisateur croire que la personnalisation est enregistrée.
    showToast('La disposition n\'a pas pu être enregistrée (vérifiez la base Supabase)', 'error', 5000);
  }
}

function _customizeButtonHTML() {
  return `
    <div style="display:flex;justify-content:flex-end;margin-bottom:var(--space-1)">
      <button id="btn-customize-home" class="icon-btn" aria-label="Personnaliser l'accueil">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      </button>
    </div>`;
}

function _editListHTML() {
  return `
    <div class="page-section">
      <h3 class="section-title" style="margin-bottom:var(--space-3)">Personnaliser l'accueil</h3>
      <p style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:var(--space-3)">
        Maintenez la poignée pour glisser un bloc à un autre endroit.
      </p>
      <div style="display:flex;flex-direction:column;gap:6px" id="edit-widget-list">
        ${_layout.map((w) => `
          <div class="list-item edit-widget-row" data-widget-row="${w.id}" style="opacity:${w.hidden ? 0.5 : 1}">
            <button class="icon-btn edit-drag-handle" data-drag-handle aria-label="Réorganiser ${WIDGETS[w.id]?.label ?? w.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/></svg>
            </button>
            <div class="item-body">
              <p class="item-title">${WIDGETS[w.id]?.label ?? w.id}</p>
            </div>
            <button class="icon-btn" data-action="toggle" data-id="${w.id}" aria-label="${w.hidden ? 'Afficher' : 'Masquer'}">
              ${w.hidden
                ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
                : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`}
            </button>
          </div>`).join('')}
      </div>
      <button class="btn btn-primary btn-full" id="btn-done-customize" style="margin-top:var(--space-4)">Terminé</button>
      <button class="btn btn-ghost btn-full" id="btn-reset-customize" style="margin-top:var(--space-2);color:var(--text-muted)">Réinitialiser l'ordre</button>
    </div>`;
}

// ── État + rendu ──────────────────────────────────────────────────────

let _section  = null;
let _dashCtx  = null;
let _layout   = null;
let _editMode = false;

function _render() {
  if (!_section || !_dashCtx) return;

  if (_editMode) {
    _section.innerHTML = _customizeButtonHTML() + _editListHTML();
    _bindEditEvents();
    return;
  }

  const widgetsHtml = _layout
    .filter(w => !w.hidden)
    .map(w => WIDGETS[w.id]?.render(_dashCtx) ?? '')
    .join('');

  _section.innerHTML = _customizeButtonHTML() + widgetsHtml;

  if (_section.querySelector('[data-widget="muscles"]')) {
    const shares = muscleShares(_dashCtx.weekMuscles);
    highlightMuscles(_section, shares.map(x => x.group), 'home', muscleWeights(shares));
  }

  _bindNormalEvents();
}

function _bindNormalEvents() {
  _section.querySelector('#btn-customize-home')?.addEventListener('click', () => { _editMode = true; _render(); });
  _section.querySelector('#btn-start-seance')?.addEventListener('click', () => openQuickLaunchModal());
  _section.querySelector('#btn-edit-goal')?.addEventListener('click', _openGoalModal);

  _section.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.nav));
  });

  _section.querySelectorAll('.item-list [data-id]').forEach((item) => {
    item.addEventListener('click', () => navigate('seances'));
  });
  _section.querySelectorAll('[data-del-seance]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteLastSeance(btn.dataset.delSeance, btn.dataset.delNom, _section);
    });
  });
}

function _bindEditEvents() {
  _section.querySelector('#btn-customize-home')?.addEventListener('click', () => { _editMode = false; _render(); });
  _section.querySelector('#btn-done-customize')?.addEventListener('click', () => { _editMode = false; _render(); });

  _section.querySelector('#btn-reset-customize')?.addEventListener('click', () => {
    _layout = DEFAULT_LAYOUT.map(w => ({ ...w }));
    _saveLayout(_layout);
    _render();
  });

  _section.querySelector('#edit-widget-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="toggle"]');
    if (!btn) return;
    const idx = _layout.findIndex(w => w.id === btn.dataset.id);
    if (idx === -1) return;
    _layout[idx].hidden = !_layout[idx].hidden;
    _saveLayout(_layout);
    _render();
  });

  _bindDragReorder(_section.querySelector('#edit-widget-list'));
}

// ── Glisser-déposer pour réordonner (mode édition) ──────────────────────
// Drag "shadow" classique : l'élément saisi suit le pointeur en position
// fixe, un espace réservé (placeholder) marque sa future place dans la
// liste et se déplace au fil du survol des autres lignes.

function _bindDragReorder(listEl) {
  if (!listEl) return;
  let dragEl = null, placeholder = null, startY = 0, startTop = 0;

  const onMove = (e) => {
    if (!dragEl) return;
    const dy = e.clientY - startY;
    dragEl.style.top = `${startTop + dy}px`;

    const dragMid = startTop + dy + dragEl.offsetHeight / 2;
    const rows = [...listEl.querySelectorAll('[data-widget-row]')].filter(r => r !== dragEl);

    let target = null;
    for (const r of rows) {
      const rect = r.getBoundingClientRect();
      if (dragMid < rect.top + rect.height / 2) { target = r; break; }
    }
    if (target) listEl.insertBefore(placeholder, target);
    else listEl.appendChild(placeholder);
  };

  const onUp = () => {
    if (!dragEl) return;
    listEl.insertBefore(dragEl, placeholder);
    placeholder.remove();
    dragEl.classList.remove('dragging');
    dragEl.style.position = dragEl.style.left = dragEl.style.top = dragEl.style.width = '';
    dragEl.style.zIndex = dragEl.style.pointerEvents = '';
    document.body.style.userSelect = '';

    const newOrder = [...listEl.querySelectorAll('[data-widget-row]')].map(r => r.dataset.widgetRow);
    _layout = newOrder.map(id => _layout.find(w => w.id === id)).filter(Boolean);
    _saveLayout(_layout);

    dragEl = null; placeholder = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };

  listEl.querySelectorAll('[data-drag-handle]').forEach(handle => {
    handle.addEventListener('pointerdown', (e) => {
      const row = handle.closest('[data-widget-row]');
      if (!row) return;
      e.preventDefault();

      dragEl = row;
      startY = e.clientY;
      const rect = row.getBoundingClientRect();
      startTop = rect.top;

      placeholder = document.createElement('div');
      placeholder.className = 'edit-row-placeholder';
      placeholder.style.height = `${rect.height}px`;
      row.after(placeholder);

      row.style.position = 'fixed';
      row.style.left = `${rect.left}px`;
      row.style.top = `${rect.top}px`;
      row.style.width = `${rect.width}px`;
      row.style.zIndex = '1000';
      row.style.pointerEvents = 'none';
      row.classList.add('dragging');
      document.body.style.userSelect = 'none';

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });
}

// ── Export de la page ─────────────────────────────────────────────────

export async function loadHome(section) {
  _section  = section;
  _editMode = false;
  const prenom = getUserPrenom();

  section.innerHTML = `
    <div class="page-section">
      <div class="skeleton skeleton-title" style="width:55%;margin-bottom:6px"></div>
      <div class="skeleton skeleton-text" style="width:35%"></div>
    </div>
    <div class="grid-2" style="margin-bottom:var(--space-6)">
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
    </div>`;

  const [dash, layout] = await Promise.all([
    fetchDashboard(currentUser.id).catch(() => ({ seancesWeek: [], seanceToday: null, lastSeances: [], recent: [], frequence: null, seriesMonth: [] })),
    _fetchLayout(),
  ]);

  _dashCtx = _buildCtx(prenom, dash);
  _layout  = layout;
  _render();
}
