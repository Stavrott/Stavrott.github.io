import { supabase }             from '../js/supabase.js';
import { currentUser }          from '../js/auth.js';
import { EXERCICES }            from './exercices.js';
import { showToast }            from '../js/utils.js';
import { fetchExerciseImage }   from '../js/exercisedb.js';
import { metricFields, DEFAULT_METRIC_TYPE } from '../js/metrics.js';
import { MUSCLE_MAP, MUSCLES_TO_GROUP, bodyMapHTML, highlightMuscles } from '../js/body-map.js';

const _BODY_MAP_UID = 'rv';

// ── Helpers ─────────────────────────────────────────────────────────────

function _getGroupe(nom) {
  return EXERCICES.find(e => e.nom === nom)?.groupe ?? null;
}

function _getMuscles(nom) {
  return EXERCICES.find(e => e.nom === nom)?.muscles ?? [];
}

// Tous les groupes SVG sollicités par un exercice (primaire + secondaires)
function _getAllGroupes(nom) {
  const primary = _getGroupe(nom);
  const secondary = _getMuscles(nom).map(m => MUSCLES_TO_GROUP[m]).filter(Boolean);
  return [primary, ...secondary].filter(Boolean);
}

function _calcVolume(exercices) {
  return (exercices ?? []).reduce((sum, ex) =>
    sum + (ex.series ?? []).reduce((s, serie) =>
      s + (serie.poids ?? 0) * (serie.reps ?? 0), 0), 0);
}

function _fmtVol(v) {
  return v >= 1000 ? `${(v / 1000).toFixed(1)} t` : `${v} kg`;
}

// ── Public ───────────────────────────────────────────────────────────────

let _el     = null;
let _chartFilter = '1m';

export function openRoutineView(routine, { onEdit, onStart } = {}) {
  _el?.remove();
  _chartFilter = '1m';

  const groups  = [...new Set((routine.exercices ?? []).flatMap(ex => _getAllGroupes(ex.nom)))];
  const muscles = [...new Set((routine.exercices ?? []).flatMap(ex => _getMuscles(ex.nom)))];
  const volume  = _calcVolume(routine.exercices);
  const nbSeries = (routine.exercices ?? []).reduce((a, ex) => a + (ex.series?.length ?? 0), 0);

  _el = document.createElement('div');
  _el.id = 'rv-overlay';
  _el.style.cssText = 'position:fixed;inset:0;background:var(--background);z-index:1000;display:flex;flex-direction:column;overflow:hidden';

  _el.innerHTML = `
    <header style="display:flex;align-items:center;gap:10px;padding:12px 16px;
      border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0">
      <button id="rv-back" class="icon-btn" aria-label="Retour">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
      </button>
      <h2 style="flex:1;font-size:1.1rem;font-weight:800;min-width:0;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(routine.nom)}</h2>
    </header>

    <div style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:20px;
      padding-bottom:calc(16px + env(safe-area-inset-bottom, 0px))">

      <!-- CTA buttons -->
      <div style="display:flex;gap:10px">
        <button id="rv-start" class="btn btn-primary" style="flex:1">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;flex-shrink:0">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Commencer la séance
        </button>
        <button id="rv-edit" class="btn btn-secondary" style="flex-shrink:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            style="width:16px;height:16px">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Modifier
        </button>
      </div>

      <!-- Résumé -->
      <div class="card" style="display:flex;gap:0;padding:0;overflow:hidden">
        ${_statCell(routine.exercices?.length ?? 0, 'Exercices')}
        <div style="width:1px;background:var(--border)"></div>
        ${_statCell(nbSeries, 'Séries')}
        <div style="width:1px;background:var(--border)"></div>
        ${_statCell(volume ? _fmtVol(volume) : '—', 'Volume théo.')}
      </div>

      <!-- Exercices -->
      <div>
        <h3 style="font-size:.8rem;font-weight:700;color:var(--text-muted);letter-spacing:.06em;
          text-transform:uppercase;margin-bottom:10px">Exercices</h3>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${_renderExoList(routine.exercices ?? [])}
        </div>
      </div>

      <!-- Body map -->
      <div class="card" style="padding:16px">
        <h3 style="font-size:.8rem;font-weight:700;color:var(--text-muted);letter-spacing:.06em;
          text-transform:uppercase;margin-bottom:14px">Muscles sollicités</h3>
        ${bodyMapHTML(_BODY_MAP_UID)}
        ${groups.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:14px">
          ${groups.map(g => `
            <span class="chip active" style="font-size:11px">
              ${MUSCLE_MAP[g]?.label ?? g}
            </span>`).join('')}
        </div>
        ${muscles.length ? `
        <p style="font-size:.78rem;color:var(--text-muted);margin-top:8px;line-height:1.6">
          ${muscles.join(' · ')}
        </p>` : ''}` : `
        <p style="text-align:center;color:var(--text-muted);font-size:.85rem;padding:8px 0">
          Ajoutez des exercices pour voir la cartographie
        </p>`}
      </div>

      <!-- Graphique de progression -->
      <div class="card" style="padding:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;flex-wrap:wrap">
          <h3 style="font-size:.8rem;font-weight:700;color:var(--text-muted);letter-spacing:.06em;text-transform:uppercase">
            Progression
          </h3>
          <div style="display:flex;gap:4px" id="rv-chart-filters">
            ${['7j','1m','3m','6m','1a'].map(f => `
              <button class="chip rv-filter ${f === _chartFilter ? 'active' : ''}"
                data-filter="${f}" style="font-size:10px;padding:3px 8px">${f}</button>`).join('')}
          </div>
        </div>
        <div id="rv-chart-area" style="min-height:120px;display:flex;align-items:center;justify-content:center">
          <div style="text-align:center;color:var(--text-muted)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
              style="width:32px;height:32px;margin:0 auto 8px;display:block;opacity:.3">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <p style="font-size:.75rem">Chargement…</p>
          </div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(_el);
  highlightMuscles(_el, groups, _BODY_MAP_UID);
  _loadChart(routine.nom);
  _loadExoImages(_el);

  _el.querySelector('#rv-back')?.addEventListener('click', _close);
  _el.querySelector('#rv-edit')?.addEventListener('click', () => { _close(); onEdit?.(); });
  _el.querySelector('#rv-start')?.addEventListener('click', () => { _close(); onStart?.(); });
  _el.querySelector('#rv-chart-filters')?.addEventListener('click', e => {
    const btn = e.target.closest('.rv-filter');
    if (!btn) return;
    _chartFilter = btn.dataset.filter;
    _el.querySelectorAll('.rv-filter').forEach(b => b.classList.toggle('active', b === btn));
    _loadChart(routine.nom);
  });
}

