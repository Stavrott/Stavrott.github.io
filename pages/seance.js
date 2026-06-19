import { supabase }           from '../js/supabase.js';
import { currentUser }         from '../js/auth.js';
import { showToast, confirmDialog } from '../js/utils.js';
import { fetchExerciseImage }  from '../js/exercisedb.js';
import { metricFields, parseFieldValue, defaultFieldValue, fieldByKey, FIELD_DB_COLUMN, DEFAULT_METRIC_TYPE } from '../js/metrics.js';

const _uid = () => Math.random().toString(36).slice(2, 10);
const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const _pad = n => String(Math.floor(Math.abs(n))).padStart(2, '0');
const _fmt = s => `${_pad(s / 60)}:${_pad(s % 60)}`;

// ── State ─────────────────────────────────────────────────────────────────
let _el        = null;
let _state     = null;
let _startedAt = null;
let _clockInt  = null;
let _restIntId = null;
let _restEnd   = 0;
let _restTotal = 0;

// ── Beep ──────────────────────────────────────────────────────────────────

function _beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[0, 880], [0.18, 1046], [0.36, 1318]].forEach(([delay, freq]) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.35, ctx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.28);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.32);
    });
  } catch {}
}

// ── Data ──────────────────────────────────────────────────────────────────

async function _loadLastSession(routineNom) {
  try {
    const { data: seance } = await supabase
      .from('seances')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('nom', routineNom)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!seance) return {};

    const { data: rows } = await supabase
      .from('series')
      .select('exercice_nom, numero_serie, poids_kg, repetitions')
      .eq('seance_id', seance.id)
      .order('numero_serie', { ascending: true });

    const map = {};
    for (const r of rows ?? []) {
      if (!map[r.exercice_nom]) map[r.exercice_nom] = [];
      map[r.exercice_nom].push({ poids: r.poids_kg, reps: r.repetitions });
    }
    return map;
  } catch { return {}; }
}

function _initExo(def, lastMap) {
  const last = lastMap[def.nom] ?? [];
  const type_metrique = def.type_metrique || DEFAULT_METRIC_TYPE;
  return {
    uid:           def.uid || _uid(),
    nom:           def.nom,
    type_metrique,
    repos_inter:   def.repos_inter,
    series: (def.series ?? []).map((s, i) => {
      const out = { uid: s.uid || _uid(), repos: s.repos ?? 90, fait: false };
      metricFields(type_metrique).forEach(f => {
        out[f.key] = last[i]?.[f.key] ?? defaultFieldValue(f, s);
      });
      if (type_metrique === 'kg_reps') {
        out.prevPoids = last[i]?.poids ?? null;
        out.prevReps  = last[i]?.reps  ?? null;
      }
      return out;
    }),
  };
}

// Groupe les exercices en blocs single / superset.
// Un superset peut chaîner N exercices consécutifs (repos_inter === null
// sur chacun sauf le dernier du groupe).
function _buildBlocks(exercices) {
  const blocks = []; let i = 0;
  while (i < exercices.length) {
    if (exercices[i].repos_inter === null && i + 1 < exercices.length) {
      const exos = [exercices[i]];
      let j = i;
      while (exercices[j].repos_inter === null && j + 1 < exercices.length) {
        exos.push(exercices[j + 1]);
        j++;
      }
      blocks.push({ type: 'superset', exos });
      i = j + 1;
    } else {
      blocks.push({ type: 'single', ex: exercices[i] });
      i++;
    }
  }
  return blocks;
}

const _findExo      = uid => _state.exercices.find(e => e.uid === uid);
const _isLastExo    = uid => _state.exercices.at(-1)?.uid === uid;
const _totalDone    = ()  => _state.exercices.reduce((a, ex) => a + ex.series.filter(s => s.fait).length, 0);
const _totalSets    = ()  => _state.exercices.reduce((a, ex) => a + ex.series.length, 0);

// ── Public entry ──────────────────────────────────────────────────────────

export async function openSeance(routine) {
  const lastMap   = await _loadLastSession(routine.nom);
  const exercices = (routine.exercices ?? []).map(ex => _initExo(ex, lastMap));
  _state     = { routineId: routine.id, nom: routine.nom, exercices, blocks: null };
  _state.blocks  = _buildBlocks(exercices);
  _startedAt = Date.now();
  _mount();
}

// ── Mount ─────────────────────────────────────────────────────────────────

