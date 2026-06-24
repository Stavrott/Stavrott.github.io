import { currentUser }               from '../js/auth.js';
import { supabase }                   from '../js/supabase.js';
import { showToast, formatTime, openModal, closeModal, confirmDialog } from '../js/utils.js';
import { startRestTimer, hideTimer }  from '../components/timer.js';
import { APP_CONFIG }                 from '../js/config.js';
import { metricFields, parseFieldValue, fieldByKey, FIELD_DB_COLUMN, DEFAULT_METRIC_TYPE } from '../js/metrics.js';
import { estimateCaloriesSeance, musclesTravailles } from '../js/calories.js';
import { bodyMapHTML, highlightMuscles, groupsFromMuscleNames } from '../js/body-map.js';
import { getPoidsActuel } from './profil.js';
import { navigate } from '../js/router.js';

// ── État global ───────────────────────────────────────────────────────

let _state      = null; // { seance, routineId, exercices: [{nom, type_metrique, repos_inter, lastPerf, sets:[...]}] }
let _section    = null;
let _onFinish   = null;
let _startTime  = null;
let _elapsedId  = null;
let _lastActiveExoIndex = null; // dernier exercice dont une série a été validée — sert à déterminer "en cours" / "prochain" pour la barre flottante

const _setTimers = new Map(); // timers actifs par série, clé `${ei}_${si}`

const _uid = () => Math.random().toString(36).slice(2, 10);
const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');

export function hasActiveSeance()   { return _state !== null; }
export function getActiveSeance()  { return _state?.seance ?? null; }
export function getElapsedSeconds() { return _startTime ? Math.floor((Date.now() - _startTime) / 1000) : 0; }

// ── Exercice en cours / suivant (pour la barre flottante) ───────────────
// Raisonne par bloc (exercice seul OU superset/triset entier), pas par
// exercice isolé : dans un superset, le repos n'intervient qu'après le
// dernier exercice du round — le "prochain" ne doit donc jamais être un
// exercice du même round déjà fait, mais soit le round suivant du même
// superset, soit le bloc suivant.

function _blockRoundsTotal(block) {
  return block.type === 'single'
    ? _state.exercices[block.index].sets.length
    : Math.max(...block.indices.map(i => _state.exercices[i].sets.length));
}

function _blockRoundDone(block, r) {
  return block.type === 'single'
    ? _state.exercices[block.index].sets[r]?.done === true
    : block.indices.every(i => _state.exercices[i].sets[r]?.done === true);
}

function _blockPendingRound(block) {
  const total = _blockRoundsTotal(block);
  for (let r = 0; r < total; r++) if (!_blockRoundDone(block, r)) return r;
  return -1;
}

function _blockLabel(block) {
  return block.type === 'single'
    ? _state.exercices[block.index].nom
    : block.indices.map(i => _state.exercices[i].nom).join(' + ');
}

function _findBlockContaining(blocks, exoIndex) {
  return blocks.findIndex(b => b.type === 'single' ? b.index === exoIndex : b.indices.includes(exoIndex));
}

function _firstPendingBlockIndex(blocks, fromBlockIdx) {
  for (let i = fromBlockIdx; i < blocks.length; i++) {
    if (_blockPendingRound(blocks[i]) !== -1) return i;
  }
  return -1;
}

function _activeBlockIndex(blocks) {
  let idx = _lastActiveExoIndex != null ? _findBlockContaining(blocks, _lastActiveExoIndex) : -1;
  if (idx === -1) idx = _firstPendingBlockIndex(blocks, 0);
  return idx;
}

// Bloc (exercice ou superset) actuellement travaillé : celui du dernier
// round validé, sinon le premier qui a encore des séries à faire.
export function getCurrentExerciceNom() {
  if (!_state?.exercices?.length) return null;
  const blocks = _buildBlocks(_state.exercices);
  if (!blocks.length) return null;
  const idx = _activeBlockIndex(blocks);
  return _blockLabel(blocks[idx === -1 ? 0 : idx]);
}

// Pendant le repos : même bloc s'il reste des rounds (ex: round 2 d'un
// superset), sinon le prochain bloc qui a encore des séries en attente.
export function getNextExerciceNom() {
  if (!_state?.exercices?.length) return null;
  const blocks = _buildBlocks(_state.exercices);
  if (!blocks.length) return null;
  const idx = _activeBlockIndex(blocks);
  if (idx === -1) return null;
  const block = blocks[idx];
  if (_blockPendingRound(block) !== -1) return _blockLabel(block);
  const nextIdx = _firstPendingBlockIndex(blocks, idx + 1);
  return nextIdx !== -1 ? _blockLabel(blocks[nextIdx]) : null;
}

export function requestFinishSeance() {
  if (!_state) return;
  _confirmFinish();
}

// ── Démarrer ──────────────────────────────────────────────────────────

export async function startSeance(nom, section, onFinish) {
  const { data, error } = await supabase
    .from('seances')
    .insert({ user_id: currentUser.id, nom, date: new Date().toISOString().split('T')[0] })
    .select().single();

  if (error) throw error;

  _state     = { seance: data, routineId: null, exercices: [] };
  _section   = section;
  _onFinish  = onFinish;
  _startTime = Date.now();
  _lastActiveExoIndex = null;

  render();
  _elapsedId = setInterval(_tickElapsed, 1000);
  showToast(`Séance "${nom}" démarrée`, 'success');
}

export function resumeActiveView(section) {
  _section = section;
  render();
  if (!_elapsedId) _elapsedId = setInterval(_tickElapsed, 1000);
}

function _tickElapsed() {
  const el = document.getElementById('session-elapsed');
  if (el) el.textContent = formatTime(getElapsedSeconds());
}

function _elapsedMinutes() { return Math.max(1, Math.round((Date.now() - _startTime) / 60000)); }

// ── Regroupement en blocs single / superset ────────────────────────────
// Un superset chaîne N exercices consécutifs (repos_inter === null sur
// chacun sauf le dernier du groupe) — même convention que routine-builder
// et l'ancienne page seance.js.

function _buildBlocks(exercices) {
  const blocks = []; let i = 0;
  while (i < exercices.length) {
    if (exercices[i].repos_inter === null && i + 1 < exercices.length) {
      const indices = [i];
      let j = i;
      while (exercices[j].repos_inter === null && j + 1 < exercices.length) {
        indices.push(j + 1);
        j++;
      }
      blocks.push({ type: 'superset', indices });
      i = j + 1;
    } else {
      blocks.push({ type: 'single', index: i });
      i++;
    }
  }
  return blocks;
}

function _colWidths(fields) {
  return fields.map((_, i) => (i === 0 ? 72 : 60));
}