function _close() { _el?.remove(); _el = null; }

// ── Rendu exercices ─────────────────────────────────────────────────────

function _renderExoList(exercices) {
  if (!exercices.length) return `<p style="color:var(--text-muted);font-size:.85rem">Aucun exercice</p>`;

  return exercices.map((ex, i) => {
    const sup  = i < exercices.length - 1 && exercices[i].repos_inter === null;
    const nbS  = ex.series?.length ?? 0;
    const vol  = _calcVolume([ex]);
    const groupe = _getGroupe(ex.nom);

    return `
      <div class="card" style="padding:12px 14px">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="exo-thumb" data-img-nom="${_esc(ex.nom)}"
            style="width:52px;height:52px;min-width:52px;border-radius:10px;overflow:hidden;
              background:var(--surface-3);display:flex;align-items:center;justify-content:center;
              flex-shrink:0;font-size:.75rem;font-weight:800;color:var(--text-muted)">${i + 1}</div>
          <div style="flex:1;min-width:0">
            <p style="font-weight:700;font-size:.9rem;
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(ex.nom)}</p>
            <p style="font-size:.75rem;color:var(--text-muted);margin-top:1px">
              ${nbS} série${nbS !== 1 ? 's' : ''}
              ${vol ? ` · ${_fmtVol(vol)} théoriques` : ''}
              ${groupe ? ` · ${groupe}` : ''}
            </p>
          </div>
        </div>
        ${nbS ? `
        <div style="display:grid;grid-template-columns:repeat(${metricFields(ex.type_metrique).length},1fr) 60px;gap:4px;margin-top:10px;
          padding-top:10px;border-top:1px solid var(--border)">
          ${metricFields(ex.type_metrique).map(f => `
            <p style="font-size:10px;font-weight:700;color:var(--text-muted);text-align:center;letter-spacing:.05em">${f.header}</p>`).join('')}
          <p style="font-size:10px;font-weight:700;color:var(--text-muted);text-align:center;letter-spacing:.05em">REPOS</p>
          ${(ex.series ?? []).map(s => `
            ${metricFields(ex.type_metrique).map(f => `
            <p style="text-align:center;font-size:.82rem;font-weight:600;padding:2px 0">
              ${s[f.key] ?? '—'}
            </p>`).join('')}
            <p style="text-align:center;font-size:.82rem;font-weight:600;padding:2px 0;color:var(--text-muted)">
              ${s.repos ?? 90}s
            </p>`).join('')}
        </div>` : ''}
      </div>
      ${sup ? `
      <div style="text-align:center;font-size:11px;font-weight:800;color:var(--color-primary);
        margin:-2px 0;letter-spacing:.04em">⚡ SUPERSET</div>` : ''}`;
  }).join('');
}

function _statCell(val, label) {
  return `
    <div style="flex:1;text-align:center;padding:14px 8px">
      <p style="font-size:1.2rem;font-weight:900;color:var(--text-primary)">${val}</p>
      <p style="font-size:.72rem;color:var(--text-muted);font-weight:600;margin-top:2px">${label}</p>
    </div>`;
}

// ── Graphique de progression ────────────────────────────────────────────