function _mount() {
  _el?.remove();
  _el = document.createElement('div');
  _el.id = 'seance-overlay';
  _el.style.cssText = 'position:fixed;inset:0;background:var(--background);z-index:1050;display:flex;flex-direction:column;overflow:hidden';

  _el.innerHTML = `
    <header style="flex-shrink:0">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;
        border-bottom:1px solid var(--border);background:var(--surface)">
        <button id="sc-back" class="icon-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <div style="flex:1;min-width:0">
          <p style="font-weight:800;font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${_esc(_state.nom)}</p>
          <p id="sc-clock" style="font-size:.72rem;color:var(--text-muted);font-weight:600;font-variant-numeric:tabular-nums">00:00</p>
        </div>
        <button id="sc-finish" class="btn btn-primary" style="flex-shrink:0">Terminer</button>
      </div>
      <div style="height:3px;background:var(--surface-3)">
        <div id="sc-prog-bar" style="height:100%;background:var(--color-primary);width:0%;transition:width .4s ease"></div>
      </div>
    </header>

    <div id="sc-body" style="flex:1;overflow-y:auto;padding:12px 16px 160px;
      display:flex;flex-direction:column;gap:12px"></div>

    <!-- Rest timer bottom sheet -->
    <div id="rest-sheet" style="position:fixed;bottom:0;left:0;right:0;
      background:var(--surface);border-radius:20px 20px 0 0;
      padding:20px 20px calc(20px + env(safe-area-inset-bottom,0px));
      border-top:1px solid var(--border);z-index:1300;
      transform:translateY(100%);transition:transform .28s cubic-bezier(.4,0,.2,1);
      box-shadow:0 -8px 40px rgba(0,0,0,.45)">
      <p id="rest-label" style="text-align:center;font-size:.68rem;font-weight:800;
        text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);margin-bottom:2px">
        Récupération</p>
      <p id="rest-count" style="text-align:center;font-size:4.2rem;font-weight:900;
        color:var(--color-primary);line-height:1;margin-bottom:10px;
        font-variant-numeric:tabular-nums">0:00</p>
      <div style="height:3px;background:var(--surface-3);border-radius:2px;margin-bottom:14px;overflow:hidden">
        <div id="rest-bar" style="height:100%;background:var(--color-primary);border-radius:2px;
          width:100%;transition:width .9s linear"></div>
      </div>
      <div style="display:flex;gap:8px">
        <button id="rest-add30" class="btn btn-secondary" style="flex:1">+30s</button>
        <button id="rest-skip"  class="btn btn-primary"   style="flex:2">Passer →</button>
      </div>
    </div>`;

  document.body.appendChild(_el);
  _render();
  _clockInt = setInterval(_tickClock, 1000);
  _bindEvents();
}

// ── Render ────────────────────────────────────────────────────────────────

function _render() {
  const body = _el?.querySelector('#sc-body');
  if (!body) return;
  body.innerHTML = _state.blocks.map(b =>
    b.type === 'single' ? _htmlSingle(b.ex) : _htmlSuperset(b.exos)
  ).join('');
  _loadThumbs(body);
  _updateProg();
}

// ── HTML helpers ──────────────────────────────────────────────────────────