// ── Rendu principal ───────────────────────────────────────────────────

function render() {
  _clearAllTimers();
  if (!_section || !_state) return;

  const exoCount = _state.exercices.length;
  const setsDone = _state.exercices.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0);
  const blocks   = _buildBlocks(_state.exercices);

  _section.innerHTML = `
    <div class="session-bar">
      <div class="session-info">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="session-clock"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span class="session-elapsed" id="session-elapsed">${formatTime(getElapsedSeconds())}</span>
        <span class="session-sep">•</span>
        <span id="session-stats">${_statsLabel(exoCount, setsDone)}</span>
      </div>
      <button class="btn btn-success btn-sm" id="btn-finish-seance">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="20 6 9 17 4 12"/></svg>
        Terminer
      </button>
    </div>

    <h2 class="seance-active-title">${_state.seance.nom}</h2>

    <div id="exo-cards-list">
      ${blocks.map((b, bi) =>
        (b.type === 'single'
          ? _singleCardHTML(_state.exercices[b.index], b.index, bi, blocks.length)
          : _supersetCardHTML(b.indices, bi, blocks.length))
        + (bi < blocks.length - 1 ? _interBlockSepHTML(b) : '')
      ).join('')}
    </div>

    <button class="btn-add-exo" id="btn-add-exo">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:18px;height:18px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Ajouter un exercice
    </button>`;

  _bindEvents();
}

function _statsLabel(exoCount, setsDone) {
  const e = exoCount === 0 ? 'Aucun exercice' : `${exoCount} exercice${exoCount > 1 ? 's' : ''}`;
  const s = setsDone > 0 ? ` • ${setsDone} série${setsDone > 1 ? 's' : ''}` : '';
  return e + s;
}

// ── HTML carte exercice simple ─────────────────────────────────────────

const _SVG_UP   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>`;
const _SVG_DOWN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const _SVG_DEL  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const _SVG_TIMER= `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const _SVG_STOP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;

function _singleCardHTML(exo, ei, blockIdx, totalBlocks) {
  const fields   = metricFields(exo.type_metrique);
  const showPrev = (exo.type_metrique || DEFAULT_METRIC_TYPE) === 'kg_reps';
  const hasDuree = fields.some(f => f.key === 'duree');
  const widths   = _colWidths(fields);
  const isFirst  = blockIdx === 0;
  const isLast   = blockIdx === totalBlocks - 1;

  return `
    <div class="exercise-card" data-exo-index="${ei}">
      <div class="exercise-card-header">
        <div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0">
          <button class="icon-btn" data-action="move-block" data-exo="${ei}" data-dir="-1"
            style="width:22px;height:22px${isFirst ? ';opacity:.25;pointer-events:none' : ''}">
            ${_SVG_UP}
          </button>
          <button class="icon-btn" data-action="move-block" data-exo="${ei}" data-dir="1"
            style="width:22px;height:22px${isLast ? ';opacity:.25;pointer-events:none' : ''}">
            ${_SVG_DOWN}
          </button>
        </div>
        <div class="exercise-card-info">
          <h3 class="exercise-card-name" style="cursor:pointer" data-action="show-exo-detail" data-exo="${ei}">${_esc(exo.nom)}</h3>
          ${exo.lastPerf ? `<p class="exercise-card-hint">Dernière fois : ${_esc(exo.lastPerf)}</p>` : ''}
        </div>
        <button class="icon-btn" data-action="replace-exo" data-exo="${ei}" aria-label="Remplacer l'exercice">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
            <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          </svg>
        </button>
        <button class="icon-btn" data-action="remove-exo" data-exo="${ei}" aria-label="Supprimer">
          ${_SVG_DEL}
        </button>
      </div>

      <div class="sets-header-row">
        <span style="width:20px;flex-shrink:0"></span>
        <span class="col-num">#</span>
        <span class="col-prev">${showPrev ? 'Précédent' : ''}</span>
        ${fields.map((f, i) => `<span class="col-field" style="width:${widths[i]}px">${f.header}</span>`).join('')}
        ${hasDuree ? `<span style="width:28px;flex-shrink:0"></span>` : ''}
        <span class="col-done"></span>
        <span style="width:22px;flex-shrink:0"></span>
      </div>

      <div class="sets-list" data-exo-sets="${ei}">
        ${exo.sets.map((s, si) => _setRowHTML(exo, s, ei, si)).join('')}
      </div>

      <button class="btn-add-serie" data-action="add-serie" data-exo="${ei}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:13px;height:13px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Ajouter une série
      </button>
    </div>`;
}

function _setRowHTML(exo, set, ei, si) {
  const done     = set.done;
  const fields   = metricFields(exo.type_metrique);
  const showPrev = (exo.type_metrique || DEFAULT_METRIC_TYPE) === 'kg_reps';
  const hasDuree = fields.some(f => f.key === 'duree');
  const widths   = _colWidths(fields);
  const isFirst  = si === 0;
  const isLast   = si === exo.sets.length - 1;
  const prev = done
    ? (showPrev && set.poids != null ? `${set.poids} × ${set.reps ?? '?'}` : '')
    : (showPrev ? (exo.lastPerf ?? '—') : '');

  return `
    <div class="set-row ${done ? 'set-done' : ''}" data-exo="${ei}" data-set="${si}">
      <div style="display:flex;flex-direction:column;gap:0;flex-shrink:0">
        <button class="icon-btn" data-action="move-serie" data-exo="${ei}" data-set="${si}" data-dir="-1"
          style="width:18px;height:18px;padding:0;color:var(--text-muted)${isFirst ? ';opacity:.2;pointer-events:none' : ''}">
          ${_SVG_UP}
        </button>
        <button class="icon-btn" data-action="move-serie" data-exo="${ei}" data-set="${si}" data-dir="1"
          style="width:18px;height:18px;padding:0;color:var(--text-muted)${isLast ? ';opacity:.2;pointer-events:none' : ''}">
          ${_SVG_DOWN}
        </button>
      </div>
      <div class="set-num ${done ? 'set-num-done' : ''}">${si + 1}</div>
      <div class="set-prev" id="setprev-${ei}-${si}">${_esc(prev)}</div>
      ${fields.map((f, i) => `
        <input class="set-input${done ? ' set-input-done' : ''}" type="number" inputmode="${f.type === 'int' ? 'numeric' : 'decimal'}" step="${f.step}" min="0"
          placeholder="0" value="${set[f.key] ?? ''}" style="width:${widths[i]}px"
          data-field="${f.key}" data-exo="${ei}" data-set="${si}">`).join('')}
      ${hasDuree ? `
        <button class="icon-btn" data-action="toggle-timer" data-exo="${ei}" data-set="${si}"
          id="tmrbtn-${ei}-${si}" style="width:28px;height:28px;flex-shrink:0;color:var(--text-muted)">
          ${_SVG_TIMER}
        </button>` : ''}
      <button class="set-check ${done ? 'set-check-done' : ''}"
        data-action="toggle-done" data-exo="${ei}" data-set="${si}"
        aria-label="Valider la série">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button class="icon-btn" data-action="remove-serie" data-exo="${ei}" data-set="${si}"
        style="width:22px;height:22px;flex-shrink:0;color:var(--text-muted)">
        ${_SVG_DEL}
      </button>
    </div>`;
}

