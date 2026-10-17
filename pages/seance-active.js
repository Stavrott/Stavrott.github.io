import { currentUser }               from '../js/auth.js';
import { supabase }                   from '../js/supabase.js';
import { showToast, formatTime, openModal, closeModal, confirmDialog, localDateStr, calc1RM } from '../js/utils.js';
import { enqueueInsert, enqueueUpdate, enqueueDelete, cancelQueued, patchQueuedInsert, pendingCount } from '../js/sync-queue.js';
import { startRestTimer, hideTimer }  from '../components/timer.js';
import { APP_CONFIG }                 from '../js/config.js';
import { metricFields, parseFieldValue, fieldByKey, FIELD_DB_COLUMN, DEFAULT_METRIC_TYPE, formatFieldValue, formatFieldDisplay, fieldInputAttrs, isDureeField, formatDuree } from '../js/metrics.js';
import { SET_TYPES, DEFAULT_SET_TYPE, setTypeOf, isWorkingSet, setTypeLabel, setTypeClass } from '../js/set-types.js';
import { estimateCaloriesSeance, musclesTravailles, sportMinutes } from '../js/calories.js';
import { muscleShares, muscleWeights, muscleBarsHTML, formatKg } from '../js/pulse-ui.js';
import { bodyMapHTML, highlightMuscles, groupsFromMuscleNames } from '../js/body-map.js';
import { getPoidsActuel } from './profil.js';
import { navigate } from '../js/router.js';
import { fetchExerciseImage } from '../js/exercisedb.js';

// ── État global ───────────────────────────────────────────────────────

let _state      = null; // { seance, routineId, exercices: [{nom, type_metrique, repos_inter, lastPerf, sets:[...]}] }
let _section    = null;
let _onFinish   = null;
let _startTime  = null;
let _elapsedId  = null;
let _lastActiveExoIndex = null; // dernier exercice dont une série a été validée — sert à déterminer "en cours" / "prochain" pour la barre flottante

const _setTimers = new Map(); // timers actifs par série, clé `${ei}_${si}`

// ── Vue « focus » (un exercice à la fois) ou « liste » (toute la séance) ──
// Le focus est la vue par défaut ; la liste reste l'endroit où l'on
// réordonne, remplace, ajoute ou transforme en superset. Le choix est
// mémorisé sur l'appareil.
const _VIEW_KEY = 'forme_seance_vue';
let _viewMode = (() => { try { return localStorage.getItem(_VIEW_KEY) || 'focus'; } catch { return 'focus'; } })();
let _focusBlockIdx = null; // bloc choisi à la main ; null = suivre la progression

// ── Persistance localStorage (survie aux rechargements SW) ────────────

const _PERSIST_KEY = 'forme_active_seance';

// Au-delà de ce délai depuis le début, une séance encore "active" en
// localStorage n'a pas duré tout ce temps : l'appli a été coupée en cours
// de route. Le chrono doit alors être réancré, pas repris tel quel.
const _STALE_SEANCE_MS = 12 * 60 * 60 * 1000; // 12 h

function _persistState() {
  if (!_state || !_startTime) return;
  try {
    localStorage.setItem(_PERSIST_KEY, JSON.stringify({
      seanceId:            _state.seance.id,
      seanceNom:           _state.seance.nom,
      seanceDate:          _state.seance.date,
      startTime:           _startTime,
      routineId:           _state.routineId ?? null,
      programmeRef:        _state.programmeRef ?? null,
      chrono:              _state.chrono ?? null,
      routineExerciceNoms: _state.routineExerciceNoms ?? [],
      exercices:           _state.exercices,
    }));
  } catch {}
}

function _clearPersist() {
  try { localStorage.removeItem(_PERSIST_KEY); } catch {}
}

export async function tryRestoreSeance() {
  if (_state) return true; // déjà une séance active
  try {
    const raw = localStorage.getItem(_PERSIST_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved?.seanceId || !saved?.startTime) return false;

    // Vérifie que la séance existe en DB et n'est pas déjà terminée. Sans
    // réseau, on reprend la copie locale : seule une réponse de la base
    // (séance absente ou terminée) autorise à l'effacer.
    const { data, error } = await supabase.from('seances')
      .select('id, nom, date, duree_minutes')
      .eq('id', saved.seanceId).maybeSingle();
    if (!error && (!data || data.duree_minutes != null)) { _clearPersist(); return false; }
    const seance = data ?? { id: saved.seanceId, nom: saved.seanceNom, date: saved.seanceDate };

    _state = {
      seance:              { id: seance.id, nom: seance.nom, date: seance.date },
      routineId:           saved.routineId ?? null,
      programmeRef:        saved.programmeRef ?? null,
      chrono:              saved.chrono ?? null,
      routineExerciceNoms: saved.routineExerciceNoms ?? [],
      exercices:           saved.exercices ?? [],
    };
    _startTime = saved.startTime;

    // Séance reprise longtemps après le début : le chrono mural afficherait
    // "14:32:07" pour une séance d'une heure faite la veille. On le réancre
    // sur le temps de travail réellement horodaté (première → dernière
    // série), qui repart de là et continue de tourner normalement.
    if (Date.now() - saved.startTime > _STALE_SEANCE_MS) {
      const { data: series } = await supabase
        .from('series')
        .select('created_at')
        .eq('seance_id', saved.seanceId)
        .order('created_at', { ascending: true });

      const spanMs = series?.length
        ? new Date(series.at(-1).created_at).getTime() - new Date(series[0].created_at).getTime()
        : 0;
      _startTime = Date.now() - spanMs;
      _persistState();
    }

    _lastActiveExoIndex = null;
    return true;
  } catch {
    _clearPersist();
    return false;
  }
}

const _uid = () => Math.random().toString(36).slice(2, 10);
// Champ d'un exercice : plusieurs types partagent la clé « duree » avec
// des réglages différents (pas des boutons, unité d'un nombre seul).
const _fieldOf = (exo, key) => metricFields(exo?.type_metrique).find(x => x.key === key) ?? fieldByKey(key);
// Exemple de saisie : « 1h30 » pour un sport, « 45s » pour un gainage.
const _placeholder = f => isDureeField(f) ? (f.plainUnit === 'min' ? '1h30' : '45s') : '0';
const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');

export function hasActiveSeance()   { return _state !== null; }

// Séance lancée depuis un programme : en fin de séance, les charges
// réellement faites mettent à jour la séance du programme.
export function setProgrammeRef(ref) {
  if (!_state) return;
  _state.programmeRef = ref ?? null;
  _persistState();
}

// Une série mise en file d'attente hors-ligne vient d'être enregistrée :
// elle récupère son identifiant en base (pour les corrections ultérieures).
window.addEventListener('forme-sync-inserted', (e) => {
  if (!_state || e.detail?.table !== 'series') return;
  for (const ex of _state.exercices) {
    for (const set of ex.sets) {
      if (set.syncId === e.detail.localId) { set.syncId = null; set.dbId = e.detail.id; }
    }
  }
  _persistState();
});
window.addEventListener('forme-sync-change', (e) => {
  const el = document.getElementById('sync-pill');
  if (!el) return;
  const n = e.detail?.pending ?? 0;
  el.hidden = n === 0;
  el.textContent = n ? `${n} en attente de synchro` : '';
});

function _syncPillHTML() {
  const n = pendingCount();
  return `<span class="sync-pill" id="sync-pill" role="status" ${n ? '' : 'hidden'}>${n ? `${n} en attente de synchro` : ''}</span>`;
}
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
    .insert({ user_id: currentUser.id, nom, date: localDateStr() })
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

// Marge de "hors-série" tolérée : échauffement avant la première série,
// puis repos final et rangement après la dernière. Au-delà, le chrono mural
// n'est plus crédible — appli fermée brutalement puis rouverte le lendemain,
// onglet suspendu, téléphone qui tue la PWA — et on retombe sur l'intervalle
// réel des séries, seule trace horodatée de l'effort.
export const MAX_OVERHEAD_MIN = 30;

