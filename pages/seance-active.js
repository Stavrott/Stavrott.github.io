import { currentUser }               from '../js/auth.js';
import { supabase }                   from '../js/supabase.js';
import { showToast, formatTime, openModal, closeModal } from '../js/utils.js';
import { startRestTimer }             from '../components/timer.js';
import { APP_CONFIG }                 from '../js/config.js';

// ── État global ───────────────────────────────────────────────────────

let _state      = null; // { seance, exercices: [{nom, lastPerf, sets:[...]}] }
let _section    = null;
let _onFinish   = null;
let _startTime  = null;
let _elapsedId  = null;

export function hasActiveSeance()  { return _state !== null; }
export function getActiveSeance()  { return _state?.seance ?? null; }

// ── Démarrer ──────────────────────────────────────────────────────────

export async function startSeance(nom, section, onFinish) {
  const { data, error } = await supabase
    .from('seances')
    .insert({ user_id: currentUser.id, nom, date: new Date().toISOString().split('T')[0] })
    .select().single();

  if (error) throw error;

  _state     = { seance: data, exercices: [] };
  _section   = section;
  _onFinish  = onFinish;
  _startTime = Date.now();

  render();
  _elapsedId = setInterval(_tickElapsed, 1000);
  showToast(`Séance "${nom}" démarrée 💪`, 'success');
}

export function resumeActiveView(section) {
  _section = section;
  render();
  if (!_elapsedId) _elapsedId = setInterval(_tickElapsed, 1000);
}

function _tickElapsed() {
  const el = document.getElementById('session-elapsed');
  if (el) el.textContent = formatTime(Math.floor((Date.now() - _startTime) / 1000));
}

function _elapsedMinutes() { return Math.max(1, Math.round((Date.now() - _startTime) / 60000)); }

// ── Rendu principal ───────────────────────────────────────────────────