// ── HTML séparateur inter-blocs ─────────────────────────────────────────

function _interBlockSepHTML(block) {
  const lastIdx = block.type === 'single' ? block.index : block.indices.at(-1);
  return `
    <div style="display:flex;align-items:center;gap:8px;margin:4px 0 8px;padding:0 4px">
      <div style="flex:1;height:1px;background:var(--border)"></div>
      <button class="chip" data-action="make-superset" data-exo="${lastIdx}"
        style="font-size:11px;font-weight:700;padding:3px 10px;border-color:var(--color-primary);color:var(--color-primary)">
        ⚡ Superset
      </button>
      <div style="flex:1;height:1px;background:var(--border)"></div>
    </div>`;
}

// ── HTML carte superset ─────────────────────────────────────────────────

function _supersetCardHTML(indices, blockIdx, totalBlocks) {
  const exos      = indices.map(i => _state.exercices[i]);
  const rounds    = Math.max(...exos.map(ex => ex.sets.length));
  const sameType  = exos.every(ex => ex.type_metrique === exos[0].type_metrique);
  const nCols     = Math.max(...exos.map(ex => metricFields(ex.type_metrique).length));
  const widths    = Array.from({ length: nCols }, (_, i) => (i === 0 ? 72 : 60));
  const hasDuree  = exos.some(ex => metricFields(ex.type_metrique).some(f => f.key === 'duree'));
  const isFirst   = blockIdx === 0;
  const isLast    = blockIdx === totalBlocks - 1;

  return `
    <div class="exercise-card" data-superset="${indices.join(',')}">
      <div class="exercise-card-header">
        <div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0">
          <button class="icon-btn" data-action="move-block" data-exo="${indices[0]}" data-dir="-1"
            style="width:22px;height:22px${isFirst ? ';opacity:.25;pointer-events:none' : ''}">
            ${_SVG_UP}
          </button>
          <button class="icon-btn" data-action="move-block" data-exo="${indices[0]}" data-dir="1"
            style="width:22px;height:22px${isLast ? ';opacity:.25;pointer-events:none' : ''}">
            ${_SVG_DOWN}
          </button>
        </div>
        <div class="exercise-card-info">
          <h3 class="exercise-card-name">⚡ Superset</h3>
          <div class="exercise-card-hint" style="display:flex;flex-wrap:wrap;align-items:center;gap:4px">
            ${exos.map((e, idx) => `
              <span style="display:inline-flex;align-items:center;gap:2px">
                ${idx > 0 ? '<span>+</span>' : ''}
                <button data-action="show-exo-detail" data-exo="${indices[idx]}"
                  style="background:none;border:none;padding:0;cursor:pointer;font-size:inherit;color:inherit;font-weight:600">${_esc(e.nom)}</button>
                <button class="icon-btn" data-action="replace-exo" data-exo="${indices[idx]}"
                  aria-label="Remplacer l'exercice" style="width:18px;height:18px;padding:0;color:var(--text-muted)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px">
                    <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                    <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                  </svg>
                </button>
              </span>`).join('')}
          </div>
        </div>
        <button class="chip" data-action="break-superset" data-exo="${indices[0]}"
          style="font-size:11px;padding:2px 8px;background:transparent;border-color:var(--border);color:var(--text-muted);flex-shrink:0">
          Retirer
        </button>
      </div>

      <div class="sets-header-row">
        <span style="width:20px;flex-shrink:0"></span>
        <span class="col-num">#</span>
        <span class="col-prev">Exercice</span>
        ${sameType
          ? metricFields(exos[0].type_metrique).map((f, i) => `<span class="col-field" style="width:${widths[i]}px">${f.header}</span>`).join('')
          : widths.map(w => `<span class="col-field" style="width:${w}px"></span>`).join('')}
        ${hasDuree ? `<span style="width:28px;flex-shrink:0"></span>` : ''}
        <span class="col-done"></span>
        <span style="width:22px;flex-shrink:0"></span>
      </div>

      <div class="sets-list">
        ${Array.from({ length: rounds }, (_, r) => _supersetRoundHTML(indices, exos, r, nCols, widths, hasDuree)).join('')}
      </div>

      <button class="btn-add-serie" data-action="add-serie" data-exo="${indices[0]}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:13px;height:13px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Ajouter un round
      </button>
    </div>`;
}

function _supersetRoundHTML(indices, exos, r, nCols, widths, blockHasDuree) {
  const maxSets     = Math.max(...exos.map(ex => ex.sets.length));
  const isFirstRound = r === 0;
  const isLastRound  = r === maxSets - 1;

  return exos.map((ex, idx) => {
    const ei         = indices[idx];
    const s          = ex.sets[r];
    if (!s) return '';
    const isFirstExo = idx === 0;
    const isLastExo  = idx === exos.length - 1;
    const fields     = metricFields(ex.type_metrique);
    const exHasDuree = fields.some(f => f.key === 'duree');

    const inputs = fields.map((f, i) => `
        <input class="set-input${s.done ? ' set-input-done' : ''}" type="number" inputmode="${f.type === 'int' ? 'numeric' : 'decimal'}" step="${f.step}" min="0"
          placeholder="0" value="${s[f.key] ?? ''}" style="width:${widths[i]}px"
          data-field="${f.key}" data-exo="${ei}" data-set="${r}">`).join('')
      + Array.from({ length: Math.max(0, nCols - fields.length) }, (_, i) =>
          `<span style="width:${widths[fields.length + i]}px;flex-shrink:0"></span>`).join('');

    return `
      <div class="set-row ${s.done ? 'set-done' : ''}" data-exo="${ei}" data-set="${r}">
        ${isFirstExo ? `
          <div style="display:flex;flex-direction:column;gap:0;flex-shrink:0">
            <button class="icon-btn" data-action="move-round" data-indices="${indices.join(',')}" data-round="${r}" data-dir="-1"
              style="width:18px;height:18px;padding:0;color:var(--text-muted)${isFirstRound ? ';opacity:.2;pointer-events:none' : ''}">
              ${_SVG_UP}
            </button>
            <button class="icon-btn" data-action="move-round" data-indices="${indices.join(',')}" data-round="${r}" data-dir="1"
              style="width:18px;height:18px;padding:0;color:var(--text-muted)${isLastRound ? ';opacity:.2;pointer-events:none' : ''}">
              ${_SVG_DOWN}
            </button>
          </div>` : `<span style="width:20px;flex-shrink:0"></span>`}
        <div class="set-num ${s.done ? 'set-num-done' : ''}">${r + 1}</div>
        <div class="set-prev" id="setprev-${ei}-${r}">${_esc(ex.nom)}</div>
        ${inputs}
        ${blockHasDuree
          ? (exHasDuree
            ? `<button class="icon-btn" data-action="toggle-timer" data-exo="${ei}" data-set="${r}"
                id="tmrbtn-${ei}-${r}" style="width:28px;height:28px;flex-shrink:0;color:var(--text-muted)">
                ${_SVG_TIMER}
              </button>`
            : `<span style="width:28px;flex-shrink:0"></span>`)
          : ''}
        ${isLastExo
          ? `<button class="set-check ${s.done ? 'set-check-done' : ''}" ${s.done ? 'disabled' : ''}
              data-action="toggle-round" data-indices="${indices.join(',')}" data-round="${r}"
              aria-label="Valider le round">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button class="icon-btn" data-action="remove-round" data-indices="${indices.join(',')}" data-round="${r}"
              style="width:22px;height:22px;flex-shrink:0;color:var(--text-muted)">
              ${_SVG_DEL}
            </button>`
          : `<span style="width:36px;flex-shrink:0"></span>
             <span style="width:22px;flex-shrink:0"></span>`}
      </div>`;
  }).join('');
}

