import { currentUser }               from '../js/auth.js';
import { supabase }                   from '../js/supabase.js';
import { showToast, formatTime, openModal, closeModal, confirmDialog } from '../js/utils.js';
import { startRestTimer }             from '../components/timer.js';
import { APP_CONFIG }                 from '../js/config.js';
import { metricFields, parseFieldValue, fieldByKey, FIELD_DB_COLUMN, DEFAULT_METRIC_TYPE } from '../js/metrics.js';

// ── État global ───────────────────────────────────────────────────────

let _state      = null; // { seance, routineId, exercices: [{nom, type_metrique, repos_inter, lastPerf, sets:[...]}] }
let _section    = null;
let _onFinish   = null;
let _startTime  = null;
let _elapsedId  = null;

const _uid = () => Math.random().toString(36).slice(2, 10);
const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');

export function hasActiveSeance()   { return _state !== null; }
export function getActiveSeance()  { return _state?.seance ?? null; }
export function getElapsedSeconds() { return _startTime ? Math.floor((Date.now() - _startTime) / 1000) : 0; }

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
      ${blocks.map(b => b.type === 'single' ? _singleCardHTML(_state.exercices[b.index], b.index) : _supersetCardHTML(b.indices)).join('')}
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

function _singleCardHTML(exo, ei) {
  const fields   = metricFields(exo.type_metrique);
  const showPrev = (exo.type_metrique || DEFAULT_METRIC_TYPE) === 'kg_reps';
  const widths   = _colWidths(fields);

  return `
    <div class="exercise-card" data-exo-index="${ei}">
      <div class="exercise-card-header">
        <div class="exercise-card-info">
          <h3 class="exercise-card-name">${_esc(exo.nom)}</h3>
          ${exo.lastPerf ? `<p class="exercise-card-hint">Dernière fois : ${_esc(exo.lastPerf)}</p>` : ''}
        </div>
        <button class="icon-btn" data-action="remove-exo" data-exo="${ei}" aria-label="Supprimer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="sets-header-row">
        <span class="col-num">#</span>
        <span class="col-prev">${showPrev ? 'Précédent' : ''}</span>
        ${fields.map((f, i) => `<span class="col-field" style="width:${widths[i]}px">${f.header}</span>`).join('')}
        <span class="col-done"></span>
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
  const widths   = _colWidths(fields);
  const prev = done
    ? (showPrev && set.poids != null ? `${set.poids} × ${set.reps ?? '?'}` : '')
    : (showPrev ? (exo.lastPerf ?? '—') : '');

  return `
    <div class="set-row ${done ? 'set-done' : ''}" data-exo="${ei}" data-set="${si}">
      <div class="set-num ${done ? 'set-num-done' : ''}">${si + 1}</div>
      <div class="set-prev">${_esc(prev)}</div>
      ${fields.map((f, i) => `
        <input class="set-input" type="number" inputmode="${f.type === 'int' ? 'numeric' : 'decimal'}" step="${f.step}" min="0"
          placeholder="0" value="${set[f.key] ?? ''}" style="width:${widths[i]}px"
          data-field="${f.key}" data-exo="${ei}" data-set="${si}" ${done ? 'disabled' : ''}>`).join('')}
      <button class="set-check ${done ? 'set-check-done' : ''}"
        data-action="toggle-done" data-exo="${ei}" data-set="${si}"
        aria-label="Valider la série">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
    </div>`;
}

// ── HTML carte superset ─────────────────────────────────────────────────

function _supersetCardHTML(indices) {
  const exos     = indices.map(i => _state.exercices[i]);
  const rounds   = Math.max(...exos.map(ex => ex.sets.length));
  const sameType = exos.every(ex => ex.type_metrique === exos[0].type_metrique);
  const nCols    = Math.max(...exos.map(ex => metricFields(ex.type_metrique).length));
  const widths   = Array.from({ length: nCols }, (_, i) => (i === 0 ? 72 : 60));

  return `
    <div class="exercise-card" data-superset="${indices.join(',')}">
      <div class="exercise-card-header">
        <div class="exercise-card-info">
          <h3 class="exercise-card-name">⚡ Superset</h3>
          <p class="exercise-card-hint">${exos.map(e => _esc(e.nom)).join(' + ')}</p>
        </div>
      </div>

      <div class="sets-header-row">
        <span class="col-num">#</span>
        <span class="col-prev">Exercice</span>
        ${sameType
          ? metricFields(exos[0].type_metrique).map((f, i) => `<span class="col-field" style="width:${widths[i]}px">${f.header}</span>`).join('')
          : widths.map(w => `<span class="col-field" style="width:${w}px"></span>`).join('')}
        <span class="col-done"></span>
      </div>

      <div class="sets-list">
        ${Array.from({ length: rounds }, (_, r) => _supersetRoundHTML(indices, exos, r, nCols, widths)).join('')}
      </div>
    </div>`;
}

function _supersetRoundHTML(indices, exos, r, nCols, widths) {
  return exos.map((ex, idx) => {
    const ei = indices[idx];
    const s  = ex.sets[r];
    if (!s) return '';
    const isLast  = idx === exos.length - 1;
    const fields  = metricFields(ex.type_metrique);

    const inputs = fields.map((f, i) => `
        <input class="set-input" type="number" inputmode="${f.type === 'int' ? 'numeric' : 'decimal'}" step="${f.step}" min="0"
          placeholder="0" value="${s[f.key] ?? ''}" style="width:${widths[i]}px"
          data-field="${f.key}" data-exo="${ei}" data-set="${r}" ${s.done ? 'disabled' : ''}>`).join('')
      + Array.from({ length: Math.max(0, nCols - fields.length) }, (_, i) =>
          `<span style="width:${widths[fields.length + i]}px;flex-shrink:0"></span>`).join('');

    return `
      <div class="set-row ${s.done ? 'set-done' : ''}" data-exo="${ei}" data-set="${r}">
        <div class="set-num ${s.done ? 'set-num-done' : ''}">${r + 1}</div>
        <div class="set-prev">${_esc(ex.nom)}</div>
        ${inputs}
        ${isLast
          ? `<button class="set-check ${s.done ? 'set-check-done' : ''}" ${s.done ? 'disabled' : ''}
              data-action="toggle-round" data-indices="${indices.join(',')}" data-round="${r}"
              aria-label="Valider le round">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </button>`
          : `<span style="width:36px;flex-shrink:0"></span>`}
      </div>`;
  }).join('');
}

// ── Binding événements ────────────────────────────────────────────────

function _bindEvents() {
  _section.querySelector('#btn-finish-seance')?.addEventListener('click', _confirmFinish);
  _section.querySelector('#btn-add-exo')?.addEventListener('click', openExercicePicker);

  const cardList = _section.querySelector('#exo-cards-list');
  cardList?.addEventListener('click',  _onCardClick);
  cardList?.addEventListener('input',  _onInputChange);
}

async function _onCardClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, exo, set: setIdx, indices, round } = btn.dataset;

  if (action === 'remove-exo')   await _removeExo(parseInt(exo));
  if (action === 'add-serie')    _addSerie(parseInt(exo));
  if (action === 'toggle-done')  await _toggleDone(parseInt(exo), parseInt(setIdx));
  if (action === 'toggle-round') await _toggleRound(indices.split(',').map(Number), parseInt(round));
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

async function _lookupTypeMetrique(nom) {
  try {
    const { getAllExercices } = await import('./exercices.js');
    const EXERCICES = await getAllExercices();
    return EXERCICES.find(e => e.nom === nom)?.type_metrique || DEFAULT_METRIC_TYPE;
  } catch {
    return DEFAULT_METRIC_TYPE;
  }
}

export async function addExercice(nom) {
  const type_metrique = await _lookupTypeMetrique(nom);
  const fields = metricFields(type_metrique);
  const perf   = await _fetchLastPerf(nom, type_metrique);

  _state.exercices.push({
    nom, type_metrique, repos_inter: APP_CONFIG.defaultRestTime,
    lastPerf: perf?.summary ?? null,
    sets: [_blankSet(fields, perf)],
  });

  render();
  setTimeout(() => {
    const cards = _section.querySelectorAll('.exercise-card');
    cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

export async function addExercices(noms) {
  if (!noms?.length) return;
  const types = await Promise.all(noms.map(_lookupTypeMetrique));
  const perfs = await Promise.all(noms.map((n, i) => _fetchLastPerf(n, types[i])));

  noms.forEach((nom, i) => {
    const fields = metricFields(types[i]);
    _state.exercices.push({
      nom, type_metrique: types[i], repos_inter: APP_CONFIG.defaultRestTime,
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
  if (!exercices.length) return;

  const perfs = await Promise.all(exercices.map(ex => _fetchLastPerf(ex.nom, ex.type_metrique)));

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
      nom: ex.nom, type_metrique, repos_inter: ex.repos_inter,
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
  const exo    = _state.exercices[ei];
  const fields = metricFields(exo.type_metrique);
  const lastSet = exo.sets.at(-1);
  const newSet  = { repos: null, done: false, dbId: null };
  fields.forEach(f => { newSet[f.key] = lastSet?.[f.key] ?? null; });
  exo.sets.push(newSet);
  render();
  setTimeout(() => {
    const cards = _section.querySelectorAll('.exercise-card');
    cards[ei]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 60);
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
    set.repos = set.repos ?? APP_CONFIG.defaultRestTime;

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
    set.repos = set.repos ?? APP_CONFIG.defaultRestTime;

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

export async function openExercicePicker() {
  const { getAllExercices } = await import('./exercices.js');
  const EXERCICES = await getAllExercices();
  const GROUPES = ['Tous', ...new Set(EXERCICES.map(e => e.groupe))];

  let search = '';
  let groupe = 'Tous';

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
      btn.addEventListener('click', () => { closeModal(); addExercice(btn.dataset.nom); });
    });
  };

  openModal({
    title: 'Choisir un exercice',
    body: `
      <div class="picker-wrapper">
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

  document.getElementById('picker-search')?.addEventListener('input', e => {
    search = e.target.value.toLowerCase().trim();
    rerender();
    const raw  = e.target.value.trim();
    const wrap = document.getElementById('picker-custom-wrap');
    if (wrap) {
      const exists = EXERCICES.some(ex => ex.nom.toLowerCase() === raw.toLowerCase());
      wrap.innerHTML = raw && !exists
        ? `<button class="btn btn-secondary btn-full" id="picker-custom">+ Ajouter "${raw}"</button>`
        : '';
      document.getElementById('picker-custom')?.addEventListener('click', () => {
        closeModal(); addExercice(raw);
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
  const totalSets = _state.exercices.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0);
  const duree     = _elapsedMinutes();

  if (!_state.exercices.length) {
    if (await confirmDialog('Aucun exercice enregistré. Annuler la séance ?', { confirmLabel: 'Annuler la séance' })) {
      await supabase.from('seances').delete().eq('id', _state.seance.id).catch(() => {});
      _reset();
    }
    return;
  }

  openModal({
    title: 'Terminer la séance ?',
    body: `
      <div class="seance-finish-summary">
        <div class="grid-2">
          <div class="card" style="text-align:center">
            <p class="card-label">Durée</p>
            <p class="card-value" style="font-size:var(--font-size-2xl)">${duree}<span class="card-unit"> min</span></p>
          </div>
          <div class="card" style="text-align:center">
            <p class="card-label">Séries validées</p>
            <p class="card-value" style="font-size:var(--font-size-2xl)">${totalSets}</p>
          </div>
        </div>
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

  document.getElementById('btn-continue-seance')?.addEventListener('click', closeModal);
  document.getElementById('btn-confirm-finish')?.addEventListener('click', () => _doFinish(duree));
}

async function _doFinish(duree) {
  closeModal();
  const notes = document.getElementById('seance-notes-final')?.value.trim() || null;
  try {
    await supabase.from('seances').update({ duree_minutes: duree, notes }).eq('id', _state.seance.id);
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
  const onFinish = _onFinish;
  _state = _section = _onFinish = _startTime = null;
  if (onFinish) onFinish();
}