async function _loadChart(routineNom) {
  const area = _el?.querySelector('#rv-chart-area');
  if (!area) return;

  area.innerHTML = `
    <div style="text-align:center;color:var(--text-muted)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
        style="width:32px;height:32px;margin:0 auto 8px;display:block;opacity:.3">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
      <p style="font-size:.75rem">Chargement…</p>
    </div>`;

  try {
    const days     = { '7j': 7, '1m': 30, '3m': 90, '6m': 180, '1a': 365 }[_chartFilter] ?? 30;
    const since    = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const { data: seances, error: e1 } = await supabase
      .from('seances')
      .select('id, date')
      .eq('user_id', currentUser.id)
      .eq('nom', routineNom)
      .gte('date', sinceStr)
      .order('date', { ascending: true });

    if (e1 || !seances?.length) { _renderEmptyChart(area); return; }

    const { data: seriesData, error: e2 } = await supabase
      .from('series')
      .select('seance_id, poids_kg, repetitions')
      .in('seance_id', seances.map(s => s.id));

    if (e2) { _renderEmptyChart(area); return; }

    const volBySeance = {};
    for (const r of seriesData ?? []) {
      volBySeance[r.seance_id] = (volBySeance[r.seance_id] ?? 0) + (r.poids_kg ?? 0) * (r.repetitions ?? 0);
    }

    const points = seances
      .map(s => ({ date: new Date(s.date), volume: volBySeance[s.id] ?? 0 }))
      .filter(p => p.volume > 0);

    if (!points.length) { _renderEmptyChart(area); return; }
    _renderChart(area, points);
  } catch {
    _renderEmptyChart(area);
  }
}

function _renderEmptyChart(area) {
  area.innerHTML = `
    <div style="text-align:center;padding:16px 0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
        style="width:40px;height:40px;margin:0 auto 10px;display:block;opacity:.25">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
      <p style="font-size:.82rem;font-weight:700;color:var(--text-secondary);margin-bottom:4px">
        Aucune donnée disponible
      </p>
      <p style="font-size:.74rem;color:var(--text-muted);line-height:1.5">
        Lancez votre première séance pour<br>suivre votre progression ici.
      </p>
    </div>`;
}

function _renderChart(area, points) {
  const W = 280, H = 120, PAD = { t: 8, r: 8, b: 28, l: 44 };
  const cw = W - PAD.l - PAD.r;
  const ch = H - PAD.t - PAD.b;

  const vols  = points.map(p => p.volume);
  const minV  = Math.min(...vols);
  const maxV  = Math.max(...vols);
  const range = maxV - minV || 1;

  const xOf = i => PAD.l + (i / (points.length - 1 || 1)) * cw;
  const yOf = v => PAD.t + ch - ((v - minV) / range) * ch;

  const linePts = points.map((p, i) => `${xOf(i)},${yOf(p.volume)}`).join(' ');

  const gridY = [minV, (minV + maxV) / 2, maxV];
  const gridLines = gridY.map(v => {
    const y = yOf(v);
    return `
      <line x1="${PAD.l}" y1="${y}" x2="${W - PAD.r}" y2="${y}"
        stroke="var(--chart-grid)" stroke-dasharray="3,3"/>
      <text x="${PAD.l - 4}" y="${y + 4}" font-size="8" fill="var(--text-muted)"
        text-anchor="end">${v >= 1000 ? (v/1000).toFixed(1)+'t' : Math.round(v)}</text>`;
  }).join('');

  const dateLabels = [0, Math.floor(points.length / 2), points.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i && points[v])
    .map(i => {
      const d = points[i].date;
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      return `<text x="${xOf(i)}" y="${H - 6}" font-size="8" fill="var(--text-muted)" text-anchor="middle">${label}</text>`;
    }).join('');

  area.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">
      ${gridLines}
      <polyline points="${linePts}" fill="none"
        stroke="var(--color-primary)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <linearGradient id="rv-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--color-primary)" stop-opacity=".18"/>
        <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0"/>
      </linearGradient>
      <polygon points="${linePts} ${xOf(points.length-1)},${H-PAD.b} ${PAD.l},${H-PAD.b}"
        fill="url(#rv-grad)"/>
      ${points.map((p, i) => `
        <circle cx="${xOf(i)}" cy="${yOf(p.volume)}" r="3"
          fill="var(--color-primary)" stroke="var(--background)" stroke-width="1.5"/>`).join('')}
      ${dateLabels}
    </svg>`;
}

// ── Chargement miniatures ────────────────────────────────────────────────

function _loadExoImages(container) {
  container.querySelectorAll('.exo-thumb[data-img-nom]').forEach(el => {
    const nom = el.dataset.imgNom;
    fetchExerciseImage(nom).then(url => {
      if (!el.isConnected || !url) return;
      el.innerHTML = `<img src="${url}" alt="${nom}"
        style="width:100%;height:100%;object-fit:cover;display:block">`;
    });
  });
}

// ── Util ─────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}