// ── Binding événements ────────────────────────────────────────────────

function _bindEvents() {
  _section.querySelector('#btn-finish-seance')?.addEventListener('click', _confirmFinish);
  _section.querySelector('#btn-add-exo')?.addEventListener('click', () => openExercicePicker());

  const cardList = _section.querySelector('#exo-cards-list');
  cardList?.addEventListener('click',    _onCardClick);
  cardList?.addEventListener('input',    _onInputChange);
  cardList?.addEventListener('focusout', _onInputBlur);
}

async function _onCardClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, exo, set: setIdx, indices, round, dir } = btn.dataset;

  if (action === 'remove-exo')     await _removeExo(parseInt(exo));
  if (action === 'replace-exo')    await openExercicePicker(parseInt(exo));
  if (action === 'add-serie')      _addSerie(parseInt(exo));
  if (action === 'toggle-done')    await _toggleDone(parseInt(exo), parseInt(setIdx));
  if (action === 'toggle-round')   await _toggleRound(indices.split(',').map(Number), parseInt(round));
  if (action === 'move-block')     _moveBlock(parseInt(exo), parseInt(dir));
  if (action === 'move-serie')     _moveSerie(parseInt(exo), parseInt(setIdx), parseInt(dir));
  if (action === 'move-round')     _moveRound(indices.split(',').map(Number), parseInt(round), parseInt(dir));
  if (action === 'remove-serie')   await _removeSerie(parseInt(exo), parseInt(setIdx));
  if (action === 'remove-round')   await _removeRound(indices.split(',').map(Number), parseInt(round));
  if (action === 'toggle-timer')   _toggleTimer(parseInt(exo), parseInt(setIdx));
  if (action === 'make-superset')  _makeSuperset(parseInt(exo));
  if (action === 'break-superset') _breakSuperset(parseInt(exo));
  if (action === 'show-exo-detail') await _showExoDetail(parseInt(exo));
}

function _onInputChange(e) {
  const input = e.target.closest('[data-field]');
  if (!input) return;
  const { field, exo, set: setIdx } = input.dataset;
  const set = _state.exercices[parseInt(exo)]?.sets[parseInt(setIdx)];
  const f   = fieldByKey(field);
  if (!set || !f) return;
  set[field] = parseFieldValue(f, input.value);
}

// ── Actions ───────────────────────────────────────────────────────────

function _blankSet(fields, perf) {
  const set = { repos: null, done: false, dbId: null };
  fields.forEach(f => { set[f.key] = perf?.sets?.[0]?.[f.key] ?? null; });
  return set;
}

async function _lookupExerciceMeta(nom) {
  try {
    const { getAllExercices } = await import('./exercices.js');
    const EXERCICES = await getAllExercices();
    const exo = EXERCICES.find(e => e.nom === nom);
    return { type_metrique: exo?.type_metrique || DEFAULT_METRIC_TYPE, muscles: exo?.muscles ?? [] };
  } catch {
    return { type_metrique: DEFAULT_METRIC_TYPE, muscles: [] };
  }
}

