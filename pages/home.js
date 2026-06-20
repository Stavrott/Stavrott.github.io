import { currentUser, getUserPrenom } from '../js/auth.js';
import { supabase }                   from '../js/supabase.js';
import { navigate }                   from '../js/router.js';
import { formatDate, getGreeting, todayStr, formatDuration, calc1RM, showToast, confirmDialog, escapeHtml } from '../js/utils.js';
import { openQuickLaunchModal }       from '../js/quick-launch.js';
import { bodyMapHTML, highlightMuscles, groupsFromMuscleNames } from '../js/body-map.js';

// ── Données du tableau de bord ────────────────────────────────────────

async function fetchDashboard(userId) {
  const today = todayStr();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  const [{ data: seancesWeek }, { data: seanceToday }, { data: lastSeance }] = await Promise.all([
    supabase.from('seances')
      .select('id, date, duree_minutes, nom, calories_estimees, muscles_travailles')
      .eq('user_id', userId)
      .gte('date', weekAgo)
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
  ]);

  return {
    seancesWeek: seancesWeek ?? [],
    seanceToday: seanceToday ?? null,
    lastSeances: lastSeance ?? [],
  };
}

// ── Rendu HTML ────────────────────────────────────────────────────────

function _muscleCounts(seances) {
  const counts = new Map();
  for (const s of seances) {
    for (const m of s.muscles_travailles ?? []) {
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
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
          <path d="M6 5v14M18 5v14M3 8h3m12 0h3M3 16h3m12 0h3"/>
        </svg>
      </div>
      <div class="item-body">
        <p class="item-title">${s.nom || 'Séance'}</p>
        <p class="item-subtitle">${formatDate(s.date, { weekday: 'long', year: true })}</p>
      </div>
      <div class="item-meta">
        ${s.duree_minutes ? `<p class="item-meta-primary">${formatDuration(s.duree_minutes)}</p>` : ''}
        ${s.calories_estimees != null ? `<p class="item-meta-secondary">${s.calories_estimees} kcal</p>` : ''}
      </div>
      <button class="icon-btn" data-del-seance="${s.id}" data-del-nom="${s.nom || 'Séance'}"
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

// ── Export de la page ─────────────────────────────────────────────────

export async function loadHome(section) {
  const prenom = getUserPrenom();

  // Affichage du squelette
  section.innerHTML = `
    <div class="page-section">
      <div class="skeleton skeleton-title" style="width:55%;margin-bottom:6px"></div>
      <div class="skeleton skeleton-text" style="width:35%"></div>
    </div>
    <div class="grid-2" style="margin-bottom:var(--space-6)">
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
    </div>`;

  let dash = { seancesWeek: [], seanceToday: null, lastSeances: [] };
  try {
    dash = await fetchDashboard(currentUser.id);
  } catch {}

  const seancesCount = dash.seancesWeek.length;
  const totalMin      = dash.seancesWeek.reduce((s, x) => s + (x.duree_minutes || 0), 0);
  const weekCalories  = dash.seancesWeek.reduce((s, x) => s + (x.calories_estimees || 0), 0);
  const weekMuscles   = _muscleCounts(dash.seancesWeek);

  section.innerHTML = `
    <!-- Salutation -->
    <div class="page-section">
      <h2 style="font-size:var(--font-size-2xl);font-weight:800;margin-bottom:4px">
        ${getGreeting()}, ${prenom} 👋
      </h2>
      <p style="color:var(--text-secondary);font-size:var(--font-size-sm)">
        ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
    </div>

    <!-- Stats semaine -->
    <div class="grid-3 page-section">
      <div class="card card-gradient">
        <p class="card-title" style="color:rgba(255,255,255,0.7)">Séances</p>
        <p class="card-value" style="color:white">${seancesCount}</p>
      </div>
      <div class="card">
        <p class="card-title">Temps</p>
        <p class="card-value">${totalMin >= 60 ? Math.floor(totalMin/60) + 'h' + String(totalMin%60).padStart(2,'0') : totalMin} <span>${totalMin >= 60 ? '' : 'min'}</span></p>
      </div>
      <div class="card">
        <p class="card-title">Calories</p>
        <p class="card-value">${weekCalories}<span> kcal</span></p>
      </div>
    </div>

    <!-- Activité semaine -->
    <div class="card page-section">
      <p class="card-title" style="margin-bottom:var(--space-3)">Activité de la semaine</p>
      <div class="week-dots" style="justify-content:space-around">
        ${renderWeekDots(dash.seancesWeek)}
      </div>
    </div>

    <!-- Muscles travaillés cette semaine -->
    ${weekMuscles.length ? `
    <div class="card page-section" style="padding:var(--space-4)">
      <p class="card-title" style="margin-bottom:var(--space-3)">Muscles travaillés</p>
      ${bodyMapHTML('home')}
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);justify-content:center;margin-top:var(--space-3)">
        ${weekMuscles.map(([m, c]) => `<span class="muscle-tag">${escapeHtml(m)}${c > 1 ? ` ×${c}` : ''}</span>`).join('')}
      </div>
    </div>` : ''}

    <!-- Action principale -->
    <div class="page-section">
      <button id="btn-start-seance" class="btn btn-primary btn-full btn-lg" style="gap:var(--space-3)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px">
          <path d="M6 5v14M18 5v14M3 8h3m12 0h3M3 16h3m12 0h3"/>
        </svg>
        Démarrer une séance
      </button>
    </div>

    <!-- Raccourcis -->
    <div class="grid-2 page-section">
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
    </div>

    <!-- Dernières séances -->
    <div class="page-section">
      <div class="section-header">
        <h3 class="section-title">Dernières séances</h3>
        <button class="section-link" data-nav="seances">Voir tout</button>
      </div>
      <div class="item-list">
        ${renderLastSeances(dash.lastSeances)}
      </div>
    </div>`;

  highlightMuscles(section, groupsFromMuscleNames(weekMuscles.map(([m]) => m)), 'home');

  // Événements
  section.querySelector('#btn-start-seance')?.addEventListener('click', () => openQuickLaunchModal());

  section.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.nav));
  });

  section.querySelectorAll('.item-list [data-id]').forEach((item) => {
    item.addEventListener('click', () => navigate('seances'));
  });
  section.querySelectorAll('[data-del-seance]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteLastSeance(btn.dataset.delSeance, btn.dataset.delNom, section);
    });
  });
}