const _THUMB_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
  stroke-linecap="round" style="width:16px;height:16px;color:var(--text-muted)">
  <path d="M6 5v14M18 5v14M3 8h3m12 0h3M3 16h3m12 0h3"/></svg>`;

function _thumb(nom, size = 44) {
  return `<div class="exo-thumb" data-img-nom="${_esc(nom)}"
    style="width:${size}px;height:${size}px;min-width:${size}px;border-radius:${size > 40 ? 8 : 6}px;
      overflow:hidden;background:var(--surface-3);
      display:flex;align-items:center;justify-content:center;flex-shrink:0">
    ${_THUMB_SVG}</div>`;
}

function _singleCols(type_metrique) {
  const showPrev = (type_metrique || DEFAULT_METRIC_TYPE) === 'kg_reps';
  const n = metricFields(type_metrique).length;
  return `24px ${showPrev ? '44px ' : ''}${'64px '.repeat(n)}36px`;
}

function _htmlSingle(ex) {
  const allDone = ex.series.every(s => s.fait);
  const fields  = metricFields(ex.type_metrique);
  const showPrev = (ex.type_metrique || DEFAULT_METRIC_TYPE) === 'kg_reps';
  return `
    <div class="card" style="padding:0;overflow:hidden;flex-shrink:0${allDone ? ';opacity:.6' : ''}">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 14px 10px">
        ${_thumb(ex.nom, 44)}
        <p style="font-weight:700;font-size:.95rem;flex:1;min-width:0;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(ex.nom)}</p>
        ${allDone ? `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="3"
          stroke-linecap="round" style="width:18px;height:18px;flex-shrink:0">
          <polyline points="20 6 9 17 4 12"/></svg>` : ''}
      </div>
      <div style="padding:0 14px 14px">
        <div style="display:grid;grid-template-columns:${_singleCols(ex.type_metrique)};gap:4px;
          padding-bottom:5px;margin-bottom:4px;border-bottom:1px solid var(--border)">
          <span></span>
          ${showPrev ? `<p style="font-size:10px;font-weight:700;color:var(--text-muted);text-align:right;letter-spacing:.04em">PRÉC.</p>` : ''}
          ${fields.map(f => `<p style="font-size:10px;font-weight:700;color:var(--text-muted);text-align:center;letter-spacing:.05em">${f.header}</p>`).join('')}
          <span></span>
        </div>
        ${ex.series.map((s, si) => _htmlRow(ex.uid, s, si, ex.type_metrique)).join('')}
      </div>
    </div>`;
}

function _htmlRow(exUid, s, si, type_metrique) {
  const done = s.fait;
  const fields   = metricFields(type_metrique);
  const showPrev = (type_metrique || DEFAULT_METRIC_TYPE) === 'kg_reps';
  const prev = showPrev && (s.prevPoids != null || s.prevReps != null)
    ? `${s.prevPoids ?? '—'}×${s.prevReps ?? '—'}` : '';
  return `
    <div style="display:grid;grid-template-columns:${_singleCols(type_metrique)};gap:4px;
      align-items:center;margin-bottom:4px">
      <p style="font-size:.78rem;font-weight:700;color:var(--text-muted);text-align:center">${si + 1}</p>
      ${showPrev ? `<p style="font-size:.65rem;color:var(--text-muted);text-align:right;white-space:nowrap">${prev}</p>` : ''}
      ${fields.map(f => `
        <input class="form-input sc-field" data-field="${f.key}" type="number" step="${f.step}" min="0"
          inputmode="${f.type === 'int' ? 'numeric' : 'decimal'}"
          data-sid="${s.uid}" data-exo="${exUid}" value="${s[f.key] ?? ''}" placeholder="—"
          style="text-align:center;padding:5px 2px;font-size:.85rem;font-weight:600;
            width:64px;justify-self:center;
            ${done ? 'opacity:.35;pointer-events:none' : ''}">`).join('')}
      <button class="sc-check" data-sid="${s.uid}" data-exo="${exUid}"
        style="width:32px;height:32px;border-radius:50%;flex-shrink:0;cursor:pointer;
          border:2.5px solid ${done ? 'var(--color-primary)' : 'var(--border)'};
          background:${done ? 'var(--color-primary)' : 'transparent'};
          color:${done ? 'white' : 'var(--border)'};
          display:flex;align-items:center;justify-content:center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </button>
    </div>`;
}

function _htmlSuperset(exos) {
  const rounds   = Math.max(...exos.map(ex => ex.series.length));
  const allDone  = exos.every(ex => ex.series.every(s => s.fait));
  const sameType = exos.every(ex => ex.type_metrique === exos[0].type_metrique);
  const nCols    = Math.max(...exos.map(ex => metricFields(ex.type_metrique).length));
  // grid: [name] [prev] [...champs] [✓ ou spacer]
  const GRID = `display:grid;grid-template-columns:1fr 44px ${'64px '.repeat(nCols)}36px;gap:4px`;
  const [first, ...rest] = exos;
  return `
    <div class="card" style="padding:0;overflow:hidden;flex-shrink:0${allDone ? ';opacity:.6' : ''}">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 14px 8px;
        border-bottom:1px solid var(--border)">
        ${_thumb(first.nom, 36)}
        <div style="flex:1;min-width:0">
          <p style="font-size:.78rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${_esc(first.nom)}</p>
          <p style="font-size:.7rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ⚡ ${rest.map(ex => '+ ' + _esc(ex.nom)).join(' ')}</p>
        </div>
        ${_thumb(rest.at(-1)?.nom ?? first.nom, 36)}
      </div>
      <div style="padding:10px 14px 14px">
        <!-- column labels — uniquement si tous les exercices partagent le même type de métrique -->
        ${sameType ? `
        <div style="${GRID};padding-bottom:5px;margin-bottom:6px;border-bottom:1px solid var(--border)">
          <span></span>
          <p style="font-size:10px;font-weight:700;color:var(--text-muted);text-align:right;letter-spacing:.04em">PRÉC.</p>
          ${metricFields(exos[0].type_metrique).map(f => `<p style="font-size:10px;font-weight:700;color:var(--text-muted);text-align:center;letter-spacing:.05em">${f.header}</p>`).join('')}
          <span></span>
        </div>` : ''}
        ${Array.from({ length: rounds }, (_, r) => _htmlSsRound(exos, r, GRID, nCols, sameType)).join('')}
      </div>
    </div>`;
}

function _htmlSsFields(ex, s, nCols, placeholderFromHeader) {
  const fields = metricFields(ex.type_metrique);
  const inputs = fields.map(f => `
    <input class="form-input sc-field" data-field="${f.key}" type="number" step="${f.step}" min="0"
      inputmode="${f.type === 'int' ? 'numeric' : 'decimal'}"
      data-sid="${s.uid}" data-exo="${ex.uid}" value="${s[f.key] ?? ''}"
      placeholder="${placeholderFromHeader ? f.short : '—'}"
      style="text-align:center;padding:5px 2px;font-size:.85rem;font-weight:600;min-width:0;
        ${s.fait ? 'pointer-events:none' : ''}">`).join('');
  return inputs + '<span></span>'.repeat(nCols - fields.length);
}