export async function addExercice(nom, { superset = false } = {}) {
  const { type_metrique, muscles } = await _lookupExerciceMeta(nom);
  const fields = metricFields(type_metrique);
  const perf   = await _fetchLastPerf(nom, type_metrique);

  // Chaîne ce nouvel exercice avec le précédent : on retire le repos qui
  // les séparait pour les faire enchaîner sans pause, comme un superset
  // construit dans le constructeur de routine. Le superset se valide round
  // par round (tous les exercices du bloc en même temps) : il faut donc le
  // même nombre de séries que le précédent, sinon les rounds en trop n'ont
  // pas de case à cocher côté nouvel exercice et restent bloqués.
  const prev = _state.exercices.at(-1);
  if (superset && prev) prev.repos_inter = null;
  const nSets = (superset && prev) ? Math.max(prev.sets.length, 1) : 1;

  _state.exercices.push({
    nom, type_metrique, muscles, repos_inter: APP_CONFIG.defaultRestTime,
    lastPerf: perf?.summary ?? null,
    sets: Array.from({ length: nSets }, () => _blankSet(fields, perf)),
  });

  render();
  setTimeout(() => {
    const cards = _section.querySelectorAll('.exercise-card');
    cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

// Remplace un exercice par un autre en conservant sa place dans la séance
// (et son repos_inter, donc un éventuel chaînage en superset) — utile quand
// le matériel prévu est pris ou pour varier un mouvement à la dernière minute.
async function _replaceExercice(ei, nom) {
  const exo = _state.exercices[ei];
  if (!exo) return;

  const { type_metrique, muscles } = await _lookupExerciceMeta(nom);
  const fields = metricFields(type_metrique);
  const perf   = await _fetchLastPerf(nom, type_metrique);

  // Garde le même nombre de séries que l'exercice remplacé : s'il fait
  // partie d'un superset, ses séries servent de "rounds" partagés avec les
  // autres exercices du bloc — en retomber à une seule série romprait
  // l'alignement et bloquerait la validation des rounds suivants.
  const nSets = Math.max(exo.sets.length, 1);

  _state.exercices[ei] = {
    nom, type_metrique, muscles, repos_inter: exo.repos_inter,
    lastPerf: perf?.summary ?? null,
    sets: Array.from({ length: nSets }, () => _blankSet(fields, perf)),
  };

  render();
  showToast(`Remplacé par "${nom}"`, 'success');
}

export async function addExercices(noms) {
  if (!noms?.length) return;
  const metas = await Promise.all(noms.map(_lookupExerciceMeta));
  const perfs = await Promise.all(noms.map((n, i) => _fetchLastPerf(n, metas[i].type_metrique)));

  noms.forEach((nom, i) => {
    const { type_metrique, muscles } = metas[i];
    const fields = metricFields(type_metrique);
    _state.exercices.push({
      nom, type_metrique, muscles, repos_inter: APP_CONFIG.defaultRestTime,
      lastPerf: perfs[i]?.summary ?? null,
      sets: [_blankSet(fields, perfs[i])],
    });
  });

  render();
}

// Lance les exercices d'une routine en reprenant sa configuration complète
// (métrique, supersets, séries planifiées) plutôt que l'historique seul —
// la routine fait ensuite office de plan, mis à jour en fin de séance
// pour refléter ce qui a été réellement soulevé (voir _syncRoutineProgress).
export async function addExercicesFromRoutine(routine) {
  _state.routineId = routine?.id ?? null;
  const exercices = routine?.exercices ?? [];
  _state.routineExerciceNoms = exercices.map(ex => ex.nom);
  if (!exercices.length) return;

  const [perfs, metas] = await Promise.all([
    Promise.all(exercices.map(ex => _fetchLastPerf(ex.nom, ex.type_metrique))),
    Promise.all(exercices.map(ex => _lookupExerciceMeta(ex.nom))),
  ]);

  exercices.forEach((ex, i) => {
    const type_metrique = ex.type_metrique || DEFAULT_METRIC_TYPE;
    const fields = metricFields(type_metrique);
    const plannedSeries = ex.series?.length ? ex.series : null;

    const sets = plannedSeries
      ? plannedSeries.map(s => {
          const set = { repos: s.repos ?? null, done: false, dbId: null };
          fields.forEach(f => { set[f.key] = s[f.key] ?? null; });
          return set;
        })
      : [_blankSet(fields, perfs[i])];

    _state.exercices.push({
      nom: ex.nom, type_metrique, muscles: metas[i].muscles, repos_inter: ex.repos_inter,
      lastPerf: perfs[i]?.summary ?? null,
      sets,
    });
  });

  render();
}

async function _removeExo(ei) {
  if (!await confirmDialog(`Supprimer "${_state.exercices[ei]?.nom}" de la séance ?`)) return;
  _state.exercices.splice(ei, 1);
  render();
}

function _addSerie(ei) {
  const blocks = _buildBlocks(_state.exercices);
  const block  = blocks[_findBlockContaining(blocks, ei)];

  if (block.type === 'superset') {
    block.indices.forEach(idx => {
      const exo    = _state.exercices[idx];
      const fields = metricFields(exo.type_metrique);
      const newSet = { repos: null, done: false, dbId: null };
      fields.forEach(f => { newSet[f.key] = exo.sets.at(-1)?.[f.key] ?? null; });
      exo.sets.push(newSet);
    });
  } else {
    const exo    = _state.exercices[ei];
    const fields = metricFields(exo.type_metrique);
    const newSet = { repos: null, done: false, dbId: null };
    fields.forEach(f => { newSet[f.key] = exo.sets.at(-1)?.[f.key] ?? null; });
    exo.sets.push(newSet);
  }

  render();
  setTimeout(() => {
    const cards = _section.querySelectorAll('.exercise-card');
    const blockIdx = _findBlockContaining(_buildBlocks(_state.exercices), ei);
    cards[blockIdx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 60);
}

// ── Déplacer un bloc d'exercice ───────────────────────────────────────

function _moveBlock(ei, dir) {
  const blocks = _buildBlocks(_state.exercices);
  const blockIdx = _findBlockContaining(blocks, ei);
  const newIdx   = blockIdx + dir;
  if (newIdx < 0 || newIdx >= blocks.length) return;

  const groups = blocks.map(b =>
    b.type === 'single' ? [_state.exercices[b.index]] : b.indices.map(i => _state.exercices[i])
  );
  [groups[blockIdx], groups[newIdx]] = [groups[newIdx], groups[blockIdx]];
  _state.exercices = groups.flat();
  render();
}

// ── Déplacer une série ────────────────────────────────────────────────

function _moveSerie(ei, si, dir) {
  const sets = _state.exercices[ei]?.sets;
  if (!sets) return;
  const newSi = si + dir;
  if (newSi < 0 || newSi >= sets.length) return;
  [sets[si], sets[newSi]] = [sets[newSi], sets[si]];
  render();
}

function _moveRound(indices, r, dir) {
  const newR    = r + dir;
  const maxSets = Math.max(...indices.map(i => _state.exercices[i].sets.length));
  if (newR < 0 || newR >= maxSets) return;
  indices.forEach(idx => {
    const sets = _state.exercices[idx].sets;
    if (r < sets.length && newR < sets.length) [sets[r], sets[newR]] = [sets[newR], sets[r]];
  });
  render();
}

// ── Supprimer une série ────────────────────────────────────────────────

async function _removeSerie(ei, si) {
  const exo = _state.exercices[ei];
  if (!exo) return;
  if (exo.sets.length <= 1) { showToast('Minimum 1 série', 'warning'); return; }
  const set = exo.sets[si];
  if (set?.dbId) await supabase.from('series').delete().eq('id', set.dbId).catch(() => {});
  exo.sets.splice(si, 1);
  render();
}

async function _removeRound(indices, r) {
  const maxSets = Math.max(...indices.map(i => _state.exercices[i].sets.length));
  if (maxSets <= 1) { showToast('Minimum 1 série', 'warning'); return; }
  for (const idx of indices) {
    const s = _state.exercices[idx].sets[r];
    if (s?.dbId) await supabase.from('series').delete().eq('id', s.dbId).catch(() => {});
  }
  indices.forEach(idx => _state.exercices[idx].sets.splice(r, 1));
  render();
}

// ── Édition valeur série validée (enregistre en DB au blur) ──────────

async function _onInputBlur(e) {
  const input = e.target.closest('[data-field]');
  if (!input) return;
  const { field, exo: exoStr, set: setStr } = input.dataset;
  const set = _state.exercices[parseInt(exoStr)]?.sets[parseInt(setStr)];
  const f   = fieldByKey(field);
  if (!set || !f || !set.done || !set.dbId) return;
  set[field] = parseFieldValue(f, input.value);
  const col = FIELD_DB_COLUMN[field];
  if (col) await supabase.from('series').update({ [col]: set[field] }).eq('id', set.dbId).catch(() => {});
}

// ── Chrono séries avec durée cible ────────────────────────────────────

function _clearAllTimers() {
  _setTimers.forEach(id => clearInterval(id));
  _setTimers.clear();
}

function _toggleTimer(ei, si) {
  const key = `${ei}_${si}`;
  const row = _section?.querySelector(`.set-row[data-exo="${ei}"][data-set="${si}"]`);

  if (_setTimers.has(key)) {
    clearInterval(_setTimers.get(key));
    _setTimers.delete(key);
    const btn  = document.getElementById(`tmrbtn-${ei}-${si}`);
    const prev = document.getElementById(`setprev-${ei}-${si}`);
    if (btn)  btn.innerHTML = _SVG_TIMER;
    if (prev) { prev.textContent = ''; prev.className = 'set-prev'; }
    row?.classList.remove('set-timer-active');
    return;
  }

  const input     = _section?.querySelector(`input[data-field="duree"][data-exo="${ei}"][data-set="${si}"]`);
  const targetSec = parseInt(input?.value) || 0;
  const startMs   = Date.now();

  const btn = document.getElementById(`tmrbtn-${ei}-${si}`);
  if (btn) btn.innerHTML = _SVG_STOP;
  row?.classList.add('set-timer-active');

  const prevEl = document.getElementById(`setprev-${ei}-${si}`);
  if (prevEl) prevEl.className = 'set-prev set-timer-countdown';

  function _fmt(secs) {
    const m = Math.floor(secs / 60), s = secs % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  }

  const id = setInterval(() => {
    const elapsed   = Date.now() - startMs;
    const remaining = Math.max(0, targetSec * 1000 - elapsed);
    const btn2  = document.getElementById(`tmrbtn-${ei}-${si}`);
    const prev2 = document.getElementById(`setprev-${ei}-${si}`);
    const row2  = _section?.querySelector(`.set-row[data-exo="${ei}"][data-set="${si}"]`);
    if (!prev2 || !prev2.isConnected) { clearInterval(id); _setTimers.delete(key); return; }

    if (targetSec > 0) {
      prev2.textContent = _fmt(Math.ceil(remaining / 1000));
      if (remaining === 0) {
        clearInterval(id);
        _setTimers.delete(key);
        if (btn2) btn2.innerHTML = _SVG_TIMER;
        prev2.textContent = '✓ Terminé !';
        prev2.className   = 'set-prev set-timer-done';
        row2?.classList.remove('set-timer-active');
        row2?.classList.add('set-timer-finished');
        setTimeout(() => row2?.classList.remove('set-timer-finished'), 2000);
        navigator.vibrate?.(300);
      }
    } else {
      prev2.textContent = _fmt(Math.floor(elapsed / 1000));
    }
  }, 200);

  _setTimers.set(key, id);
}

// ── Superset en séance ─────────────────────────────────────────────────

function _makeSuperset(lastIdx) {
  const exo  = _state.exercices[lastIdx];
  const next = _state.exercices[lastIdx + 1];
  if (!exo || !next) return;

  exo.repos_inter = null;

  const maxSets = Math.max(exo.sets.length, next.sets.length);
  while (exo.sets.length < maxSets) {
    const fields = metricFields(exo.type_metrique);
    const s = { repos: null, done: false, dbId: null };
    fields.forEach(f => { s[f.key] = exo.sets.at(-1)?.[f.key] ?? null; });
    exo.sets.push(s);
  }
  while (next.sets.length < maxSets) {
    const fields = metricFields(next.type_metrique);
    const s = { repos: null, done: false, dbId: null };
    fields.forEach(f => { s[f.key] = next.sets.at(-1)?.[f.key] ?? null; });
    next.sets.push(s);
  }
  render();
}

function _breakSuperset(firstIdx) {
  const blocks = _buildBlocks(_state.exercices);
  const block  = blocks[_findBlockContaining(blocks, firstIdx)];
  if (block.type !== 'superset') return;
  block.indices.forEach(idx => {
    if (_state.exercices[idx].repos_inter === null)
      _state.exercices[idx].repos_inter = APP_CONFIG.defaultRestTime;
  });
  render();
}

// ── Popup détail exercice ──────────────────────────────────────────────

async function _showExoDetail(ei) {
  const nom = _state.exercices[ei]?.nom;
  if (!nom) return;
  const { getAllExercices, openExoDetail } = await import('./exercices.js');
  const EXERCICES = await getAllExercices();
  const exo = EXERCICES.find(e => e.nom === nom);
  if (exo) openExoDetail(exo);
}

async function _toggleDone(ei, si) {
  const exo = _state.exercices[ei];
  const set = exo?.sets[si];
  if (!set) return;

  const fields = metricFields(exo.type_metrique);
  fields.forEach(f => {
    const el = _section.querySelector(`input[data-field="${f.key}"][data-exo="${ei}"][data-set="${si}"]`);
    if (el) set[f.key] = parseFieldValue(f, el.value);
  });

  if (!set.done) {
    set.done  = true;
    // La dernière série d'un exercice est suivie du repos prévu avant
    // l'exercice suivant (repos_inter), pas du repos entre séries de ce
    // même exercice.
    const isLastSet = si === exo.sets.length - 1;
    set.repos = (isLastSet && exo.repos_inter != null) ? exo.repos_inter : (set.repos ?? APP_CONFIG.defaultRestTime);
    _lastActiveExoIndex = ei;

    const row = {
      user_id:       currentUser.id,
      seance_id:     _state.seance.id,
      exercice_nom:  exo.nom,
      numero_serie:  si + 1,
      temps_repos_s: set.repos,
    };
    fields.forEach(f => { row[FIELD_DB_COLUMN[f.key]] = set[f.key] ?? null; });

    try {
      const { data } = await supabase.from('series').insert(row).select().single();
      if (data) set.dbId = data.id;
    } catch {
      set.done = false;
      showToast('Erreur de sauvegarde', 'error');
      return;
    }

    startRestTimer(set.repos);
  } else {
    set.done = false;
    if (set.dbId) {
      await supabase.from('series').delete().eq('id', set.dbId).catch(() => {});
      set.dbId = null;
    }
  }

  render();
}

// Valide un round entier de superset (tous les exercices du groupe en une
// fois, comme on les enchaîne réellement sans repos entre eux).
async function _toggleRound(indices, r) {
  _lastActiveExoIndex = indices.at(-1);
  const totalRounds = Math.max(...indices.map(i => _state.exercices[i].sets.length));
  const isLastRound  = r === totalRounds - 1;

  for (const ei of indices) {
    const exo = _state.exercices[ei];
    const set = exo?.sets[r];
    if (!set) continue;
    metricFields(exo.type_metrique).forEach(f => {
      const el = _section.querySelector(`input[data-field="${f.key}"][data-exo="${ei}"][data-set="${r}"]`);
      if (el) set[f.key] = parseFieldValue(f, el.value);
    });
  }

  for (const ei of indices) {
    const exo = _state.exercices[ei];
    const set = exo?.sets[r];
    if (!set || set.done) continue;

    set.done  = true;
    // Comme pour un exercice seul : le dernier round du superset est suivi
    // du repos prévu avant le bloc suivant (repos_inter du dernier exercice
    // du superset), pas du repos habituel entre deux rounds.
    const useReposInter = isLastRound && ei === indices.at(-1) && exo.repos_inter != null;
    set.repos = useReposInter ? exo.repos_inter : (set.repos ?? APP_CONFIG.defaultRestTime);

    const fields = metricFields(exo.type_metrique);
    const row = {
      user_id:       currentUser.id,
      seance_id:     _state.seance.id,
      exercice_nom:  exo.nom,
      numero_serie:  r + 1,
      temps_repos_s: set.repos,
    };
    fields.forEach(f => { row[FIELD_DB_COLUMN[f.key]] = set[f.key] ?? null; });

    try {
      const { data } = await supabase.from('series').insert(row).select().single();
      if (data) set.dbId = data.id;
    } catch {
      set.done = false;
      showToast('Erreur de sauvegarde', 'error');
    }
  }

  const last = _state.exercices[indices.at(-1)];
  startRestTimer(last?.sets[r]?.repos ?? APP_CONFIG.defaultRestTime);

  render();
}

// ── Dernière perf ─────────────────────────────────────────────────────

async function _fetchLastPerf(nom, type_metrique = DEFAULT_METRIC_TYPE) {
  const fields = metricFields(type_metrique);
  const cols   = fields.map(f => FIELD_DB_COLUMN[f.key]);

  try {
    const { data } = await supabase
      .from('series')
      .select(cols.join(', '))
      .eq('user_id', currentUser.id)
      .eq('exercice_nom', nom)
      .order('created_at', { ascending: false })
      .limit(4);

    if (!data?.length) return null;

    const sets = data.map(row => {
      const out = {};
      fields.forEach(f => { out[f.key] = row[FIELD_DB_COLUMN[f.key]] ?? null; });
      return out;
    });

    const best = sets[0];
    const summary = (fields.length === 2 && fields[0].key === 'poids' && fields[1].key === 'reps')
      ? `${best.poids ?? '?'} kg × ${best.reps ?? '?'}`
      : fields.map(f => `${best[f.key] ?? '?'}${f.short}`).join(' · ');

    return { summary, sets };
  } catch {
    return null;
  }
}

// ── Picker d'exercice ─────────────────────────────────────────────────

export async function openExercicePicker(replaceEi = null) {
  const { getAllExercices } = await import('./exercices.js');
  const EXERCICES = await getAllExercices();
  const GROUPES = ['Tous', ...new Set(EXERCICES.map(e => e.groupe))];
  const lastExoNom = replaceEi == null ? (_state.exercices.at(-1)?.nom ?? null) : null;

  let search      = '';
  let groupe      = 'Tous';
  let supersetOn  = false;

  const rerender = () => {
    const filtered = EXERCICES.filter(e => {
      const g = groupe === 'Tous' || e.groupe === groupe;
      const s = !search || e.nom.toLowerCase().includes(search) || e.groupe.toLowerCase().includes(search);
      return g && s;
    });
    const list = document.getElementById('picker-list');
    if (!list) return;

    list.innerHTML = filtered.length === 0
      ? `<p class="picker-empty">Aucun exercice trouvé</p>`
      : filtered.map(e => `
          <button class="picker-exo-btn" data-nom="${e.nom}">
            <div class="item-body">
              <p class="item-title">${e.nom}</p>
              <p class="item-subtitle">${e.groupe} • ${e.materiel}</p>
            </div>
            <span class="item-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg></span>
          </button>`).join('');

    list.querySelectorAll('.picker-exo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        closeModal();
        if (replaceEi != null) _replaceExercice(replaceEi, btn.dataset.nom);
        else addExercice(btn.dataset.nom, { superset: supersetOn });
      });
    });
  };

  openModal({
    title: replaceEi != null ? 'Remplacer l\'exercice' : 'Choisir un exercice',
    body: `
      <div class="picker-wrapper">
        ${lastExoNom ? `
        <button class="chip" id="picker-superset-toggle" style="font-weight:700;align-self:flex-start">
          ⚡ Superset avec "${_esc(lastExoNom)}"
        </button>` : ''}
        <div class="search-bar" style="margin-bottom:0">
          <div class="search-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <input class="search-input" id="picker-search" placeholder="Rechercher un exercice…" type="search" autocomplete="off">
        </div>
        <div class="filter-chips" id="picker-chips" style="margin-bottom:0">
          ${GROUPES.map((g, i) => `<div class="chip ${i === 0 ? 'active' : ''}" data-groupe="${g}">${g}</div>`).join('')}
        </div>
        <div id="picker-list" class="picker-list"></div>
        <div id="picker-custom-wrap"></div>
      </div>`,
  });

  rerender();

  document.getElementById('picker-superset-toggle')?.addEventListener('click', () => {
    supersetOn = !supersetOn;
    document.getElementById('picker-superset-toggle')?.classList.toggle('active', supersetOn);
  });

  document.getElementById('picker-search')?.addEventListener('input', e => {
    search = e.target.value.toLowerCase().trim();
    rerender();
    const raw  = e.target.value.trim();
    const wrap = document.getElementById('picker-custom-wrap');
    if (wrap) {
      const exists = EXERCICES.some(ex => ex.nom.toLowerCase() === raw.toLowerCase());
      wrap.innerHTML = raw && !exists
        ? `<button class="btn btn-secondary btn-full" id="picker-custom">+ Créer "${_esc(raw)}"</button>`
        : '';
      document.getElementById('picker-custom')?.addEventListener('click', async () => {
        closeModal();
        const { openCreateExerciceModal } = await import('./exercices.js');
        openCreateExerciceModal(raw, (newExo) => {
          if (replaceEi != null) _replaceExercice(replaceEi, newExo.nom);
          else addExercice(newExo.nom, { superset: supersetOn });
        });
      });
    }
  });

  document.getElementById('picker-chips')?.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#picker-chips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    groupe = chip.dataset.groupe;
    rerender();
  });
}