function render() {
  if (!_section || !_state) return;

  const exoCount  = _state.exercices.length;
  const setsDone  = _state.exercices.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0);

  _section.innerHTML = `
    <div class="session-bar">
      <div class="session-info">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="session-clock"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span id="session-elapsed">${formatTime(Math.floor((Date.now() - _startTime) / 1000))}</span>
        <span class="session-sep">•</span>
        <span id="session-stats">${_statsLabel(exoCount, setsDone)}</span>
      </div>
      <button class="btn btn-success btn-sm" id="btn-finish-seance">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px"><polyline points="20 6 9 17 4 12"/></svg>
        Terminer
      </button>
    </div>

    <h2 class="seance-active-title">${_state.seance.nom}</h2>

    <div id="exo-cards-list">
      ${_state.exercices.map((e, i) => _cardHTML(e, i)).join('')}
    </div>

    <button class="btn btn-secondary btn-full btn-add-exo" id="btn-add-exo">
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

// ── HTML carte exercice ───────────────────────────────────────────────

function _cardHTML(exo, i) {
  return `
    <div class="exercise-card" data-exo-index="${i}">
      <div class="exercise-card-header">
        <div class="exercise-card-info">
          <h3 class="exercise-card-name">${exo.nom}</h3>
          ${exo.lastPerf ? `<p class="exercise-card-hint">Dernière fois : ${exo.lastPerf}</p>` : ''}
        </div>
        <button class="icon-btn" data-action="remove-exo" data-exo="${i}" aria-label="Supprimer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="sets-header-row">
        <span style="width:28px;flex-shrink:0">#</span>
        <span>Poids (kg)</span>
        <span>Reps</span>
        <span style="width:80px;flex-shrink:0;text-align:center">Repos</span>
        <span style="width:36px;flex-shrink:0"></span>
      </div>

      <div class="sets-list" data-exo-sets="${i}">
        ${exo.sets.map((s, si) => _setRowHTML(s, i, si)).join('')}
      </div>

      <button class="btn btn-ghost btn-sm btn-add-serie" data-action="add-serie" data-exo="${i}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:13px;height:13px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Ajouter une série
      </button>
    </div>`;
}

// ── HTML ligne de série ───────────────────────────────────────────────

function _setRowHTML(set, ei, si) {
  const done = set.done;
  return `
    <div class="set-row-wrapper ${done ? 'set-done' : ''}" data-exo="${ei}" data-set="${si}">
      <div class="set-row-main">
        <div class="set-num ${done ? 'set-num-done' : ''}">${si + 1}</div>
        <input class="set-input" type="number" inputmode="decimal" step="0.5" min="0"
          placeholder="—" value="${set.poids ?? ''}"
          data-field="poids" data-exo="${ei}" data-set="${si}" ${done ? 'disabled' : ''}>
        <input class="set-input" type="number" inputmode="numeric" min="0"
          placeholder="—" value="${set.reps ?? ''}"
          data-field="reps" data-exo="${ei}" data-set="${si}" ${done ? 'disabled' : ''}>
        <div class="set-rest-cell">
          <button class="set-btn-rest ${done ? 'set-btn-rest-done' : ''}"
            data-action="start-timer" data-exo="${ei}" data-set="${si}"
            title="Démarrer le timer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${done && set.repos ? `<span>${set.repos}s</span>` : ''}
          </button>
        </div>
        <button class="set-btn-done ${done ? 'set-btn-done-active' : ''}"
          data-action="toggle-done" data-exo="${ei}" data-set="${si}"
          aria-label="Valider la série">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
      </div>
      <div class="set-notes-row" data-notes-row="${ei}-${si}">
        <input class="set-notes-input" type="text"
          placeholder="Note (facultatif)…"
          value="${set.notes ?? ''}"
          data-field="notes" data-exo="${ei}" data-set="${si}"
          ${done ? 'disabled' : ''}>
      </div>
    </div>`;
}

// ── Binding événements ────────────────────────────────────────────────

function _bindEvents() {
  _section.querySelector('#btn-finish-seance')?.addEventListener('click', _confirmFinish);
  _section.querySelector('#btn-add-exo')?.addEventListener('click', openExercicePicker);

  const cardList = _section.querySelector('#exo-cards-list');
  cardList?.addEventListener('click',  _onCardClick);
  cardList?.addEventListener('input',  _onInputChange);
}

function _onCardClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, exo, set: setIdx } = btn.dataset;
  const ei = parseInt(exo);
  const si = parseInt(setIdx);

  if (action === 'remove-exo')  _removeExo(ei);
  if (action === 'add-serie')   _addSerie(ei);
  if (action === 'toggle-done') _toggleDone(ei, si);
  if (action === 'start-timer') startRestTimer(APP_CONFIG.defaultRestTime);
}

function _onInputChange(e) {
  const input = e.target.closest('[data-field]');
  if (!input) return;
  const { field, exo, set: setIdx } = input.dataset;
  const ei = parseInt(exo);
  const si = parseInt(setIdx);
  const set = _state.exercices[ei]?.sets[si];
  if (!set) return;

  if (field === 'poids') set.poids = parseFloat(input.value) || null;
  else if (field === 'reps') set.reps = parseInt(input.value) || null;
  else if (field === 'notes') set.notes = input.value;
}

// ── Actions ───────────────────────────────────────────────────────────

export async function addExercice(nom) {
  const lastPerf = await _fetchLastPerf(nom);
  const lastSet  = lastPerf?.sets?.[0];

  _state.exercices.push({
    nom,
    lastPerf: lastPerf?.summary ?? null,
    sets: [{
      poids: lastSet?.poids_kg    ?? null,
      reps:  lastSet?.repetitions ?? null,
      repos: null, notes: '', done: false, dbId: null,
    }],
  });

  render();
  setTimeout(() => {
    const cards = _section.querySelectorAll('.exercise-card');
    cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

// Ajouter plusieurs exercices d'un coup (depuis un programme) ──────────
export async function addExercices(noms) {
  if (!noms?.length) return;
  // Récupérer toutes les dernières perfs en parallèle
  const perfs = await Promise.all(noms.map(n => _fetchLastPerf(n)));

  noms.forEach((nom, i) => {
    const p = perfs[i];
    const s = p?.sets?.[0];
    _state.exercices.push({
      nom,
      lastPerf: p?.summary ?? null,
      sets: [{
        poids: s?.poids_kg    ?? null,
        reps:  s?.repetitions ?? null,
        repos: null, notes: '', done: false, dbId: null,
      }],
    });
  });

  render();
}

function _removeExo(ei) {
  if (!confirm(`Supprimer "${_state.exercices[ei]?.nom}" de la séance ?`)) return;
  _state.exercices.splice(ei, 1);
  render();
}

function _addSerie(ei) {
  const exo     = _state.exercices[ei];
  const lastSet = exo.sets.at(-1);
  const newSet  = {
    poids: lastSet?.poids ?? null,
    reps:  lastSet?.reps  ?? null,
    repos: null,
    notes: '',
    done:  false,
    dbId:  null,
  };
  const si = exo.sets.length;
  exo.sets.push(newSet);

  // Ajout partiel sans re-render complet (préserve le focus)
  const setsList = _section.querySelector(`[data-exo-sets="${ei}"]`);
  if (setsList) {
    const tmp = document.createElement('div');
    tmp.innerHTML = _setRowHTML(newSet, ei, si);
    setsList.appendChild(tmp.firstElementChild);
    setsList.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  _updateStatsBar();
}

async function _toggleDone(ei, si) {
  const set = _state.exercices[ei]?.sets[si];
  if (!set) return;

  // Lire les valeurs actuelles des inputs
  const poidsEl = _section.querySelector(`input[data-field="poids"][data-exo="${ei}"][data-set="${si}"]`);
  const repsEl  = _section.querySelector(`input[data-field="reps"][data-exo="${ei}"][data-set="${si}"]`);
  const notesEl = _section.querySelector(`input[data-field="notes"][data-exo="${ei}"][data-set="${si}"]`);
  if (poidsEl) set.poids = parseFloat(poidsEl.value) || null;
  if (repsEl)  set.reps  = parseInt(repsEl.value)    || null;
  if (notesEl) set.notes = notesEl.value || '';

  if (!set.done) {
    set.done  = true;
    set.repos = APP_CONFIG.defaultRestTime;

    // Sauvegarde Supabase
    try {
      const { data } = await supabase.from('series').insert({
        user_id:      currentUser.id,
        seance_id:    _state.seance.id,
        exercice_nom: _state.exercices[ei].nom,
        numero_serie: si + 1,
        poids_kg:     set.poids,
        repetitions:  set.reps,
        temps_repos_s: set.repos,
        notes:        set.notes || null,
      }).select().single();
      if (data) set.dbId = data.id;
    } catch {
      set.done = false;
      showToast('Erreur de sauvegarde', 'error');
      return;
    }

    // Démarrer le timer de repos automatiquement
    startRestTimer(APP_CONFIG.defaultRestTime);
  } else {
    // Dé-valider : supprimer en base
    set.done = false;
    if (set.dbId) {
      await supabase.from('series').delete().eq('id', set.dbId).catch(() => {});
      set.dbId = null;
    }
  }

  // Mise à jour ciblée de la ligne
  const wrapper = _section.querySelector(`.set-row-wrapper[data-exo="${ei}"][data-set="${si}"]`);
  if (wrapper) {
    const tmp = document.createElement('div');
    tmp.innerHTML = _setRowHTML(set, ei, si);
    wrapper.replaceWith(tmp.firstElementChild);
  }
  _updateStatsBar();
}

function _updateStatsBar() {
  const exoCount = _state.exercices.length;
  const setsDone = _state.exercices.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0);
  const el = document.getElementById('session-stats');
  if (el) el.textContent = _statsLabel(exoCount, setsDone);
}

// ── Dernière perf ─────────────────────────────────────────────────────

async function _fetchLastPerf(nom) {
  try {
    const { data } = await supabase
      .from('series')
      .select('poids_kg, repetitions')
      .eq('user_id', currentUser.id)
      .eq('exercice_nom', nom)
      .order('created_at', { ascending: false })
      .limit(4);

    if (!data?.length) return null;
    const best = data[0];
    return {
      summary: `${best.poids_kg ?? '?'} kg × ${best.repetitions ?? '?'}`,
      sets: data,
    };
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
          <button class="list-item clickable picker-exo-btn" data-nom="${e.nom}" style="width:100%;text-align:left">
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
          <input class="search-input" id="picker-search" placeholder="Rechercher ou saisir un nom…" type="search" autocomplete="off">
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

    // Option "exercice personnalisé"
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
    if (confirm('Aucun exercice enregistré. Annuler la séance ?')) {
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
            <p class="card-title">Durée</p>
            <p class="card-value">${duree}<span> min</span></p>
          </div>
          <div class="card" style="text-align:center">
            <p class="card-title">Séries validées</p>
            <p class="card-value">${totalSets}</p>
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
    showToast(`Séance terminée — ${duree} min 🎉`, 'success', 4000);
  } catch {
    showToast('Erreur lors de la finalisation', 'error');
  }
  _reset();
}

function _reset() {
  clearInterval(_elapsedId);
  _elapsedId = null;
  const onFinish = _onFinish;
  _state = _section = _onFinish = _startTime = null;
  if (onFinish) onFinish();
}