function _htmlSsRound(exos, r, GRID, nCols, sameType) {
  const series = exos.map(ex => ex.series[r]);
  const done    = series.every(s => s?.fait ?? true);
  const prev = (ex, s) => ex.type_metrique === 'kg_reps' && (s?.prevPoids != null || s?.prevReps != null)
    ? `${s.prevPoids ?? '—'}×${s.prevReps ?? '—'}` : '';

  const rows = exos.map((ex, idx) => {
    const s = series[idx];
    if (!s) return '';
    const isLast = idx === exos.length - 1;
    return `
    <div style="${GRID};align-items:center;${isLast ? '' : 'margin-bottom:3px;'}${s.fait ? 'opacity:.4' : ''}">
      <p style="font-size:.8rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${_esc(ex.nom)}</p>
      <p style="font-size:.65rem;color:var(--text-muted);text-align:right;white-space:nowrap">
        ${prev(ex, s)}</p>
      ${_htmlSsFields(ex, s, nCols, !sameType)}
      ${isLast
        ? `<button class="sc-ss-ok" data-exos="${exos.map(e => e.uid).join(',')}" data-round="${r}"
            ${done ? 'disabled' : ''}
            style="width:32px;height:32px;border-radius:50%;flex-shrink:0;
              cursor:${done ? 'default' : 'pointer'};
              border:2.5px solid ${done ? 'var(--color-primary)' : 'var(--border)'};
              background:${done ? 'var(--color-primary)' : 'transparent'};
              color:${done ? 'white' : 'var(--border)'};
              display:flex;align-items:center;justify-content:center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>`
        : '<span></span>'}
    </div>`;
  }).join('');

  const rounds = Math.max(...exos.map(ex => ex.series.length));
  const isLastRound = r === rounds - 1;
  return `
    <div style="padding-bottom:${isLastRound ? '0' : '10px'};
      ${isLastRound ? '' : 'margin-bottom:6px;border-bottom:1px solid var(--border)'}">
      <p style="font-size:10px;font-weight:800;color:var(--text-muted);
        letter-spacing:.06em;margin-bottom:4px">ROUND ${r + 1}</p>
      ${rows}
    </div>`;
}

// ── Events ────────────────────────────────────────────────────────────────

function _bindEvents() {
  _el.querySelector('#sc-back')?.addEventListener('click', async () => {
    if (!_totalDone() || await confirmDialog('Quitter ? La séance ne sera pas sauvegardée.', { confirmLabel: 'Quitter', danger: false })) _close();
  });

  _el.querySelector('#sc-finish')?.addEventListener('click', async () => {
    _syncInputs();
    await _save();
  });

  _el.querySelector('#sc-body')?.addEventListener('click', e => {
    const chk  = e.target.closest('.sc-check');
    if (chk)  { _onCheck(chk.dataset.exo, chk.dataset.sid); return; }

    const ssOk = e.target.closest('.sc-ss-ok');
    if (ssOk) { _onSsValidate(ssOk.dataset.exos.split(','), +ssOk.dataset.round); }
  });

  _el.querySelector('#rest-skip')?.addEventListener('click', _stopRest);
  _el.querySelector('#rest-add30')?.addEventListener('click', () => {
    if (_restEnd) { _restEnd += 30_000; _restTotal += 30; }
  });
}