// ── Terminer la séance ────────────────────────────────────────────────

async function _confirmFinish() {
  if (!_state) return;
  const totalSets = _state.exercices.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0);
  const duree     = _elapsedMinutes();

  if (!_state.exercices.length) {
    if (await confirmDialog('Aucun exercice enregistré. Annuler la séance ?', { confirmLabel: 'Annuler la séance' })) {
      await supabase.from('seances').delete().eq('id', _state.seance.id).catch(() => {});
      _reset();
    }
    return;
  }

  // Garde-fou supplémentaire avant d'ouvrir le récapitulatif détaillé — la
  // séance peut être terminée depuis n'importe où (bouton en haut de la
  // page, ou raccourci poubelle de la barre flottante), donc un tap
  // accidentel ne doit jamais suffire à elle seul.
  if (!await confirmDialog('Voulez-vous vraiment terminer cette séance ?', { confirmLabel: 'Terminer', danger: false })) return;

  const doneNoms = new Set(_state.exercices.filter(e => e.sets.some(s => s.done)).map(e => e.nom));
  const missingFromRoutine = (_state.routineExerciceNoms ?? []).filter(nom => !doneNoms.has(nom));

  const poidsKg  = await getPoidsActuel();
  const calories = estimateCaloriesSeance(_state.exercices, duree, poidsKg);
  const muscles  = musclesTravailles(_state.exercices);

  openModal({
    title: 'Terminer la séance ?',
    body: `
      <div class="seance-finish-summary">
        <div class="grid-3">
          <div class="card" style="text-align:center">
            <p class="card-label">Durée</p>
            <p class="card-value" style="font-size:var(--font-size-2xl)">${duree}<span class="card-unit"> min</span></p>
          </div>
          <div class="card" style="text-align:center">
            <p class="card-label">Séries</p>
            <p class="card-value" style="font-size:var(--font-size-2xl)">${totalSets}</p>
          </div>
          <div class="card" style="text-align:center">
            <p class="card-label">Calories</p>
            ${calories != null
              ? `<p class="card-value" style="font-size:var(--font-size-2xl)">${calories}<span class="card-unit"> kcal</span></p>`
              : `<p class="card-value" style="font-size:var(--font-size-sm);color:var(--text-muted)">—</p>`}
          </div>
        </div>
        ${calories == null ? `
          <p style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:var(--space-2);text-align:center">
            Renseignez votre poids dans votre <a href="#" id="link-profil-poids" style="color:var(--color-primary);font-weight:700">profil</a> pour estimer les calories.
          </p>` : ''}
        ${missingFromRoutine.length ? `
          <div style="margin-top:var(--space-3);padding:var(--space-3);background:var(--color-warning-light);border-radius:var(--radius-md)">
            <p style="font-size:var(--font-size-xs);font-weight:700;color:var(--color-warning)">⚠️ Exercices de la routine non réalisés</p>
            <p style="font-size:var(--font-size-xs);color:var(--text-secondary);margin-top:2px">${missingFromRoutine.map(_esc).join(', ')}</p>
          </div>` : ''}
        ${muscles.length ? `
          <div style="margin-top:var(--space-4)">
            <p class="form-label" style="margin-bottom:var(--space-2)">Muscles travaillés</p>
            ${bodyMapHTML('finish')}
            <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);justify-content:center;margin-top:var(--space-3)">
              ${muscles.map(m => `<span class="muscle-tag">${_esc(m)}</span>`).join('')}
            </div>
          </div>` : ''}
        <div class="form-group" style="margin-top:var(--space-4)">
          <label class="form-label">Notes de séance (facultatif)</label>
          <textarea class="form-input form-textarea" id="seance-notes-final" rows="3"
            placeholder="Comment s'est passée cette séance ?"></textarea>
        </div>
      </div>`,
    footer: `
      <button class="btn btn-secondary" id="btn-continue-seance">Continuer</button>
      <button class="btn btn-primary" id="btn-confirm-finish" style="flex:1">Enregistrer</button>`,
  });

  highlightMuscles(document.getElementById('modal-body'), groupsFromMuscleNames(muscles), 'finish');

  document.getElementById('btn-continue-seance')?.addEventListener('click', closeModal);
  document.getElementById('btn-confirm-finish')?.addEventListener('click', () => _doFinish(duree, calories, muscles));
  document.getElementById('link-profil-poids')?.addEventListener('click', e => {
    e.preventDefault(); closeModal(); navigate('profil');
  });
}

