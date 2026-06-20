import { currentUser }  from '../js/auth.js';
import { supabase }     from '../js/supabase.js';
import { calc1RM, formatDate, svgLineChart, escapeHtml } from '../js/utils.js';
import { bodyMapHTML, highlightMuscles, groupsFromMuscleNames } from '../js/body-map.js';

// ── Point d'entrée ────────────────────────────────────────────────────

export async function loadStats(section) {
  section.innerHTML = `
    <div class="tabs" id="stats-tabs">
      <button class="tab active" data-tab="resumes">Résumés</button>
      <button class="tab" data-tab="records">Records</button>
      <button class="tab" data-tab="progression">Progression</button>
    </div>
    <div id="stats-content">${_skeleton()}</div>`;

  await _renderResumes(section);

  section.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      section.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const id = tab.dataset.tab;
      if (id === 'resumes')     _renderResumes(section);
      else if (id === 'records')    _renderRecords(section);
      else if (id === 'progression') _renderProgression(section);
    });
  });
}

// ── Onglet Résumés ────────────────────────────────────────────────────

async function _renderResumes(section) {
  const content = section.querySelector('#stats-content');
  content.innerHTML = _skeleton();

  try {
    const now      = new Date();
    const weekAgo  = new Date(now - 7  * 86400000).toISOString().split('T')[0];
    const monthAgo = new Date(now - 30 * 86400000).toISOString().split('T')[0];

    const [{ data: week }, { data: month }, { data: allSeances }] = await Promise.all([
      supabase.from('seances').select('id, duree_minutes, date, calories_estimees, muscles_travailles').eq('user_id', currentUser.id).gte('date', weekAgo),
      supabase.from('seances').select('id, duree_minutes').eq('user_id', currentUser.id).gte('date', monthAgo),
      supabase.from('seances').select('id').eq('user_id', currentUser.id),
    ]);

    const weekCount   = week?.length  ?? 0;
    const monthCount  = month?.length ?? 0;
    const totalCount  = allSeances?.length ?? 0;
    const weekMin     = week?.reduce((s, x)  => s + (x.duree_minutes ?? 0), 0) ?? 0;
    const monthMin    = month?.reduce((s, x) => s + (x.duree_minutes ?? 0), 0) ?? 0;
    const weekCalories = week?.reduce((s, x) => s + (x.calories_estimees ?? 0), 0) ?? 0;
    const weekMuscles  = _muscleCounts(week ?? []);

    content.innerHTML = `
      <div class="page-section">
        <h3 class="section-title" style="margin-bottom:var(--space-3)">Cette semaine</h3>
        <div class="grid-3">
          <div class="card">
            <p class="card-title">Séances</p>
            <p class="card-value">${weekCount}</p>
          </div>
          <div class="card">
            <p class="card-title">Temps</p>
            <p class="card-value">${weekMin >= 60 ? Math.floor(weekMin/60) + 'h' + String(weekMin%60).padStart(2,'0') : weekMin}<span>${weekMin >= 60 ? '' : ' min'}</span></p>
          </div>
          <div class="card">
            <p class="card-title">Calories</p>
            <p class="card-value">${weekCalories}<span> kcal</span></p>
          </div>
        </div>
        ${weekMuscles.length ? `
        <div class="card" style="margin-top:var(--space-3);padding:var(--space-4)">
          <p class="card-title" style="margin-bottom:var(--space-3)">Muscles travaillés</p>
          ${bodyMapHTML('stats-week')}
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);justify-content:center;margin-top:var(--space-3)">
            ${weekMuscles.map(([m, c]) => `<span class="muscle-tag">${escapeHtml(m)}${c > 1 ? ` ×${c}` : ''}</span>`).join('')}
          </div>
        </div>` : ''}
      </div>

      <div class="page-section">
        <h3 class="section-title" style="margin-bottom:var(--space-3)">Ce mois</h3>
        <div class="grid-2">
          <div class="card">
            <p class="card-title">Séances</p>
            <p class="card-value">${monthCount}</p>
          </div>
          <div class="card">
            <p class="card-title">Temps total</p>
            <p class="card-value">${monthMin >= 60 ? Math.floor(monthMin/60) + 'h' + String(monthMin%60).padStart(2,'0') : monthMin}<span>${monthMin >= 60 ? '' : ' min'}</span></p>
          </div>
        </div>
      </div>

      <!-- Fréquence hebdo -->
      <div class="card page-section">
        <p class="card-title" style="margin-bottom:var(--space-3)">Fréquence hebdomadaire</p>
        <div style="display:flex;align-items:flex-end;gap:var(--space-2);height:60px">
          ${_frequencyBars(week ?? [])}
        </div>
        <p style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:var(--space-2)">7 derniers jours</p>
      </div>

      <!-- Total -->
      <div class="card page-section">
        <p class="card-title">Total séances</p>
        <p class="card-value">${totalCount} <span>depuis le début</span></p>
      </div>`;

    highlightMuscles(content, groupsFromMuscleNames(weekMuscles.map(([m]) => m)), 'stats-week');
  } catch {
    content.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Erreur de chargement</p>`;
  }
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

function _frequencyBars(seances) {
  const dayLabels = ['D', 'L', 'M', 'M', 'J', 'V', 'S']; // index = Date#getDay() (0 = dimanche)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    return { key: d.toISOString().split('T')[0], label: dayLabels[d.getDay()] };
  });
  const counts  = days.map(({ key }) => seances.filter(s => s.date?.startsWith(key)).length);
  const max     = Math.max(...counts, 1);
  const todayKey = new Date().toISOString().split('T')[0];

  return days.map(({ key, label }, i) => {
    const h     = Math.round((counts[i] / max) * 44);
    const today = todayKey === key;
    return `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
        <div style="width:100%;height:${h || 4}px;
          background:${counts[i] > 0 ? 'var(--color-primary)' : 'var(--surface-3)'};
          border-radius:4px;transition:height .3s;
          ${counts[i] > 0 ? 'box-shadow:0 2px 6px rgba(201, 163, 92,.3)' : ''}"></div>
        <span style="font-size:9px;color:${today ? 'var(--color-primary)' : 'var(--text-muted)'};
          font-weight:${today ? 700 : 500}">${label}</span>
      </div>`;
  }).join('');
}

// ── Onglet Records ────────────────────────────────────────────────────

async function _renderRecords(section) {
  const content = section.querySelector('#stats-content');
  content.innerHTML = _skeleton();

  try {
    const { data: series } = await supabase
      .from('series')
      .select('exercice_nom, poids_kg, repetitions, created_at')
      .eq('user_id', currentUser.id)
      .not('poids_kg', 'is', null)
      .not('repetitions', 'is', null);

    if (!series?.length) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
            </svg>
          </div>
          <p class="empty-state-title">Aucun record</p>
          <p class="empty-state-desc">Vos records personnels apparaîtront ici après vos premières séances.</p>
        </div>`;
      return;
    }

    // Calculer le meilleur 1RM par exercice
    const records = {};
    for (const s of series) {
      const orm = calc1RM(s.poids_kg, s.repetitions);
      if (!records[s.exercice_nom] || orm > records[s.exercice_nom].orm) {
        records[s.exercice_nom] = { orm, poids: s.poids_kg, reps: s.repetitions, date: s.created_at };
      }
    }

    const sorted = Object.entries(records)
      .sort((a, b) => b[1].orm - a[1].orm);

    content.innerHTML = `
      <p style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:var(--space-4);text-align:center">
        1RM estimé via la formule d'Epley — trié par performance
      </p>
      <div style="display:flex;flex-direction:column;gap:var(--space-3)">
        ${sorted.map(([nom, r], i) => `
          <div class="record-card">
            <div class="record-trophy">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅'}</div>
            <div class="record-body">
              <p class="record-label">${nom}</p>
              <p class="record-value">${r.orm} kg <span style="font-size:var(--font-size-sm);font-weight:500;color:var(--text-muted)">1RM est.</span></p>
              <p class="record-date">${r.poids} kg × ${r.reps} reps — ${formatDate(r.date, { year: true })}</p>
            </div>
          </div>`).join('')}
      </div>`;
  } catch {
    content.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Erreur de chargement</p>`;
  }
}

// ── Onglet Progression ────────────────────────────────────────────────

async function _renderProgression(section) {
  const content = section.querySelector('#stats-content');
  content.innerHTML = _skeleton();

  try {
    // Récupérer la liste des exercices utilisés
    const { data: exoList } = await supabase
      .from('series')
      .select('exercice_nom')
      .eq('user_id', currentUser.id);

    const exoNames = [...new Set((exoList ?? []).map(s => s.exercice_nom))].sort();

    if (!exoNames.length) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </div>
          <p class="empty-state-title">Aucune donnée</p>
          <p class="empty-state-desc">Enregistrez des séances pour voir vos courbes de progression.</p>
        </div>`;
      return;
    }

    content.innerHTML = `
      <div class="form-group" style="margin-bottom:var(--space-4)">
        <label class="form-label">Exercice</label>
        <select class="form-select" id="prog-exo-select">
          ${exoNames.map(n => `<option value="${n}">${n}</option>`).join('')}
        </select>
      </div>
      <div id="prog-chart-container"></div>`;

    const select = content.querySelector('#prog-exo-select');
    const chartEl = content.querySelector('#prog-chart-container');

    const renderChart = async (exoNom) => {
      chartEl.innerHTML = `<div style="text-align:center;padding:var(--space-6)"><div class="spinner" style="margin:0 auto"></div></div>`;

      const { data: series } = await supabase
        .from('series')
        .select('poids_kg, repetitions, created_at, seance_id')
        .eq('user_id', currentUser.id)
        .eq('exercice_nom', exoNom)
        .not('poids_kg', 'is', null)
        .not('repetitions', 'is', null)
        .order('created_at', { ascending: true });

      if (!series?.length) {
        chartEl.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Aucune donnée pour cet exercice.</p>`;
        return;
      }

      // Grouper par séance (et non par jour calendaire) → meilleur 1RM par
      // séance, sinon deux séances le même jour s'écrasent en un seul point.
      const bySeance = {};
      for (const s of series) {
        const key = s.seance_id;
        const orm = calc1RM(s.poids_kg, s.repetitions);
        if (!bySeance[key]) bySeance[key] = { date: s.created_at, orm: 0, poids: null, reps: null };
        if (s.created_at < bySeance[key].date) bySeance[key].date = s.created_at;
        if (orm > bySeance[key].orm) {
          bySeance[key].orm   = orm;
          bySeance[key].poids = s.poids_kg;
          bySeance[key].reps  = s.repetitions;
        }
      }

      const points = Object.values(bySeance).sort((a, b) => a.date.localeCompare(b.date));

      const bestOrm  = Math.max(...points.map(p => p.orm));
      const firstOrm = points[0].orm;
      const lastOrm  = points.at(-1).orm;
      const gain     = lastOrm - firstOrm;

      chartEl.innerHTML = `
        <!-- Stat cards -->
        <div class="grid-2" style="margin-bottom:var(--space-4)">
          <div class="record-card">
            <div class="record-trophy">🏆</div>
            <div class="record-body">
              <p class="record-label">Record 1RM</p>
              <p class="record-value">${bestOrm} kg</p>
            </div>
          </div>
          <div class="card" style="text-align:center">
            <p class="card-title">Progression</p>
            <p class="card-value" style="color:${gain >= 0 ? 'var(--color-success)' : 'var(--color-error)'}">
              ${gain >= 0 ? '+' : ''}${gain} kg
            </p>
          </div>
        </div>

        <!-- Graphique SVG -->
        <div class="card" style="padding:var(--space-4)">
          <p class="card-title" style="margin-bottom:var(--space-3)">1RM estimé dans le temps</p>
          ${svgLineChart(points.map(p => ({ x: new Date(p.date).getTime(), y: p.orm, label: p.date })))}
          <p style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:var(--space-2);text-align:right">
            ${points.length} séances · ${formatDate(points[0].date)} → ${formatDate(points.at(-1).date)}
          </p>
        </div>`;
    };

    select.addEventListener('change', () => renderChart(select.value));
    await renderChart(exoNames[0]);
  } catch {
    content.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Erreur de chargement</p>`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function _skeleton() {
  return `
    <div class="grid-2" style="margin-bottom:var(--space-4)">
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
    </div>
    <div class="skeleton skeleton-card" style="margin-bottom:var(--space-3);height:120px"></div>
    <div class="skeleton skeleton-card" style="height:60px"></div>`;
}