// ── Set check ─────────────────────────────────────────────────────────────

function _onCheck(exoUid, sid) {
  _syncInputs();
  const ex = _findExo(exoUid);
  if (!ex) return;
  const si = ex.series.findIndex(s => s.uid === sid);
  if (si < 0 || ex.series[si].fait) return;

  ex.series[si].fait = true;
  _render();

  const isLastSet = si === ex.series.length - 1;
  if (isLastSet && !_isLastExo(ex.uid) && (ex.repos_inter ?? 0) > 0) {
    _startRest(ex.repos_inter, 'Entre exercices');
  } else if (!isLastSet) {
    _startRest(ex.series[si].repos ?? 90, 'Entre séries');
  }
}

// ── Superset validate ─────────────────────────────────────────────────────

function _onSsValidate(uids, round) {
  _syncInputs();
  const exos = uids.map(_findExo).filter(Boolean);
  if (!exos.length) return;

  exos.forEach(ex => { if (ex.series[round]) ex.series[round].fait = true; });
  _render();

  const rounds      = Math.max(...exos.map(ex => ex.series.length));
  const isLastRound = round === rounds - 1;
  const last        = exos.at(-1);

  if (isLastRound && !_isLastExo(last.uid) && (last.repos_inter ?? 0) > 0) {
    _startRest(last.repos_inter, 'Entre exercices');
  } else if (!isLastRound) {
    _startRest(exos[0].series[round]?.repos ?? 90, 'Entre rounds');
  }
}

// ── Rest timer ────────────────────────────────────────────────────────────

function _startRest(seconds, label) {
  _clearRestInterval();
  _restTotal = seconds;
  _restEnd   = Date.now() + seconds * 1000;

  const sheet = _el?.querySelector('#rest-sheet');
  const lbl   = _el?.querySelector('#rest-label');
  if (!sheet) return;
  if (lbl) lbl.textContent = label;
  sheet.style.transform = 'translateY(0)';

  const tick = () => {
    const rem = Math.max(0, (_restEnd - Date.now()) / 1000);
    const cnt = _el?.querySelector('#rest-count');
    const bar = _el?.querySelector('#rest-bar');
    if (cnt) cnt.textContent = _fmt(Math.ceil(rem));
    if (bar) bar.style.width  = `${(rem / _restTotal) * 100}%`;
    if (rem <= 0) { _clearRestInterval(); _beep(); _hideSheet(); }
  };
  tick();
  _restIntId = setInterval(tick, 250);
}

function _stopRest()  { _clearRestInterval(); _hideSheet(); }
function _hideSheet() {
  const s = _el?.querySelector('#rest-sheet');
  if (s) s.style.transform = 'translateY(100%)';
}
function _clearRestInterval() {
  if (_restIntId) { clearInterval(_restIntId); _restIntId = null; }
}

// ── Progress ──────────────────────────────────────────────────────────────

function _updateProg() {
  const bar = _el?.querySelector('#sc-prog-bar');
  if (!bar) return;
  bar.style.width = `${_totalSets() ? (_totalDone() / _totalSets()) * 100 : 0}%`;
}

// ── Clock ─────────────────────────────────────────────────────────────────

function _tickClock() {
  const el = _el?.querySelector('#sc-clock');
  if (el) el.textContent = _fmt(Math.floor((Date.now() - _startedAt) / 1000));
}

// ── Sync inputs → state ───────────────────────────────────────────────────

function _syncInputs() {
  _el?.querySelectorAll('.sc-field').forEach(inp => {
    const s = _findExo(inp.dataset.exo)?.series.find(s => s.uid === inp.dataset.sid);
    const field = fieldByKey(inp.dataset.field);
    if (s && field) s[field.key] = parseFieldValue(field, inp.value);
  });
}

// ── Save ──────────────────────────────────────────────────────────────────