// Durée réelle de la séance, bornée par l'intervalle des séries en DB.
// Le chrono seul produisait des durées (et donc des calories, linéaires en
// durée) délirantes dès qu'une séance était reprise après une coupure.
async function _realDurationMinutes() {
  const chrono = _elapsedMinutes();
  try {
    const { data } = await supabase
      .from('series')
      .select('created_at')
      .eq('seance_id', _state.seance.id)
      .order('created_at', { ascending: true });

    if (!data?.length) return Math.min(chrono, MAX_OVERHEAD_MIN);

    const spanMin = Math.round(
      (new Date(data.at(-1).created_at).getTime() - new Date(data[0].created_at).getTime()) / 60000
    );
    return Math.max(1, Math.min(chrono, spanMin + MAX_OVERHEAD_MIN));
  } catch {
    // Hors-ligne : on garde le chrono, _repairAberrantSessions corrigera au
    // prochain chargement de la page Séances si la valeur est incohérente.
    return chrono;
  }
}

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

function _setViewMode(mode) {
  _viewMode = mode;
  try { localStorage.setItem(_VIEW_KEY, mode); } catch {}
  render();
  _section?.closest('.app-main')?.scrollTo?.({ top: 0 });
}

function render() {
  _clearAllTimers();
  if (!_section || !_state) return;

  if (_viewMode === 'focus' && _state.exercices.length) {
    _renderFocus();
    return;
  }

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

    <div class="seance-list-head">
      <h2 class="seance-active-title">${_esc(_state.seance.nom)}</h2>
      ${exoCount ? `
        <button class="btn btn-secondary btn-sm" id="btn-view-focus">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><circle cx="12" cy="12" r="3"/><path d="M3 9V5a2 2 0 012-2h4M15 3h4a2 2 0 012 2v4M21 15v4a2 2 0 01-2 2h-4M9 21H5a2 2 0 01-2-2v-4"/></svg>
          Mode focus
        </button>` : ''}
    </div>

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
  _loadCardImages();
}

function _loadCardImages() {
  const list = document.getElementById('exo-cards-list');
  if (!list) return;
  list.querySelectorAll('.exo-thumb[data-img-nom]').forEach(el => {
    const nom = el.dataset.imgNom;
    fetchExerciseImage(nom).then(url => {
      if (!el.isConnected || !url) return;
      el.innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.style.display='none'">`;
    });
  });
}

function _statsLabel(exoCount, setsDone) {
  const e = exoCount === 0 ? 'Aucun exercice' : `${exoCount} exercice${exoCount > 1 ? 's' : ''}`;
  const s = setsDone > 0 ? ` • ${setsDone} série${setsDone > 1 ? 's' : ''}` : '';
  return e + s;
}


// ── Vue focus ─────────────────────────────────────────────────────────