async function _doFinish(duree, calories, muscles) {
  closeModal();
  const notes = document.getElementById('seance-notes-final')?.value.trim() || null;
  try {
    await supabase.from('seances').update({
      duree_minutes: duree, notes,
      calories_estimees: calories,
      muscles_travailles: muscles.length ? muscles : null,
    }).eq('id', _state.seance.id);
    await _syncRoutineProgress();
    showToast(`Séance terminée — ${duree} min`, 'success', 4000);
  } catch {
    showToast('Erreur lors de la finalisation', 'error');
  }
  _reset();
}

// Met à jour les séries planifiées de la routine d'origine avec ce qui a
// réellement été soulevé, pour que le prochain lancement reflète la
// progression (ex: routine prévue à 12kg, mais 14kg réellement faits).
async function _syncRoutineProgress() {
  if (!_state.routineId) return;
  try {
    const { data: routine, error } = await supabase
      .from('routines').select('exercices').eq('id', _state.routineId).single();
    if (error || !routine) return;

    const exercices = (routine.exercices ?? []).map(ex => {
      const performed = _state.exercices.find(e => e.nom === ex.nom);
      if (!performed) return ex;

      const fields = metricFields(performed.type_metrique);
      const series = performed.sets.map((s, i) => {
        const base = ex.series?.[i] ?? { uid: _uid(), repos: 90, fait: false };
        const out  = { ...base };
        fields.forEach(f => { out[f.key] = s[f.key]; });
        return out;
      });

      return { ...ex, type_metrique: performed.type_metrique, repos_inter: performed.repos_inter, series };
    });

    await supabase.from('routines').update({ exercices }).eq('id', _state.routineId);
  } catch {
    // Synchronisation best-effort — ne doit jamais bloquer la fin de séance.
  }
}

function _reset() {
  clearInterval(_elapsedId);
  _elapsedId = null;
  hideTimer(); // une séance terminée/annulée ne doit pas laisser un repos en cours derrière elle
  const onFinish = _onFinish;
  _state = _section = _onFinish = _startTime = null;
  _lastActiveExoIndex = null;
  if (onFinish) onFinish();
}
