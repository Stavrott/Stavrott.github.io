import { currentUser }  from '../js/auth.js';
import { supabase }     from '../js/supabase.js';
import { calc1RM, formatDate } from '../js/utils.js';

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
      supabase.from('seances').select('id, duree_minutes, date').eq('user_id', currentUser.id).gte('date', weekAgo),
      supabase.from('seances').select('id, duree_minutes').eq('user_id', currentUser.id).gte('date', monthAgo),
      supabase.from('seances').select('id').eq('user_id', currentUser.id),
    ]);

    const weekCount  = week?.length  ?? 0;
    const monthCount = month?.length ?? 0;
    const totalCount = allSeances?.length ?? 0;
    const weekMin    = week?.reduce((s, x)  => s + (x.duree_minutes ?? 0), 0) ?? 0;
    const monthMin   = month?.reduce((s, x) => s + (x.duree_minutes ?? 0), 0) ?? 0;

    content.innerHTML = `
      <div class="page-section">
        <h3 class="section-title" style="margin-bottom:var(--space-3)">Cette semaine</h3>
        <div class="grid-2">
          <div class="card">
            <p class="card-title">Séances</p>
            <p class="card-value">${weekCount}</p>
          </div>
          <div class="card">
            <p class="card-title">Temps d'entraîn.</p>
            <p class="card-value">${weekMin >= 60 ? Math.floor(weekMin/60) + 'h' + String(weekMin%60).padStart(2,'0') : weekMin}<span>${weekMin >= 60 ? '' : ' min'}</span></p>
          </div>
        </div>
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
      <div class="card card-gradient page-section">
        <p class="card-title">Total séances</p>
        <p class="card-value">${totalCount} <span>depuis le début</span></p>
      </div>`;
  } catch {
    content.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Erreur de chargement</p>`;
  }
}

function _frequencyBars(seances) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    return d.toISOString().split('T')[0];
  });
  const labels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const counts = days.map(day => seances.filter(s => s.date?.startsWith(day)).length);
  const max    = Math.max(...counts, 1);

  return days.map((_, i) => {
    const h     = Math.round((counts[i] / max) * 44);
    const today = new Date().toISOString().split('T')[0] === days[i];
    return `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
        <div style="width:100%;height:${h || 4}px;
          background:${counts[i] > 0 ? 'var(--color-primary)' : 'var(--surface-3)'};
          border-radius:4px;transition:height .3s;
          ${counts[i] > 0 ? 'box-shadow:0 2px 6px rgba(232,67,42,.3)' : ''}"></div>
        <span style="font-size:9px;color:${today ? 'var(--color-primary)' : 'var(--text-muted)'};
          font-weight:${today ? 700 : 500}">${labels[i]}</span>
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
        .select('poids_kg, repetitions, created_at')
        .eq('user_id', currentUser.id)
        .eq('exercice_nom', exoNom)
        .not('poids_kg', 'is', null)
        .not('repetitions', 'is', null)
        .order('created_at', { ascending: true });

      if (!series?.length) {
        chartEl.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Aucune donnée pour cet exercice.</p>`;
        return;
      }

      // Grouper par date → meilleur 1RM par date
      const byDate = {};
      for (const s of series) {
        const date = s.created_at.split('T')[0];
        const orm  = calc1RM(s.poids_kg, s.repetitions);
        if (!byDate[date] || orm > byDate[date].orm) {
          byDate[date] = { orm, poids: s.poids_kg, reps: s.repetitions };
        }
      }

      const points = Object.entries(byDate)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, v]) => ({ date, ...v }));

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
          ${_svgLineChart(points.map(p => ({ x: new Date(p.date).getTime(), y: p.orm, label: p.date })))}
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

// ── Graphique SVG ─────────────────────────────────────────────────────

function _svgLineChart(data, { color = 'var(--color-primary)', height = 140 } = {}) {
  if (data.length < 2) {
    if (data.length === 1) {
      return `<div style="text-align:center;padding:var(--space-4);color:var(--text-muted);font-size:var(--font-size-sm)">
        ${data[0].y} kg — une seule séance enregistrée
      </div>`;
    }
    return '';
  }

  const W = 320, H = height, padX = 12, padY = 16;
  const cW = W - padX * 2;
  const cH = H - padY * 2;

  const xs = data.map(d => d.x);
  const ys = data.map(d => d.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys) * 0.95;
  const maxY = Math.max(...ys) * 1.05;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const toSvg = (x, y) => ({
    sx: padX + ((x - minX) / rangeX) * cW,
    sy: padY + cH - ((y - minY) / rangeY) * cH,
  });

  const pts = data.map(d => toSvg(d.x, d.y));
  const polyline = pts.map(p => `${p.sx},${p.sy}`).join(' ');

  // Aire sous la courbe
  const areaPath = `M ${pts[0].sx},${padY + cH} ` +
    pts.map(p => `L ${p.sx},${p.sy}`).join(' ') +
    ` L ${pts.at(-1).sx},${padY + cH} Z`;

  // Cercles uniquement pour les points extrêmes + dernier
  const circlePoints = [0, data.length - 1].filter((v, i, a) => a.indexOf(v) === i);

  // Labels Y (min et max)
  const yMin = Math.round(minY);
  const yMax = Math.round(maxY);

  return `
    <div style="overflow:hidden;border-radius:var(--radius-md)">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;overflow:visible">
        <defs>
          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.2"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
          </linearGradient>
        </defs>

        <!-- Grille -->
        <line x1="${padX}" y1="${padY}" x2="${padX}" y2="${padY+cH}" stroke="var(--border)" stroke-width="1"/>
        <line x1="${padX}" y1="${padY+cH}" x2="${W-padX}" y2="${padY+cH}" stroke="var(--border)" stroke-width="1"/>

        <!-- Aire -->
        <path d="${areaPath}" fill="url(#area-grad)"/>

        <!-- Ligne -->
        <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round"/>

        <!-- Points clés -->
        ${circlePoints.map(i => {
          const p = pts[i];
          return `<circle cx="${p.sx}" cy="${p.sy}" r="4" fill="${color}" stroke="var(--surface)" stroke-width="2"/>`;
        }).join('')}

        <!-- Labels Y -->
        <text x="${padX - 4}" y="${padY + 4}" fill="var(--text-muted)" font-size="9" text-anchor="end" font-weight="600">${yMax}</text>
        <text x="${padX - 4}" y="${padY + cH}" fill="var(--text-muted)" font-size="9" text-anchor="end" font-weight="600">${yMin}</text>
      </svg>
    </div>`;
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