async function _save() {
  if (!_totalDone()) { showToast('Aucune série complétée', 'warning'); return false; }

  const now       = new Date();
  const duree     = Math.max(1, Math.round((now - _startedAt) / 60_000));
  const dateStr   = now.toISOString().split('T')[0];
  const exercices = _state.exercices
    .map(ex => ({
      nom:    ex.nom,
      series: ex.series.filter(s => s.fait).map(s =>
        Object.fromEntries(metricFields(ex.type_metrique).map(f => [f.key, s[f.key]]))),
    }))
    .filter(ex => ex.series.length);

  try {
    const { data: seance, error: err1 } = await supabase.from('seances').insert({
      user_id: currentUser.id,
      nom:     _state.nom,
      date:    dateStr,
    }).select('id').single();
    if (err1) throw err1;

    await supabase.from('seances').update({
      duree_minutes: duree,
    }).eq('id', seance.id);

    const rows = [];
    for (const ex of _state.exercices) {
      let si = 1;
      for (const s of ex.series.filter(s => s.fait)) {
        const row = {
          user_id:      currentUser.id,
          seance_id:    seance.id,
          exercice_nom: ex.nom,
          numero_serie: si++,
        };
        metricFields(ex.type_metrique).forEach(f => {
          row[FIELD_DB_COLUMN[f.key]] = s[f.key] ?? 0;
        });
        rows.push(row);
      }
    }
    if (rows.length) {
      const { error: err2 } = await supabase.from('series').insert(rows);
      if (err2) console.error('series insert:', err2);
    }

    _showRecap(exercices, rows.length, duree, dateStr);
    return true;
  } catch (e) {
    console.error(e);
    showToast('Erreur lors de la sauvegarde', 'error');
    return false;
  }
}

// ── Recap popup ───────────────────────────────────────────────────────────

function _statCard(value, label) {
  return `<div style="background:var(--surface-3);border-radius:12px;padding:14px;text-align:center;flex:1">
    <p style="font-size:1.5rem;font-weight:900;color:var(--color-primary);line-height:1">${value}</p>
    <p style="font-size:.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;
      letter-spacing:.06em;margin-top:3px">${label}</p>
  </div>`;
}

function _showRecap(exercices, totalSeries, duree, dateStr) {
  const totalKg = _state.exercices.reduce((sum, ex) =>
    sum + ex.series.filter(s => s.fait).reduce((a, s) => a + (s.poids ?? 0) * (s.reps ?? 0), 0), 0);
  const dateFmt = new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:1400;display:flex;align-items:flex-end;background:rgba(0,0,0,.5)';
  overlay.innerHTML = `
    <div style="width:100%;background:var(--surface);border-radius:20px 20px 0 0;
      padding:24px 20px calc(28px + env(safe-area-inset-bottom,0px));
      border-top:1px solid var(--border)">
      <div style="width:40px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 20px"></div>
      <p style="font-size:1.25rem;font-weight:900;text-align:center;margin-bottom:3px">Séance terminée !</p>
      <p style="font-size:.78rem;color:var(--text-muted);text-align:center;margin-bottom:20px">${dateFmt}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        ${_statCard(totalKg > 0 ? `${Math.round(totalKg).toLocaleString('fr-FR')} kg` : '—', 'Volume total')}
        ${_statCard(totalSeries, 'Séries')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px">
        ${_statCard(`${duree} min`, 'Durée')}
        ${_statCard(exercices.length, 'Exercices')}
      </div>
      <button id="recap-close" class="btn btn-primary"
        style="width:100%;font-size:1rem;font-weight:800;padding:14px">
        Fermer
      </button>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('#recap-close')?.addEventListener('click', () => {
    overlay.remove();
    _close();
  });
}

// ── Thumbnails ────────────────────────────────────────────────────────────

function _loadThumbs(container) {
  container.querySelectorAll('.exo-thumb[data-img-nom]').forEach(el => {
    fetchExerciseImage(el.dataset.imgNom).then(url => {
      if (!el.isConnected || !url) return;
      el.innerHTML = `<img src="${url}" alt="${el.dataset.imgNom}"
        style="width:100%;height:100%;object-fit:cover;display:block">`;
    });
  });
}

// ── Close ─────────────────────────────────────────────────────────────────

function _close() {
  _clearRestInterval();
  if (_clockInt) { clearInterval(_clockInt); _clockInt = null; }
  _el?.remove();
  _el = _state = _startedAt = null;
  _restEnd = _restTotal = 0;
}