const _SVG_LIST  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1" fill="currentColor"/><circle cx="3.5" cy="12" r="1" fill="currentColor"/><circle cx="3.5" cy="18" r="1" fill="currentColor"/></svg>`;
const _SVG_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
const _SVG_PAUSE = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
const _SVG_PLAY  = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="7 4 20 12 7 20"/></svg>`;
const _SVG_CHRONO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9 2h6"/></svg>`;
const _SVG_PREV  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>`;
const _SVG_NEXT  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;

// Bloc affiché : celui choisi à la main, sinon le bloc en cours s'il lui
// reste des séries, sinon le prochain bloc qui en a.
function _focusIndex(blocks) {
  if (_focusBlockIdx != null && _focusBlockIdx < blocks.length) return _focusBlockIdx;
  const a = _activeBlockIndex(blocks);
  if (a !== -1 && _blockPendingRound(blocks[a]) !== -1) return a;
  const next = _firstPendingBlockIndex(blocks, a === -1 ? 0 : a + 1);
  if (next !== -1) return next;
  const first = _firstPendingBlockIndex(blocks, 0);
  return first !== -1 ? first : Math.max(0, a);
}

function _focusStepperHTML(exo, ei, r, compact) {
  const set = exo.sets[r];
  if (!set) return `<p class="focus-note">Pas de série ${r + 1} pour cet exercice.</p>`;
  // Sport : raccourcis de durée sous le compteur, pour ne rien avoir à taper.
  const quick = exo.type_metrique === 'sport' && !set.done
    ? `<div class="focus-quick" role="group" aria-label="Durée rapide">
        ${[1800, 2700, 3600, 5400, 7200].map(v => `
          <button class="focus-quick-btn ${Number(set.duree) === v ? 'is-on' : ''}" data-action="focus-set" data-exo="${ei}" data-set="${r}"
            data-field="duree" data-val="${v}">${formatDuree(v)}</button>`).join('')}
      </div>` : '';
  return `
    <div class="focus-steppers ${compact ? 'is-compact' : ''}">
      ${metricFields(exo.type_metrique).map(f => `
        <div class="focus-stepper ${isDureeField(f) ? 'is-duree' : ''}">
          <button class="focus-step-btn" data-action="focus-step" data-exo="${ei}" data-set="${r}" data-field="${f.key}" data-dir="-1"
            aria-label="Diminuer ${_esc(f.header.toLowerCase())}">−</button>
          <label class="focus-step-mid">
            <span class="focus-step-label">${_esc(f.header)}</span>
            <input class="focus-step-input" ${fieldInputAttrs(f)}
              placeholder="${_placeholder(f)}" value="${_esc(formatFieldValue(f, set[f.key]))}"
              data-field="${f.key}" data-exo="${ei}" data-set="${r}">
          </label>
          <button class="focus-step-btn" data-action="focus-step" data-exo="${ei}" data-set="${r}" data-field="${f.key}" data-dir="1"
            aria-label="Augmenter ${_esc(f.header.toLowerCase())}">+</button>
        </div>`).join('')}
    </div>
    ${quick}`;
}

function _renderFocus() {
  const blocks   = _buildBlocks(_state.exercices);
  const bi       = _focusIndex(blocks);
  const block    = blocks[bi];
  const indices  = block.type === 'single' ? [block.index] : block.indices;
  const total    = _blockRoundsTotal(block);
  const pending  = _blockPendingRound(block);
  const r        = pending === -1 ? Math.max(0, total - 1) : pending;
  const allSets  = _state.exercices.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = _state.exercices.reduce((n, e) => n + e.sets.filter(x => x.done).length, 0);
  const progress = allSets ? Math.round((doneSets * 100) / allSets) : 0;
  const allDone  = blocks.every(b => _blockPendingRound(b) === -1);
  const superset = indices.length > 1;
  const ei0      = indices[0];
  const first    = _state.exercices[ei0];
  const curSet   = first.sets[r];
  const prevBlock = bi > 0 ? blocks[bi - 1] : null;
  const nextBlock = bi < blocks.length - 1 ? blocks[bi + 1] : null;
  const isKg     = (first.type_metrique || DEFAULT_METRIC_TYPE) === 'kg_reps';
  const warmup   = !superset && curSet && !isWorkingSet(curSet.type);

  const dots = Array.from({ length: total }, (_, k) => {
    const cls = _blockRoundDone(block, k) ? 'is-done' : k === pending ? 'is-current' : '';
    const ech = !superset && first.sets[k] && !isWorkingSet(first.sets[k].type) ? ' is-warmup' : '';
    return `<span class="focus-dot ${cls}${ech}"></span>`;
  }).join('');

  const validateAttrs = superset
    ? `data-action="toggle-round" data-indices="${indices.join(',')}" data-round="${r}"`
    : `data-action="toggle-done" data-exo="${ei0}" data-set="${r}"`;

  // Numéro de série : les échauffements portent « É » et ne consomment pas
  // de rang, comme dans la vue liste.
  const workTotal = superset ? total : first.sets.filter(x => isWorkingSet(x.type)).length;
  const setNum = warmup
    ? `<div class="focus-setnum is-warmup" aria-label="Série d’échauffement"><span class="focus-setnum-big">É</span></div>`
    : `<div class="focus-setnum" aria-label="Série ${superset ? r + 1 : _workingNumber(first, r)} sur ${workTotal}">
         <span class="focus-setnum-big">${superset ? r + 1 : _workingNumber(first, r)}</span><span class="focus-setnum-total">/${workTotal}</span>
       </div>`;

  // Aides sous le titre (exercice seul) : record, suggestion, disques.
  const sg   = !superset && pending !== -1 && !first.suggestionAppliquee ? _suggestion(first) : null;
  const rec  = !superset && isKg && first.record && !first.record.vide ? first.record : null;
  const prOk = !superset && first.sets.some(x => x.done && x.pr);
  const disques = !superset && isKg && pending !== -1 && _isBarre(first) ? _disquesLabel(curSet?.poids) : '';
  const canWarmup = !superset && isKg && pending !== -1
    && !first.sets.some(x => x.done) && !first.sets.some(x => !isWorkingSet(x.type))
    && Number(first.sets.find(x => isWorkingSet(x.type))?.poids) >= 10;
  const hasChrono = !superset && pending !== -1 && metricFields(first.type_metrique).some(f => f.key === 'duree');
  const chronoOn  = hasChrono && _state.chrono?.ei === ei0 && _state.chrono?.si === r;

  _section.innerHTML = `
    <div class="focus-view" id="focus-root">
      <div class="focus-progress" role="progressbar" aria-label="Avancement de la séance"
        aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
        <div class="focus-progress-fill" style="width:${progress}%"></div>
      </div>

      <div class="focus-top">
        <button class="focus-pill" data-action="view-list" aria-label="Voir et réordonner les exercices de la séance">
          ${_SVG_LIST}Exercice ${bi + 1} / ${blocks.length}
        </button>
        <span class="focus-elapsed" id="session-elapsed">${formatTime(getElapsedSeconds())}</span>
        <button class="btn btn-secondary btn-sm" id="btn-finish-seance">Terminer</button>
      </div>
      ${_syncPillHTML()}

      <div class="focus-main">
        ${superset ? `<p class="focus-eyebrow">Superset · ${indices.length} exercices</p>` : ''}
        <h2 class="focus-title" data-action="show-exo-detail" data-exo="${ei0}">
          ${superset ? indices.map(i => _esc(_state.exercices[i].nom)).join(' + ') : _esc(first.nom)}
        </h2>
        ${!superset && first.lastPerf ? `<p class="focus-hint">Dernière fois : ${_esc(first.lastPerf)}</p>` : ''}
        ${prOk ? `<p class="focus-record is-new">Nouveau record aujourd’hui</p>`
          : rec ? `<p class="focus-record">Record : ${String(rec.poids).replace('.', ',')} kg · 1RM estimé ${rec.e1rm} kg</p>` : ''}

        ${sg ? `
          <div class="focus-suggest" role="note">
            <p><strong>Tu peux monter à ${String(sg.poids).replace('.', ',')} kg</strong><br>
            <span>La dernière fois, toutes tes séries à ${String(sg.depuis).replace('.', ',')} kg ont atteint ${sg.reps} répétitions.</span></p>
            <button class="btn btn-sm btn-primary" data-action="apply-suggest" data-exo="${ei0}">Appliquer</button>
          </div>` : ''}

        ${pending === -1 ? `
          <div class="focus-done">
            <span class="focus-done-badge">${_SVG_CHECK}</span>
            <p class="focus-done-text">${allDone ? 'Toutes les séries sont faites' : 'Exercice terminé'}</p>
          </div>
        ` : `
          ${chronoOn ? '' : setNum}
          <p class="focus-eyebrow">${chronoOn ? `Série ${_workingNumber(first, r) || 'É'} / ${workTotal}` : superset ? 'Tour en cours' : warmup ? 'Échauffement' : 'Série en cours'}</p>

          ${chronoOn ? _chronoHTML(ei0, r) : indices.map(ei => `
            ${superset ? `<p class="focus-sub">${_esc(_state.exercices[ei].nom)}</p>` : ''}
            ${_focusStepperHTML(_state.exercices[ei], ei, r, superset)}`).join('')}
          ${disques ? `<p class="focus-plates">${_esc(disques)}</p>` : ''}
          ${canWarmup ? `<button class="focus-link" data-action="add-warmup" data-exo="${ei0}">Ajouter un échauffement (3 séries)</button>` : ''}
        `}

        <div class="focus-dots" aria-hidden="true">${dots}</div>
      </div>

      <div class="focus-dock">
        ${pending === -1
          ? (allDone
              ? `<button class="btn btn-primary focus-dock-main" data-action="focus-finish">Terminer la séance</button>`
              : nextBlock ? `<button class="btn btn-primary focus-dock-main" data-action="focus-go" data-block="${bi + 1}">Exercice suivant</button>` : '')
          : `<div class="focus-dock-row">
              ${hasChrono && !chronoOn ? `<button class="btn btn-secondary focus-dock-chrono" data-action="chrono-start">${_SVG_CHRONO}<span>Chrono</span></button>` : ''}
              ${chronoOn ? (_state.chrono.startedAt || _state.chrono.countdownUntil
                ? `<button class="btn btn-secondary focus-dock-chrono" data-action="chrono-pause">${_SVG_PAUSE}<span>Pause</span></button>`
                : `<button class="btn btn-secondary focus-dock-chrono" data-action="chrono-start">${_SVG_PLAY}<span>Reprendre</span></button>`) : ''}
              <button class="btn btn-primary focus-dock-main" ${validateAttrs}>${_SVG_CHECK}<span>${superset ? 'Valider le tour' : warmup ? 'Valider l’échauffement' : 'Valider la série'}</span></button>
            </div>`}
        <div class="focus-nav">
          ${prevBlock
            ? `<button class="focus-nav-btn" data-action="focus-go" data-block="${bi - 1}">${_SVG_PREV}<span>${_esc(_blockLabel(prevBlock))}</span></button>`
            : '<span></span>'}
          ${nextBlock
            ? `<button class="focus-nav-btn is-next" data-action="focus-go" data-block="${bi + 1}"><span>Suivant : ${_esc(_blockLabel(nextBlock))}</span>${_SVG_NEXT}</button>`
            : '<span></span>'}
        </div>
      </div>
    </div>`;

  _section.querySelector('#btn-finish-seance')?.addEventListener('click', _confirmFinish);
  const root = _section.querySelector('#focus-root');
  root?.addEventListener('click',    _onCardClick);
  root?.addEventListener('input',    _onInputChange);
  root?.addEventListener('focusout', _onInputBlur);
  _chronoPaint();
}

// ── Chrono des exercices en durée (planche, tapis, vélo…) ─────────────
// Avec une durée cible : compte à rebours, puis dépassement affiché en
// « +0:05 ». Sans cible : chronomètre simple. « Arrêter » écrit le temps
// réellement tenu dans la série ; il reste à la valider.
// L'état vit dans _state.chrono pour survivre à un rechargement de l'appli.

let _chronoTick = null;
let _wakeLock   = null;

function _fmtChrono(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function _chronoElapsed(c) {
  if (!c) return 0;
  const run = c.startedAt ? (Date.now() - c.startedAt) / 1000 : 0;
  return Math.max(0, (c.acc || 0) + run);
}

function _chronoHTML(ei, si) {
  const set = _state.exercices[ei]?.sets[si];
  const c   = _state.chrono && _state.chrono.ei === ei && _state.chrono.si === si ? _state.chrono : null;
  const target = c?.target ?? (Number(set?.duree) || 0);
  const running = !!c?.startedAt || !!c?.countdownUntil;
  const R = 52, C = Math.round(2 * Math.PI * R);
  return `
    <div class="focus-chrono ${running ? 'is-running' : ''}" id="focus-chrono" data-exo="${ei}" data-set="${si}">
      <div class="focus-chrono-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="fc-track" cx="60" cy="60" r="${R}"/>
          <circle class="fc-fill" id="fc-fill" cx="60" cy="60" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}"/>
        </svg>
        <div class="focus-chrono-center">
          <span class="focus-chrono-time" id="fc-time" role="timer">${_fmtChrono(target || 0)}</span>
          <span class="focus-chrono-sub" id="fc-sub">${target ? `objectif ${_fmtChrono(target)}` : 'chrono'}</span>
        </div>
      </div>
      <button class="focus-link" data-action="chrono-reset">Annuler le chrono</button>
    </div>`;
}

function _chronoPaint() {
  clearInterval(_chronoTick); _chronoTick = null;
  const el = _section?.querySelector('#focus-chrono');
  if (!el) return;
  const c = _state?.chrono;
  const ei = +el.dataset.exo, si = +el.dataset.set;
  const mine = c && c.ei === ei && c.si === si;
  const draw = () => {
    const timeEl = document.getElementById('fc-time');
    const subEl  = document.getElementById('fc-sub');
    const fill   = document.getElementById('fc-fill');
    if (!timeEl || !_state) { clearInterval(_chronoTick); _chronoTick = null; return; }
    const cc = _state.chrono;
    if (!cc || cc.ei !== ei || cc.si !== si) return;
    // Décompte de départ (3, 2, 1) pour se mettre en position.
    if (cc.countdownUntil) {
      const left = Math.ceil((cc.countdownUntil - Date.now()) / 1000);
      if (left > 0) { timeEl.textContent = String(left); subEl.textContent = 'en position'; return; }
      cc.countdownUntil = null; cc.startedAt = Date.now(); _beep(880, 0.12); _persistState();
    }
    const el2 = _chronoElapsed(cc);
    const t = cc.target || 0;
    const C = +fill.getAttribute('stroke-dasharray');
    if (t > 0) {
      const over = el2 - t;
      timeEl.textContent = over >= 0 ? `+${_fmtChrono(over)}` : _fmtChrono(t - el2);
      subEl.textContent  = over >= 0 ? 'objectif atteint' : `objectif ${_fmtChrono(t)}`;
      el.classList.toggle('is-over', over >= 0);
      fill.setAttribute('stroke-dashoffset', String(C * (1 - Math.min(1, el2 / t))));
      if (over >= 0 && !cc.alerted) { cc.alerted = true; navigator.vibrate?.([200, 100, 200]); _beep(1046, 0.25); _persistState(); }
    } else {
      timeEl.textContent = _fmtChrono(el2);
      subEl.textContent  = 'chrono';
      fill.setAttribute('stroke-dashoffset', String(C * (1 - ((el2 % 60) / 60))));
    }
  };
  if (mine) {
    draw();
    if (c.startedAt || c.countdownUntil) _chronoTick = setInterval(draw, 250);
  }
}

let _audioCtx = null;
function _beep(freq = 880, dur = 0.15) {
  try {
    _audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = _audioCtx.createOscillator(), g = _audioCtx.createGain();
    o.frequency.value = freq; g.gain.value = 0.15;
    o.connect(g); g.connect(_audioCtx.destination);
    o.start(); o.stop(_audioCtx.currentTime + dur);
  } catch {}
}

async function _keepAwake(on) {
  try {
    if (on && !_wakeLock && 'wakeLock' in navigator) _wakeLock = await navigator.wakeLock.request('screen');
    if (!on && _wakeLock) { await _wakeLock.release(); _wakeLock = null; }
  } catch {}
}

function _chronoAction(action) {
  if (!_state) return;
  const el = _section?.querySelector('#focus-chrono');
  let ei, si;
  if (el) { ei = +el.dataset.exo; si = +el.dataset.set; }
  else {
    // Lancement depuis le bas d'écran : série en cours du bloc affiché.
    const v = _section?.querySelector('.focus-dock-main[data-action="toggle-done"]');
    if (!v) return;
    ei = +v.dataset.exo; si = +v.dataset.set;
  }
  const exo = _state.exercices[ei], set = exo?.sets[si];
  if (!set) return;
  let c = _state.chrono && _state.chrono.ei === ei && _state.chrono.si === si ? _state.chrono : null;

  if (action === 'chrono-start') {
    if (!c) {
      const input = _section.querySelector(`.focus-step-input[data-field="duree"][data-exo="${ei}"][data-set="${si}"]`);
      const target = input ? (parseFieldValue(_fieldOf(exo, 'duree'), input.value) || 0) : (Number(set.duree) || 0);
      const iso = exo.type_metrique === 'isometrique';
      c = _state.chrono = { ei, si, target, acc: 0, startedAt: iso ? null : Date.now(), countdownUntil: iso ? Date.now() + 3000 : null, alerted: false };
      _audioCtx ??= (() => { try { return new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } })();
    } else {
      c.startedAt = Date.now();
    }
    _keepAwake(true);
  }
  if (action === 'chrono-pause' && c) {
    if (c.countdownUntil) { c.countdownUntil = null; }
    else { c.acc = _chronoElapsed(c); c.startedAt = null; }
  }
  if (action === 'chrono-reset') { _state.chrono = null; _keepAwake(false); }
  if (action === 'chrono-stop' && c) {
    const secs = Math.round(_chronoElapsed(c));
    _state.chrono = null;
    _keepAwake(false);
    if (secs > 0) {
      set.duree = secs;
      showToast(`${_fmtChrono(secs)} enregistré pour cette série`, 'success');
    }
  }
  _persistState();
  render();
}

// Raccourci de valeur (durées d'un sport) : remplace la valeur saisie.
function _focusSet(ei, si, key, val) {
  const set = _state.exercices[ei]?.sets[si];
  if (!set || set.done || !Number.isFinite(val)) return;
  set[key] = val;
  _persistState();
  render();
}

function _focusStep(ei, si, key, dir) {
  const exo = _state.exercices[ei];
  const set = exo?.sets[si];
  // Le pas dépend du type de l'exercice : 5 s pour un gainage, 5 min pour
  // un sport, alors que plusieurs types partagent le champ « duree ».
  const f   = _fieldOf(exo, key);
  if (!set || !f || set.done) return;
  const input = _section.querySelector(`.focus-step-input[data-field="${key}"][data-exo="${ei}"][data-set="${si}"]`);
  const cur   = input ? (parseFieldValue(f, input.value) ?? 0) : (set[key] ?? 0);
  const next  = Math.max(0, Math.round((cur + f.step * dir) * 100) / 100);
  set[key] = next;
  if (input) input.value = formatFieldValue(f, next);
  _persistState();
}


// ── Enregistrement des séries (avec file hors-ligne) ─────────────────

async function _saveSerie(set, row) {
  let data = null;
  try { ({ data } = await supabase.from('series').insert(row).select().single()); } catch {}
  if (data?.id) { set.dbId = data.id; set.syncId = null; return; }
  // Réseau indisponible : la série reste validée et partira dès que
  // possible (js/sync-queue.js). Rien n'est perdu.
  set.dbId = null;
  set.syncId = enqueueInsert('series', row);
}

async function _deleteSerie(set) {
  if (set.syncId) { cancelQueued(set.syncId); set.syncId = null; return; }
  if (!set.dbId) return;
  let error = null;
  try { ({ error } = await supabase.from('series').delete().eq('id', set.dbId)); } catch (e) { error = e; }
  if (error) enqueueDelete('series', set.dbId);
  set.dbId = null;
}

// ── Records ───────────────────────────────────────────────────────────
// Record de charge (poids max) et de 1RM estimé, sur les séries de
// travail (hors échauffement). Un exercice jamais fait n'a pas de record
// à battre : sa première série n'est pas annoncée comme un record.

async function _loadRecord(exo) {
  if (!exo || (exo.type_metrique || DEFAULT_METRIC_TYPE) !== 'kg_reps') return;
  try {
    const { data } = await supabase.from('series')
      .select('poids_kg, repetitions')
      .eq('user_id', currentUser.id)
      .eq('exercice_nom', exo.nom)
      .neq('type_serie', 'echauffement')
      .order('poids_kg', { ascending: false })
      .limit(30);
    const rows = (data ?? []).filter(r => Number(r.poids_kg) > 0 && Number(r.repetitions) > 0);
    exo.record = rows.length
      ? { poids: Math.max(...rows.map(r => Number(r.poids_kg))), e1rm: Math.max(...rows.map(r => calc1RM(Number(r.poids_kg), Number(r.repetitions)))) }
      : { poids: 0, e1rm: 0, vide: true };
    _persistState();
  } catch {}
}

function _checkRecord(exo, set) {
  const rec = exo?.record;
  if (!rec || rec.vide || !isWorkingSet(set.type)) return;
  const poids = Number(set.poids), reps = Number(set.reps);
  if (!(poids > 0 && reps > 0)) return;
  const e1rm = calc1RM(poids, reps);
  const charge = poids > rec.poids;
  const rm     = e1rm > rec.e1rm;
  if (!charge && !rm) return;
  set.pr = charge ? 'charge' : '1rm';
  exo.record = { poids: Math.max(rec.poids, poids), e1rm: Math.max(rec.e1rm, e1rm) };
  const fmt = String(poids).replace('.', ',');
  showToast(charge ? `Nouveau record : ${exo.nom} à ${fmt} kg` : `Nouveau record : ${exo.nom}, ${fmt} kg × ${reps} (1RM estimé ${e1rm} kg)`, 'success', 4000);
}

function _recordsDuJour() {
  const out = [];
  for (const ex of _state?.exercices ?? []) {
    const best = ex.sets.filter(x => x.done && x.pr).sort((a, b) => calc1RM(b.poids, b.reps) - calc1RM(a.poids, a.reps))[0];
    if (best) out.push({ exercice: ex.nom, poids: best.poids, reps: best.reps, type: best.pr });
  }
  return out;
}

// ── Pendant le repos : ce qui vient ensuite ───────────────────────────

function _nextLabel(ei, si) {
  const blocks = _buildBlocks(_state.exercices);
  const fmtSet = (exo, k) => {
    const x = exo.sets[k];
    if (!x) return '';
    const fields = metricFields(exo.type_metrique);
    if (fields[0]?.key === 'poids') return `${String(x.poids ?? '?').replace('.', ',')} kg × ${x.reps ?? '?'}`;
    return fields.map(f => formatFieldDisplay(f, x[f.key])).join(' · ');
  };
  let bi = _findBlockContaining(blocks, ei);
  for (let i = Math.max(0, bi); i < blocks.length; i++) {
    const r = _blockPendingRound(blocks[i]);
    if (r === -1) continue;
    const idxs = blocks[i].type === 'single' ? [blocks[i].index] : blocks[i].indices;
    const exo = _state.exercices[idxs[0]];
    const nom = idxs.map(k => _state.exercices[k].nom).join(' + ');
    if (idxs.length > 1) return `${nom} · tour ${r + 1}/${_blockRoundsTotal(blocks[i])} · ${fmtSet(exo, r)}`;
    const quoi = isWorkingSet(exo.sets[r]?.type)
      ? `série ${_workingNumber(exo, r)}/${exo.sets.filter(x => isWorkingSet(x.type)).length}`
      : 'échauffement';
    return `${nom} · ${quoi} · ${fmtSet(exo, r)}`;
  }
  return 'Dernière série faite : tu peux terminer la séance';
}

// ── Suggestion de progression ─────────────────────────────────────────
// Si, la dernière fois, toutes les séries à la charge la plus haute ont
// atteint les répétitions prévues aujourd'hui, on propose d'augmenter.

function _increment(exo, poids) {
  const nom = (exo.nom || '').toLowerCase();
  if (nom.includes('haltère') || (exo.materiel || '').toLowerCase().includes('haltère')) return 2;
  if (poids < 20) return 1;
  return 2.5;
}

function _suggestion(exo) {
  if ((exo.type_metrique || DEFAULT_METRIC_TYPE) !== 'kg_reps') return null;
  const last = (exo.lastSets ?? []).filter(x => Number(x.poids) > 0 && Number(x.reps) > 0);
  if (last.length < 2) return null;
  const max = Math.max(...last.map(x => Number(x.poids)));
  const top = last.filter(x => Number(x.poids) === max);
  const pending = exo.sets.filter(x => !x.done && isWorkingSet(x.type));
  if (!pending.length) return null;
  const cible = Number(pending[0].reps) || 8;
  const prevu = Math.max(...pending.map(x => Number(x.poids) || 0));
  if (top.length < 2 || !top.every(x => Number(x.reps) >= cible) || prevu > max) return null;
  const sugg = Math.round((max + _increment(exo, max)) * 4) / 4;
  return { poids: sugg, depuis: max, reps: cible };
}

function _applySuggestion(ei) {
  const exo = _state.exercices[ei];
  const sg = exo && _suggestion(exo);
  if (!sg) return;
  exo.sets.forEach(x => { if (!x.done && isWorkingSet(x.type)) x.poids = sg.poids; });
  exo.suggestionAppliquee = true;
  render();
  _persistState();
}

// ── Disques à charger (barre de 20 kg) ────────────────────────────────

const _DISQUES = [25, 20, 15, 10, 5, 2.5, 1.25];

// Barre olympique de 20 kg uniquement (pas la barre EZ, ni la barre de
// traction ou les barres parallèles).
function _isBarre(exo) {
  const m = (exo.materiel || '').trim().toLowerCase();
  if (m) return m === 'barre';
  const n = (exo.nom || '').toLowerCase();
  return /\bbarre\b/.test(n) && !/(ez|traction|parallèle|fixe)/.test(n);
}

function _disquesLabel(poids) {
  const p = Number(poids);
  if (!(p >= 20)) return '';
  if (p === 20) return 'Barre seule';
  let reste = (p - 20) / 2;
  const out = [];
  for (const d of _DISQUES) {
    while (reste >= d - 1e-9) { out.push(d); reste -= d; }
  }
  const txt = out.map(d => String(d).replace('.', ',')).join(' + ');
  return `Par côté : ${txt}${reste > 0.01 ? ' (≈)' : ''}`;
}

// ── Échauffement automatique ──────────────────────────────────────────

function _arrondi(p, pas = 2.5) { return Math.max(0, Math.round(p / pas) * pas); }

function _addWarmup(ei) {
  const exo = _state.exercices[ei];
  if (!exo) return;
  const travail = exo.sets.find(x => isWorkingSet(x.type));
  const charge = Number(travail?.poids) || 0;
  if (charge <= 0) { showToast('Indique d’abord la charge de travail', 'warning'); return; }
  const base = _isBarre(exo) ? 20 : 0;
  const etapes = [[0.4, 10], [0.6, 5], [0.8, 3]];
  const echauf = etapes.map(([pct, reps]) => ({
    repos: 60, done: false, dbId: null, type: 'echauffement',
    poids: Math.max(base, _arrondi(charge * pct, charge >= 40 ? 2.5 : 1)), reps,
  }));
  exo.sets.unshift(...echauf);
  render();
  _persistState();
  showToast('3 séries d’échauffement ajoutées', 'success');
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
        <div class="exo-thumb" data-img-nom="${_esc(exo.nom)}"
          style="width:40px;height:40px;min-width:40px;border-radius:8px;overflow:hidden;
            background:var(--surface-3);display:flex;align-items:center;justify-content:center;flex-shrink:0">
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
      ${_setNumHTML(exo, set, ei, si)}
      <div class="set-prev" id="setprev-${ei}-${si}">${_esc(prev)}</div>
      ${fields.map((f, i) => `
        <input class="set-input${done ? ' set-input-done' : ''}" ${fieldInputAttrs(f)}
          placeholder="${_placeholder(f)}" value="${_esc(formatFieldValue(f, set[f.key]))}" style="width:${widths[i]}px"
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
          <div class="exercise-card-hint" style="display:flex;flex-direction:column;gap:4px;margin-top:2px">
            ${exos.map((e, idx) => `
              <span style="display:inline-flex;align-items:center;gap:6px">
                ${idx > 0 ? '<span style="font-size:10px;color:var(--text-muted);padding-left:2px">+</span>' : ''}
                <span class="exo-thumb" data-img-nom="${_esc(e.nom)}"
                  style="width:28px;height:28px;min-width:28px;border-radius:6px;overflow:hidden;
                    background:var(--surface-3);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">
                </span>
                <button data-action="show-exo-detail" data-exo="${indices[idx]}"
                  style="background:none;border:none;padding:0;cursor:pointer;font-size:inherit;color:inherit;font-weight:600;text-align:left">${_esc(e.nom)}</button>
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
        <input class="set-input${s.done ? ' set-input-done' : ''}" ${fieldInputAttrs(f)}
          placeholder="${_placeholder(f)}" value="${_esc(formatFieldValue(f, s[f.key]))}" style="width:${widths[i]}px"
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
        ${_setNumHTML(ex, s, ei, r)}
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
  _section.querySelector('#btn-view-focus')?.addEventListener('click', () => { _focusBlockIdx = null; _setViewMode('focus'); });
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

  // Vue focus : navigation et réglage des valeurs
  if (action === 'view-list')   { _setViewMode('list'); return; }
  if (action === 'focus-go')    { _focusBlockIdx = parseInt(btn.dataset.block, 10); render(); return; }
  if (action === 'focus-step')  { _focusStep(parseInt(exo), parseInt(setIdx), btn.dataset.field, parseInt(dir)); return; }
  if (action === 'focus-set')   { _focusSet(parseInt(exo), parseInt(setIdx), btn.dataset.field, Number(btn.dataset.val)); return; }
  if (action === 'focus-finish') { _confirmFinish(); return; }
  if (action?.startsWith('chrono-')) { _chronoAction(action); return; }
  if (action === 'apply-suggest') { _applySuggestion(parseInt(exo)); return; }
  if (action === 'add-warmup')    { _addWarmup(parseInt(exo)); return; }
  // Après une validation, le focus suit à nouveau la progression.
  if (action === 'toggle-done' || action === 'toggle-round') {
    _focusBlockIdx = null;
    const c = _state?.chrono;
    if (c && action === 'toggle-done' && c.ei === parseInt(exo) && c.si === parseInt(setIdx)) {
      const secs = Math.round(_chronoElapsed(c));
      if (secs > 0) _state.exercices[c.ei].sets[c.si].duree = secs;
      _state.chrono = null;
      _keepAwake(false);
    }
  }

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
  if (action === 'set-type')       _openSetTypePicker(parseInt(exo), parseInt(setIdx));
  if (action === 'make-superset')  _makeSuperset(parseInt(exo));
  if (action === 'break-superset') _breakSuperset(parseInt(exo));
  if (action === 'show-exo-detail') await _showExoDetail(parseInt(exo));
}

function _onInputChange(e) {
  const input = e.target.closest('[data-field]');
  if (!input) return;
  const { field, exo, set: setIdx } = input.dataset;
  const set = _state.exercices[parseInt(exo)]?.sets[parseInt(setIdx)];
  const f   = _fieldOf(_state.exercices[parseInt(exo)], field);
  if (!set || !f) return;
  set[field] = parseFieldValue(f, input.value);
}

// ── Actions ───────────────────────────────────────────────────────────

function _blankSet(fields, perf) {
  const set = { repos: null, done: false, dbId: null, type: DEFAULT_SET_TYPE };
  // Sans historique, une durée part de sa valeur par défaut (1 h pour un
  // sport) ; les autres champs restent vides.
  fields.forEach(f => { set[f.key] = perf?.sets?.[0]?.[f.key] ?? (f.key === 'duree' ? f.default : null) ?? null; });
  return set;
}

// ── Type de série ─────────────────────────────────────────────────────
// Numéro affiché dans la pastille : les séries d'échauffement portent une
// lettre au lieu d'un numéro et ne consomment pas de rang, pour que la
// numérotation visible corresponde aux séries de travail — la 1re série
// affichée reste la première qui compte, quel que soit l'échauffement.

function _workingNumber(exo, si) {
  let n = 0;
  for (let i = 0; i <= si; i++) {
    if (isWorkingSet(exo.sets[i]?.type)) n++;
  }
  return n;
}

function _setNumHTML(exo, set, ei, si) {
  const type  = setTypeOf(set?.type);
  const label = SET_TYPES[type].court || _workingNumber(exo, si);
  const cls   = [
    'set-num',
    set?.done ? 'set-num-done' : '',
    setTypeClass(type),
  ].filter(Boolean).join(' ');

  return `
    <button class="${cls}" data-action="set-type" data-exo="${ei}" data-set="${si}"
      aria-label="Type de série : ${_esc(setTypeLabel(type))}"
      title="${_esc(setTypeLabel(type))}">${label}</button>`;
}

function _openSetTypePicker(ei, si) {
  const exo = _state.exercices[ei];
  const set = exo?.sets[si];
  if (!set) return;

  const current = setTypeOf(set.type);

  openModal({
    title: 'Type de série',
    body: `
      <div style="display:flex;flex-direction:column;gap:var(--space-2)">
        ${Object.entries(SET_TYPES).map(([id, t]) => `
          <button data-type="${id}"
            style="display:flex;align-items:center;gap:var(--space-3);width:100%;
              padding:var(--space-3);border-radius:var(--radius-md);cursor:pointer;
              background:${id === current ? 'var(--color-primary-light)' : 'var(--surface-2)'};
              border:1.5px solid ${id === current ? 'var(--color-primary)' : 'transparent'};
              font-family:inherit;text-align:left">
            <span class="set-num ${setTypeClass(id)}">${t.court || '#'}</span>
            <span style="flex:1">
              <span style="display:block;font-size:var(--font-size-sm);font-weight:700;color:var(--text-primary)">${t.label}</span>
              <span style="display:block;font-size:var(--font-size-xs);color:var(--text-muted)">${t.aide}</span>
            </span>
            ${id === current ? `
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="3"
                stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0">
                <polyline points="20 6 9 17 4 12"/>
              </svg>` : ''}
          </button>`).join('')}
      </div>`,
  });

  document.getElementById('modal-body')
    .querySelectorAll('[data-type]')
    .forEach(btn => btn.addEventListener('click', () => {
      closeModal();
      _setSerieType(ei, si, btn.dataset.type);
    }));
}

async function _setSerieType(ei, si, type) {
  const set = _state.exercices[ei]?.sets[si];
  if (!set || setTypeOf(set.type) === setTypeOf(type)) return;

  set.type = setTypeOf(type);

  // Série déjà validée : la ligne existe en base, on la requalifie sur place
  // plutôt que de la supprimer et de la réécrire — l'horodatage d'origine
  // sert au calcul de la durée de séance.
  // Hors ligne, la modification part dans la file comme les autres.
  if (set.syncId) {
    patchQueuedInsert(set.syncId, { type_serie: set.type });
  } else if (set.dbId) {
    let error = null;
    try { ({ error } = await supabase.from('series').update({ type_serie: set.type }).eq('id', set.dbId)); } catch (e) { error = e; }
    if (error) enqueueUpdate('series', set.dbId, { type_serie: set.type });
  }

  render();
  _persistState();
}

async function _lookupExerciceMeta(nom) {
  try {
    const { getAllExercices } = await import('./exercices.js');
    const EXERCICES = await getAllExercices();
    const exo = EXERCICES.find(e => e.nom === nom);
    return { type_metrique: exo?.type_metrique || DEFAULT_METRIC_TYPE, muscles: exo?.muscles ?? [], materiel: exo?.materiel ?? null };
  } catch {
    return { type_metrique: DEFAULT_METRIC_TYPE, muscles: [], materiel: null };
  }
}

export async function addExercice(nom, { superset = false } = {}) {
  const { type_metrique, muscles, materiel } = await _lookupExerciceMeta(nom);
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
    nom, type_metrique, muscles, materiel, repos_inter: APP_CONFIG.defaultRestTime,
    lastPerf: perf?.summary ?? null, lastSets: perf?.sets ?? null,
    sets: Array.from({ length: nSets }, () => _blankSet(fields, perf)),
  });
  _loadRecord(_state.exercices.at(-1));

  render();
  _persistState();
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

  const { type_metrique, muscles, materiel } = await _lookupExerciceMeta(nom);
  const fields = metricFields(type_metrique);
  const perf   = await _fetchLastPerf(nom, type_metrique);

  // Garde le même nombre de séries que l'exercice remplacé : s'il fait
  // partie d'un superset, ses séries servent de "rounds" partagés avec les
  // autres exercices du bloc — en retomber à une seule série romprait
  // l'alignement et bloquerait la validation des rounds suivants.
  const nSets = Math.max(exo.sets.length, 1);

  _state.exercices[ei] = {
    nom, type_metrique, muscles, materiel, repos_inter: exo.repos_inter,
    lastPerf: perf?.summary ?? null, lastSets: perf?.sets ?? null,
    sets: Array.from({ length: nSets }, () => _blankSet(fields, perf)),
  };
  _loadRecord(_state.exercices[ei]);

  render();
  _persistState();
  showToast(`Remplacé par "${nom}"`, 'success');
}

export async function addExercices(noms) {
  if (!noms?.length) return;
  const metas = await Promise.all(noms.map(_lookupExerciceMeta));
  const perfs = await Promise.all(noms.map((n, i) => _fetchLastPerf(n, metas[i].type_metrique)));

  noms.forEach((nom, i) => {
    const { type_metrique, muscles, materiel } = metas[i];
    const fields = metricFields(type_metrique);
    _state.exercices.push({
      nom, type_metrique, muscles, materiel, repos_inter: APP_CONFIG.defaultRestTime,
      lastPerf: perfs[i]?.summary ?? null, lastSets: perfs[i]?.sets ?? null,
      sets: [_blankSet(fields, perfs[i])],
    });
    _loadRecord(_state.exercices.at(-1));
  });

  render();
  _persistState();
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

    // Une série planifiée sans valeur (programme créé à partir de noms
    // d'exercices) reprend la dernière perf réelle sur cet exercice.
    const perfSets = perfs[i]?.sets ?? [];
    const sets = plannedSeries
      ? plannedSeries.map((s, k) => {
          const set = { repos: s.repos ?? null, done: false, dbId: null, type: setTypeOf(s.type) };
          fields.forEach(f => { set[f.key] = s[f.key] ?? perfSets[k]?.[f.key] ?? perfSets[0]?.[f.key] ?? null; });
          return set;
        })
      : [_blankSet(fields, perfs[i])];

    _state.exercices.push({
      nom: ex.nom, type_metrique, muscles: metas[i].muscles, materiel: metas[i].materiel, repos_inter: ex.repos_inter,
      lastPerf: perfs[i]?.summary ?? null, lastSets: perfs[i]?.sets ?? null,
      sets,
    });
    _loadRecord(_state.exercices.at(-1));
  });

  render();
  _persistState();
}

async function _removeExo(ei) {
  if (!await confirmDialog(`Supprimer "${_state.exercices[ei]?.nom}" de la séance ?`)) return;
  _state.exercices.splice(ei, 1);
  render();
  _persistState();
}

function _addSerie(ei) {
  const blocks = _buildBlocks(_state.exercices);
  const block  = blocks[_findBlockContaining(blocks, ei)];

  // Une série ajoutée à la main est une série de travail, même si la
  // précédente était un échauffement : on ne recopie pas son type.
  if (block.type === 'superset') {
    block.indices.forEach(idx => {
      const exo    = _state.exercices[idx];
      const fields = metricFields(exo.type_metrique);
      const newSet = { repos: null, done: false, dbId: null, type: DEFAULT_SET_TYPE };
      fields.forEach(f => { newSet[f.key] = exo.sets.at(-1)?.[f.key] ?? null; });
      exo.sets.push(newSet);
    });
  } else {
    const exo    = _state.exercices[ei];
    const fields = metricFields(exo.type_metrique);
    const newSet = { repos: null, done: false, dbId: null, type: DEFAULT_SET_TYPE };
    fields.forEach(f => { newSet[f.key] = exo.sets.at(-1)?.[f.key] ?? null; });
    exo.sets.push(newSet);
  }

  render();
  _persistState();
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
  _persistState();
}

// ── Déplacer une série ────────────────────────────────────────────────

function _moveSerie(ei, si, dir) {
  const sets = _state.exercices[ei]?.sets;
  if (!sets) return;
  const newSi = si + dir;
  if (newSi < 0 || newSi >= sets.length) return;
  [sets[si], sets[newSi]] = [sets[newSi], sets[si]];
  render();
  _persistState();
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
  _persistState();
}

// ── Supprimer une série ────────────────────────────────────────────────

async function _removeSerie(ei, si) {
  const exo = _state.exercices[ei];
  if (!exo) return;
  if (exo.sets.length <= 1) { showToast('Minimum 1 série', 'warning'); return; }
  const set = exo.sets[si];
  if (set) await _deleteSerie(set);
  exo.sets.splice(si, 1);
  render();
  _persistState();
}

async function _removeRound(indices, r) {
  const maxSets = Math.max(...indices.map(i => _state.exercices[i].sets.length));
  if (maxSets <= 1) { showToast('Minimum 1 série', 'warning'); return; }
  for (const idx of indices) {
    const s = _state.exercices[idx].sets[r];
    if (s) await _deleteSerie(s);
  }
  indices.forEach(idx => _state.exercices[idx].sets.splice(r, 1));
  render();
  _persistState();
}

// ── Édition valeur série validée (enregistre en DB au blur) ──────────

async function _onInputBlur(e) {
  const input = e.target.closest('[data-field]');
  if (!input) return;
  const { field, exo: exoStr, set: setStr } = input.dataset;
  const set = _state.exercices[parseInt(exoStr)]?.sets[parseInt(setStr)];
  const f   = _fieldOf(_state.exercices[parseInt(exoStr)], field);
  if (!set || !f || !set.done) return;
  set[field] = parseFieldValue(f, input.value);
  const col = FIELD_DB_COLUMN[field];
  if (!col) return;
  if (set.syncId) { patchQueuedInsert(set.syncId, { [col]: set[field] }); _persistState(); return; }
  if (!set.dbId) return;
  let error = null;
  try { ({ error } = await supabase.from('series').update({ [col]: set[field] }).eq('id', set.dbId)); } catch (e) { error = e; }
  if (error) enqueueUpdate('series', set.dbId, { [col]: set[field] });
  _persistState();
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
    const btn = document.getElementById(`tmrbtn-${ei}-${si}`);
    if (btn) { btn.innerHTML = _SVG_TIMER; btn.classList.remove('set-btn-timer-active'); }
    row?.classList.remove('set-timer-active');
    return;
  }

  const input     = _section?.querySelector(`input[data-field="duree"][data-exo="${ei}"][data-set="${si}"]`);
  const targetSec = parseFieldValue(_fieldOf(_state.exercices[ei], 'duree'), input?.value) || 0;
  const startMs   = Date.now();

  function _fmt(secs) {
    const m = Math.floor(secs / 60), s = secs % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  }

  const btn = document.getElementById(`tmrbtn-${ei}-${si}`);
  if (btn) {
    btn.classList.add('set-btn-timer-active');
    btn.textContent = targetSec > 0 ? _fmt(targetSec) : '0s';
  }
  row?.classList.add('set-timer-active');

  const id = setInterval(() => {
    const elapsed   = Date.now() - startMs;
    const remaining = Math.max(0, targetSec * 1000 - elapsed);
    const btn2 = document.getElementById(`tmrbtn-${ei}-${si}`);
    const row2 = _section?.querySelector(`.set-row[data-exo="${ei}"][data-set="${si}"]`);
    if (!btn2 || !btn2.isConnected) { clearInterval(id); _setTimers.delete(key); return; }

    if (targetSec > 0) {
      btn2.textContent = _fmt(Math.ceil(remaining / 1000));
      if (remaining === 0) {
        clearInterval(id);
        _setTimers.delete(key);
        btn2.innerHTML = _SVG_TIMER;
        btn2.classList.remove('set-btn-timer-active');
        row2?.classList.remove('set-timer-active');
        row2?.classList.add('set-timer-finished');
        setTimeout(() => row2?.classList.remove('set-timer-finished'), 2000);
        navigator.vibrate?.(300);
      }
    } else {
      btn2.textContent = _fmt(Math.floor(elapsed / 1000));
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
  _persistState();
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
  _persistState();
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
      type_serie:    setTypeOf(set.type),
    };
    fields.forEach(f => { row[FIELD_DB_COLUMN[f.key]] = set[f.key] ?? null; });

    await _saveSerie(set, row);
    _checkRecord(exo, set);

    startRestTimer(set.repos, _nextLabel(ei, si));
  } else {
    set.done = false;
    set.pr = null;
    await _deleteSerie(set);
  }

  render();
  _persistState();
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
      type_serie:    setTypeOf(set.type),
    };
    fields.forEach(f => { row[FIELD_DB_COLUMN[f.key]] = set[f.key] ?? null; });

    await _saveSerie(set, row);
    _checkRecord(exo, set);
  }

  const last = _state.exercices[indices.at(-1)];
  startRestTimer(last?.sets[r]?.repos ?? APP_CONFIG.defaultRestTime, _nextLabel(indices.at(-1), r));

  render();
  _persistState();
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
      // Un échauffement à 40 kg ne doit pas s'afficher comme la charge de
      // référence de la dernière fois, ni servir de valeur pré-remplie.
      .neq('type_serie', 'echauffement')
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
      : fields.map(f => formatFieldDisplay(f, best[f.key])).join(' · ');

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

  if (!_state.exercices.length) {
    if (await confirmDialog('Aucun exercice enregistré. Annuler la séance ?', { confirmLabel: 'Annuler la séance' })) {
      let error = null;
      try { ({ error } = await supabase.from('seances').delete().eq('id', _state.seance.id)); } catch (e) { error = e; }
      if (error) enqueueDelete('seances', _state.seance.id);
      _reset();
    }
    return;
  }

  // Garde-fou supplémentaire avant d'ouvrir le récapitulatif détaillé — la
  // séance peut être terminée depuis n'importe où (bouton en haut de la
  // page, ou raccourci poubelle de la barre flottante), donc un tap
  // accidentel ne doit jamais suffire à elle seul.
  if (!await confirmDialog('Voulez-vous vraiment terminer cette séance ?', { confirmLabel: 'Terminer', danger: false })) return;

  // Un match saisi après coup dure ce qui a été saisi, pas le temps passé
  // dans l'appli.
  const duree = Math.max(await _realDurationMinutes(), Math.round(sportMinutes(_state.exercices)));

  const doneNoms = new Set(_state.exercices.filter(e => e.sets.some(s => s.done)).map(e => e.nom));
  const missingFromRoutine = (_state.routineExerciceNoms ?? []).filter(nom => !doneNoms.has(nom));

  const poidsKg  = await getPoidsActuel();
  const calories = estimateCaloriesSeance(_state.exercices, duree, poidsKg);
  const muscles  = musclesTravailles(_state.exercices);

  // Répartition : chaque série validée compte pour les muscles ciblés de
  // son exercice — le schéma et les barres montrent où est allé l'effort.
  const muscleCounts = new Map();
  let volume = 0;
  for (const e of _state.exercices) {
    const done = e.sets.filter(x => x.done);
    if (!done.length) continue;
    for (const m of e.muscles ?? []) muscleCounts.set(m, (muscleCounts.get(m) ?? 0) + done.length);
    for (const x of done) volume += (Number(x.poids) || 0) * (Number(x.reps) || 0);
  }
  const shares = muscleShares([...muscleCounts.entries()]);

  const _SVG_INFO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

  openModal({
    title: 'Récap de séance',
    body: `
      <div class="seance-finish-summary recap">
        <div class="recap-hero">
          <span class="recap-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></span>
          <p class="recap-name">${_esc(_state.seance.nom)}</p>
          <p class="recap-date">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>

        <div class="recap-grid">
          <div class="recap-stat"><p class="recap-stat-label">Durée</p><p class="recap-stat-value">${duree}<span> min</span></p></div>
          <div class="recap-stat"><p class="recap-stat-label">Volume</p><p class="recap-stat-value">${volume ? formatKg(volume).replace(' kg', '') : '—'}${volume ? '<span> kg</span>' : ''}</p></div>
          <div class="recap-stat"><p class="recap-stat-label">Séries</p><p class="recap-stat-value">${totalSets}</p></div>
          <div class="recap-stat"><p class="recap-stat-label">Calories</p><p class="recap-stat-value">${calories != null ? `${calories}<span> kcal</span>` : '—'}</p></div>
        </div>
        ${calories == null ? `
          <p class="recap-note">
            Renseigne ton poids dans ton <a href="#" id="link-profil-poids">profil</a> pour estimer les calories.
          </p>` : ''}

        ${_recordsDuJour().length ? `
          <div class="recap-section">
            <p class="recap-section-title">Records du jour</p>
            <ul class="recap-records">
              ${_recordsDuJour().map(r => `
                <li><span class="recap-record-star" aria-hidden="true">★</span>
                  <span class="recap-record-name">${_esc(r.exercice)}</span>
                  <span class="recap-record-val">${String(r.poids).replace('.', ',')} kg × ${r.reps}</span></li>`).join('')}
            </ul>
          </div>` : ''}

        ${shares.length ? `
          <div class="recap-section">
            <p class="recap-section-title">Muscles travaillés</p>
            <div class="recap-bodymap">${bodyMapHTML('finish')}</div>
            ${muscleBarsHTML(shares)}
          </div>` : ''}

        ${missingFromRoutine.length ? `
          <div class="recap-info">
            ${_SVG_INFO}
            <div>
              <p class="recap-info-title">Pas fait aujourd'hui : ${missingFromRoutine.map(_esc).join(', ')}</p>
              <p class="recap-info-desc">Ça reste dans ta routine pour la prochaine fois.</p>
            </div>
          </div>` : ''}

        <div class="form-group" style="margin-top:var(--space-4)">
          <label class="form-label" for="seance-notes-final">Notes de séance (facultatif)</label>
          <textarea class="form-input form-textarea" id="seance-notes-final" rows="3"
            placeholder="Sensations, douleurs, réglages de machine…"></textarea>
        </div>
      </div>`,
    footer: `
      <button class="btn btn-secondary" id="btn-continue-seance">Reprendre</button>
      <button class="btn btn-primary" id="btn-confirm-finish" style="flex:1">Enregistrer</button>`,
  });

  highlightMuscles(document.getElementById('modal-body'), shares.map(x => x.group), 'finish', muscleWeights(shares));

  document.getElementById('btn-continue-seance')?.addEventListener('click', closeModal);
  document.getElementById('btn-confirm-finish')?.addEventListener('click', () => _doFinish(duree, calories, muscles));
  document.getElementById('link-profil-poids')?.addEventListener('click', e => {
    e.preventDefault(); closeModal(); navigate('profil');
  });
}

async function _doFinish(duree, calories, muscles) {
  const notes = document.getElementById('seance-notes-final')?.value.trim() || null;
  closeModal();
  const changes = {
    duree_minutes: duree, notes,
    calories_estimees: calories,
    muscles_travailles: muscles.length ? muscles : null,
  };
  const records = _recordsDuJour();
  let error = null;
  try { ({ error } = await supabase.from('seances').update(changes).eq('id', _state.seance.id)); } catch (e) { error = e; }
  if (error) {
    // Hors-ligne : la fin de séance partira avec le reste de la file.
    enqueueUpdate('seances', _state.seance.id, changes);
    showToast(`Séance terminée — ${duree} min. Synchro dès que le réseau revient.`, 'success', 5000);
  } else {
    showToast(`Séance terminée — ${duree} min`, 'success', 4000);
  }
  // Records du jour : colonne facultative (seances.records). Si elle
  // n'existe pas encore, on ignore l'erreur.
  if (records.length) {
    try { await supabase.from('seances').update({ records }).eq('id', _state.seance.id); } catch {}
  }
  await _syncRoutineProgress();
  await _syncProgrammeProgress();
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

// Même chose pour une séance lancée depuis un programme : la séance du
// programme garde les charges réellement faites.
async function _syncProgrammeProgress() {
  const ref = _state?.programmeRef;
  if (!ref?.id || ref.day == null || ref.coach) return;
  try {
    const { data: prog, error } = await supabase
      .from('programmes').select('structure').eq('id', ref.id).single();
    if (error || !prog) return;
    const structure = Array.isArray(prog.structure) ? [...prog.structure] : [];
    const jour = structure[ref.day];
    if (!jour || typeof jour !== 'object') return;

    const exercices = (jour.exercices ?? []).map(ex => {
      const performed = _state.exercices.find(e => e.nom === ex.nom);
      if (!performed) return ex;
      const fields = metricFields(performed.type_metrique);
      const series = performed.sets.map((s, i) => {
        const base = ex.series?.[i] ?? { uid: _uid(), repos: s.repos ?? 90 };
        const out  = { ...base, type: s.type ?? base.type };
        fields.forEach(f => { out[f.key] = s[f.key]; });
        return out;
      });
      return { ...ex, type_metrique: performed.type_metrique, repos_inter: performed.repos_inter, series };
    });

    structure[ref.day] = { ...jour, exercices };
    await supabase.from('programmes').update({ structure }).eq('id', ref.id);
  } catch {
    // Best-effort, comme pour les routines.
  }
}

function _reset() {
  _focusBlockIdx = null;
  clearInterval(_chronoTick); _chronoTick = null;
  _keepAwake(false);
  clearInterval(_elapsedId);
  _elapsedId = null;
  hideTimer(); // une séance terminée/annulée ne doit pas laisser un repos en cours derrière elle
  _clearPersist();
  const onFinish = _onFinish;
  _state = _section = _onFinish = _startTime = null;
  _lastActiveExoIndex = null;
  if (onFinish) onFinish();
}
