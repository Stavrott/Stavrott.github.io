// ── Programmes ────────────────────────────────────────────────────────
// Un seul concept : un programme est une suite de séances, et chaque
// séance garde tout le détail (séries, charges, répétitions, repos,
// supersets). Les anciennes « routines » sont devenues les séances d'un
// programme « Mes séances » (voir _migrate), et les anciens programmes,
// qui ne stockaient que des noms d'exercices, ont été complétés.
import { currentUser }            from '../js/auth.js';
import { supabase }               from '../js/supabase.js';
import { navigate }               from '../js/router.js';
import { showToast, openModal, closeModal, showLoading, hideLoading, emptyState, confirmDialog, escapeHtml } from '../js/utils.js';
import { startSeance, addExercicesFromRoutine, setProgrammeRef } from './seance-active.js';
import { openRoutineBuilder }     from './routine-builder.js';
import { openRoutineView }        from './routine-view.js';
import { renderCoaching }         from './coaching.js';

// ── Programmes prédéfinis ─────────────────────────────────────────────

export const PREDEFINED = [
  {
    slug: 'ppl', nom: 'Push Pull Legs', badge: 'Intermédiaire', couleur: '#e8432a',
    description: '6 jours/semaine — alterne Pousser, Tirer et Jambes pour une hypertrophie maximale.',
    jours: [
      { nom: 'Push A', exercices: ['Développé couché', 'Développé incliné haltères', 'Élévations latérales', 'Élévations frontales', 'Triceps poulie haute'] },
      { nom: 'Pull A', exercices: ['Tractions', 'Rowing barre', 'Tirage horizontal câble', 'Curl biceps barre', 'Hammer curl'] },
      { nom: 'Legs A', exercices: ['Squat', 'Leg press', 'Soulevé de terre roumain', 'Mollets debout'] },
      { nom: 'Push B', exercices: ['Développé militaire', 'Développé couché', 'Dips', 'Élévations latérales', 'Skull crushers'] },
      { nom: 'Pull B', exercices: ['Tractions', 'Rowing barre', 'Curl biceps barre', 'Hammer curl', 'Tirage horizontal câble'] },
      { nom: 'Legs B', exercices: ['Squat', 'Fentes', 'Hip thrust', 'Leg press', 'Mollets debout'] },
    ],
  },
  {
    slug: 'fullbody', nom: 'Full Body', badge: 'Débutant', couleur: '#22c55e',
    description: '3 jours/semaine — entraîne tout le corps à chaque séance, idéal pour débuter ou maintenir.',
    jours: [
      { nom: 'Jour A', exercices: ['Squat', 'Développé couché', 'Rowing barre', 'Développé militaire', 'Curl biceps barre'] },
      { nom: 'Jour B', exercices: ['Soulevé de terre roumain', 'Développé incliné haltères', 'Tractions', 'Dips', 'Hammer curl'] },
      { nom: 'Jour C', exercices: ['Squat', 'Développé couché', 'Tirage horizontal câble', 'Élévations latérales', 'Mollets debout'] },
    ],
  },
  {
    slug: '5x5', nom: 'StrongLifts 5×5', badge: 'Force', couleur: '#f59e0b',
    description: '3 jours/semaine — progression linéaire sur les grands mouvements, conçu pour maximiser la force.',
    jours: [
      { nom: 'Séance A', exercices: ['Squat', 'Développé couché', 'Rowing barre'] },
      { nom: 'Séance B', exercices: ['Squat', 'Développé militaire', 'Soulevé de terre'] },
    ],
  },
];

const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const JOURS_LONGS  = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

// ── Données ───────────────────────────────────────────────────────────

const _SERIES_PAR_DEFAUT = () => [{ repos: 90 }, { repos: 90 }, { repos: 90 }];

// Un exercice d'ancien programme n'était qu'un nom : il devient un
// exercice détaillé avec 3 séries (charges reprises de la dernière perf
// au lancement de la séance).
function _normalizeExo(ex) {
  if (typeof ex === 'string') return { nom: ex, type_metrique: 'kg_reps', repos_inter: 90, series: _SERIES_PAR_DEFAUT() };
  return { ...ex, series: ex.series?.length ? ex.series : _SERIES_PAR_DEFAUT() };
}

export function normalizeJour(j) {
  if (typeof j === 'string') j = { nom: j };
  return {
    ...j,
    nom: j?.nom || 'Séance',
    joursSemaine: Array.isArray(j?.joursSemaine) ? j.joursSemaine : [],
    exercices: (j?.exercices ?? []).map(_normalizeExo),
  };
}

function _isLegacy(structure) {
  return (structure ?? []).some(j => typeof j === 'string' || (j?.exercices ?? []).some(e => typeof e === 'string' || !e?.series?.length));
}

// ── Migration (une seule fois, idempotente) ───────────────────────────

let _migration = null;
export function ensureProgrammesMigrated() {
  if (!currentUser) return Promise.resolve();
  _migration ??= _migrate().catch(e => { _migration = null; console.warn('[programmes] migration', e); });
  return _migration;
}

async function _migrate() {
  const uid = currentUser.id;
  const [{ data: routines, error: rErr }, { data: progs, error: pErr }] = await Promise.all([
    supabase.from('routines').select('*').eq('user_id', uid).order('created_at', { ascending: true }),
    supabase.from('programmes').select('*').eq('user_id', uid).order('created_at', { ascending: true }),
  ]);
  if (pErr) throw pErr;

  // 1. Anciens programmes : noms d'exercices → séances détaillées.
  for (const p of progs ?? []) {
    if (!_isLegacy(p.structure)) continue;
    const structure = (p.structure ?? []).map(normalizeJour);
    const { error } = await supabase.from('programmes').update({ structure }).eq('id', p.id);
    if (error) throw error;
    p.structure = structure;
  }

  // 2. Routines → séances du programme « Mes séances ».
  if (rErr || !routines?.length) return;

  const deja = new Set();
  let cible = null;
  for (const p of progs ?? []) {
    for (const j of p.structure ?? []) {
      if (j?.routine_id) { deja.add(j.routine_id); cible ??= p; }
    }
  }

  let ordre = [];
  try { ordre = JSON.parse(localStorage.getItem(`routine_order_${uid}`) ?? '[]') ?? []; } catch {}
  const rang = id => { const k = ordre.indexOf(id); return k === -1 ? Number.MAX_SAFE_INTEGER : k; };
  const aMigrer = routines.filter(r => !deja.has(r.id)).sort((a, b) => rang(a.id) - rang(b.id));

  if (aMigrer.length) {
    const jours = aMigrer.map(r => normalizeJour({ nom: r.nom, joursSemaine: [], routine_id: r.id, exercices: r.exercices ?? [] }));
    if (cible) {
      const { error } = await supabase.from('programmes').update({ structure: [...(cible.structure ?? []), ...jours] }).eq('id', cible.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('programmes').insert({
        user_id: uid, nom: 'Mes séances', description: 'Tes anciennes routines', structure: jours,
      });
      if (error) throw error;
    }
  }

  // Les routines sont désormais copiées intégralement dans le programme :
  // on garde une sauvegarde locale puis on les retire, pour qu'une séance
  // supprimée du programme ne réapparaisse pas à la migration suivante.
  try { localStorage.setItem(`routines_backup_${uid}`, JSON.stringify(routines)); } catch {}
  const ids = routines.map(r => r.id);
  await supabase.from('routines').delete().in('id', ids);
}

export async function fetchProgrammes() {
  await ensureProgrammesMigrated();
  const { data, error } = await supabase.from('programmes').select('*')
    .eq('user_id', currentUser.id).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(p => ({ ...p, structure: (p.structure ?? []).map(normalizeJour) }));
}

async function _saveStructure(prog) {
  const { error } = await supabase.from('programmes').update({ structure: prog.structure }).eq('id', prog.id);
  if (error) throw error;
}

// ── Lancement d'une séance ────────────────────────────────────────────

export async function lancerSeanceProgramme(prog, di) {
  const jour = prog?.structure?.[di];
  if (!jour) return;
  closeModal();
  showLoading();
  try {
    const section = document.getElementById('page-seances');
    await startSeance(jour.nom, section, () => navigate('seances'));
    // Programme d'un coach : en lecture seule, les charges faites ne
    // remontent pas dans son programme.
    setProgrammeRef({ id: prog.id, day: di, ...(prog.coach ? { coach: true } : {}) });
    await addExercicesFromRoutine({ id: null, exercices: jour.exercices });
    navigate('seances');
  } catch {
    showToast('Erreur lors du lancement de la séance', 'error');
  } finally {
    hideLoading();
  }
}

// ── Page ──────────────────────────────────────────────────────────────

let _section = null;
let _tab     = 'mine';
let _progs   = [];

export async function loadProgrammes(section, { tab } = {}) {
  _section = section;
  if (tab) _tab = tab;
  _render();
}

function _render() {
  _section.innerHTML = `
    <div class="tabs" id="prog-tabs">
      <button class="tab ${_tab === 'mine' ? 'active' : ''}" data-tab="mine">Les miens</button>
      <button class="tab ${_tab === 'coach' ? 'active' : ''}" data-tab="coach">Coaching</button>
      <button class="tab ${_tab === 'models' ? 'active' : ''}" data-tab="models">Modèles</button>
    </div>
    <div id="prog-content"></div>`;

  _section.querySelectorAll('#prog-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _tab = tab.dataset.tab;
      _render();
    });
  });

  if (_tab === 'models') _renderModels();
  else if (_tab === 'coach') renderCoaching(_section.querySelector('#prog-content'));
  else _renderMine();
}

const _SVG_PLAY   = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="7 4 20 12 7 20 7 4"/></svg>`;
const _SVG_UP     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>`;
const _SVG_DOWN   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;
const _SVG_PENCIL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>`;
const _SVG_PLUS   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

async function _renderMine() {
  const content = _section.querySelector('#prog-content');
  content.innerHTML = _skeletonList();
  try {
    _progs = await fetchProgrammes();
  } catch {
    content.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Erreur de chargement</p>`;
    return;
  }

  content.innerHTML = `
    ${_progs.length
      ? `<div class="prog-list">${_progs.map(_progCardHTML).join('')}</div>`
      : emptyState(
          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
          'Aucun programme',
          'Crée ton programme, ou pars d’un modèle (PPL, Full Body, 5×5).', null, null)}
    <button class="btn btn-primary btn-full" data-action="new-prog" style="margin-top:var(--space-4)">${_SVG_PLUS} Créer un programme</button>
    ${_progs.length ? '' : `<button class="btn btn-secondary btn-full" data-action="go-models" style="margin-top:var(--space-2)">Partir d’un modèle</button>`}`;

  content.onclick = _onMineClick;
}

function _progCardHTML(p) {
  const n = p.structure.length;
  return `
    <section class="prog-card" aria-label="${escapeHtml(p.nom)}">
      <div class="prog-card-head">
        <div style="min-width:0">
          <h3 class="prog-card-title">${escapeHtml(p.nom)}</h3>
          <p class="prog-card-sub">${n} séance${n > 1 ? 's' : ''}${p.description ? ` · ${escapeHtml(p.description)}` : ''}</p>
        </div>
        <button class="icon-btn" data-action="edit-prog" data-pid="${p.id}" aria-label="Modifier le programme ${escapeHtml(p.nom)}">${_SVG_PENCIL}</button>
      </div>
      <div class="prog-days">
        ${p.structure.map((j, di) => _dayRowHTML(p, j, di)).join('')}
      </div>
      <button class="prog-add-day" data-action="add-day" data-pid="${p.id}">${_SVG_PLUS} Ajouter une séance</button>
    </section>`;
}

function _dayRowHTML(p, j, di) {
  const nbEx     = j.exercices.length;
  const nbSeries = j.exercices.reduce((a, ex) => a + (ex.series?.length ?? 0), 0);
  const jours    = (j.joursSemaine ?? []).slice().sort().map(d => JOURS_COURTS[d]).join(' · ');
  const last     = di === p.structure.length - 1;
  return `
    <div class="prog-day">
      <div class="prog-day-move">
        <button class="icon-btn" data-action="move-day" data-pid="${p.id}" data-di="${di}" data-dir="-1"
          aria-label="Monter ${escapeHtml(j.nom)}" ${di === 0 ? 'disabled' : ''}>${_SVG_UP}</button>
        <button class="icon-btn" data-action="move-day" data-pid="${p.id}" data-di="${di}" data-dir="1"
          aria-label="Descendre ${escapeHtml(j.nom)}" ${last ? 'disabled' : ''}>${_SVG_DOWN}</button>
      </div>
      <button class="prog-day-body" data-action="view-day" data-pid="${p.id}" data-di="${di}">
        <span class="prog-day-name">${escapeHtml(j.nom)}</span>
        <span class="prog-day-meta">${nbEx} exercice${nbEx > 1 ? 's' : ''} · ${nbSeries} série${nbSeries > 1 ? 's' : ''}${jours ? ` · ${jours}` : ''}</span>
      </button>
      <button class="prog-day-play" data-action="launch-day" data-pid="${p.id}" data-di="${di}" aria-label="Lancer ${escapeHtml(j.nom)}">${_SVG_PLAY}</button>
    </div>`;
}

async function _onMineClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  const { action, pid } = btn.dataset;
  const di   = parseInt(btn.dataset.di, 10);
  const prog = _progs.find(p => p.id === pid);

  if (action === 'new-prog')   return _openProgEditor(null);
  if (action === 'go-models')  { _tab = 'models'; return _render(); }
  if (!prog) return;
  if (action === 'edit-prog')  return _openProgEditor(prog);
  if (action === 'launch-day') return lancerSeanceProgramme(prog, di);
  if (action === 'add-day')    return _editDay(prog, null);
  if (action === 'view-day') {
    const jour = prog.structure[di];
    return openRoutineView({ nom: jour.nom, exercices: jour.exercices }, {
      onEdit:  () => _editDay(prog, di),
      onStart: () => lancerSeanceProgramme(prog, di),
    });
  }
  if (action === 'move-day') {
    const to = di + parseInt(btn.dataset.dir, 10);
    if (to < 0 || to >= prog.structure.length) return;
    const s = prog.structure;
    [s[di], s[to]] = [s[to], s[di]];
    try { await _saveStructure(prog); } catch { showToast('Erreur lors de la sauvegarde', 'error'); }
    _renderMine();
  }
}

// Création / modification d'une séance du programme : l'éditeur détaillé
// (séries, charges, repos, supersets) est celui des anciennes routines.
function _editDay(prog, di) {
  const jour = di == null ? null : prog.structure[di];
  openRoutineBuilder(jour ? { nom: jour.nom, exercices: jour.exercices } : null, async state => {
    showLoading();
    try {
      const updated = normalizeJour({ ...(jour ?? { joursSemaine: [] }), nom: state.nom, exercices: state.exercices });
      if (di == null) prog.structure.push(updated);
      else prog.structure[di] = updated;
      await _saveStructure(prog);
      showToast(di == null ? 'Séance ajoutée' : 'Séance mise à jour', 'success');
      _tab = 'mine';
      if (_section?.isConnected) _render();
    } catch {
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      hideLoading();
    }
  });
}

// ── Nom, description, jours de la semaine, suppression ───────────────

function _openProgEditor(prog) {
  const draft = prog
    ? { nom: prog.nom, description: prog.description ?? '', jours: prog.structure.map(j => ({ nom: j.nom, joursSemaine: [...j.joursSemaine] })) }
    : { nom: '', description: '', jours: [] };
  const removed = new Set();

  const dayChips = (j, di) => JOURS_COURTS.map((l, d) => `
    <button type="button" class="day-chip ${j.joursSemaine.includes(d) ? 'is-on' : ''}" data-di="${di}" data-day="${d}"
      aria-pressed="${j.joursSemaine.includes(d)}" aria-label="${JOURS_LONGS[d]}">${l}</button>`).join('');

  const bodyHTML = () => `
    <div style="display:flex;flex-direction:column;gap:var(--space-4)">
      <div class="form-group">
        <label class="form-label" for="pe-nom">Nom du programme</label>
        <input class="form-input" id="pe-nom" type="text" placeholder="Push Pull Legs…" value="${escapeHtml(draft.nom)}">
      </div>
      <div class="form-group">
        <label class="form-label" for="pe-desc">Description (facultatif)</label>
        <input class="form-input" id="pe-desc" type="text" placeholder="ex : 3 séances par semaine" value="${escapeHtml(draft.description)}">
      </div>
      ${prog ? `
        <div>
          <p class="form-label">Séances et jours prévus</p>
          <div style="display:flex;flex-direction:column;gap:var(--space-3)">
            ${draft.jours.map((j, di) => removed.has(di) ? '' : `
              <div class="pe-day">
                <div class="pe-day-head">
                  <span class="pe-day-name">${escapeHtml(j.nom)}</span>
                  <button type="button" class="icon-btn" data-remove-day="${di}" aria-label="Retirer ${escapeHtml(j.nom)}" style="color:var(--color-error)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                  </button>
                </div>
                <div class="day-chips">${dayChips(j, di)}</div>
              </div>`).join('') || '<p style="font-size:var(--font-size-sm);color:var(--text-muted)">Aucune séance pour l’instant.</p>'}
          </div>
        </div>
        <button type="button" class="btn btn-ghost btn-full" id="pe-delete" style="color:var(--color-error)">Supprimer le programme</button>` : ''}
    </div>`;

  openModal({
    title: prog ? 'Modifier le programme' : 'Nouveau programme',
    body: bodyHTML(),
    footer: `
      <button class="btn btn-secondary" id="pe-cancel">Annuler</button>
      <button class="btn btn-primary" id="pe-save" style="flex:1">${prog ? 'Enregistrer' : 'Créer'}</button>`,
  });

  const mb = document.getElementById('modal-body');
  const syncFields = () => {
    draft.nom = mb.querySelector('#pe-nom')?.value.trim() ?? draft.nom;
    draft.description = mb.querySelector('#pe-desc')?.value.trim() ?? draft.description;
  };
  const done = () => { mb.onclick = null; closeModal(); };

  mb.onclick = async (e) => {
    const chip = e.target.closest('.day-chip');
    if (chip) {
      syncFields();
      const j = draft.jours[parseInt(chip.dataset.di, 10)];
      const d = parseInt(chip.dataset.day, 10);
      j.joursSemaine = j.joursSemaine.includes(d) ? j.joursSemaine.filter(x => x !== d) : [...j.joursSemaine, d];
      mb.innerHTML = bodyHTML();
      return;
    }
    const rm = e.target.closest('[data-remove-day]');
    if (rm) {
      syncFields();
      const di = parseInt(rm.dataset.removeDay, 10);
      if (!await confirmDialog(`Retirer « ${draft.jours[di].nom} » du programme ? (Tu pourras encore annuler en fermant sans enregistrer.)`, { confirmLabel: 'Retirer' })) {
        _openProgEditorResume();
        return;
      }
      removed.add(di);
      _openProgEditorResume();
      return;
    }
    if (e.target.closest('#pe-delete')) {
      if (!await confirmDialog(`Supprimer le programme « ${prog.nom} » et toutes ses séances ?`, { confirmLabel: 'Supprimer' })) {
        _openProgEditorResume();
        return;
      }
      try {
        const { error } = await supabase.from('programmes').delete().eq('id', prog.id);
        if (error) throw error;
        mb.onclick = null;
        showToast('Programme supprimé', 'success');
        _render();
      } catch { showToast('Erreur lors de la suppression', 'error'); }
    }
  };

  // confirmDialog réutilise la modale : on rouvre l'éditeur dans son état.
  function _openProgEditorResume() {
    openModal({
      title: prog ? 'Modifier le programme' : 'Nouveau programme',
      body: bodyHTML(),
      footer: `
        <button class="btn btn-secondary" id="pe-cancel">Annuler</button>
        <button class="btn btn-primary" id="pe-save" style="flex:1">${prog ? 'Enregistrer' : 'Créer'}</button>`,
    });
    document.getElementById('modal-body').onclick = mb.onclick;
    bindFooter();
  }

  function bindFooter() {
    document.getElementById('pe-cancel')?.addEventListener('click', done);
    document.getElementById('pe-save')?.addEventListener('click', async () => {
      syncFields();
      if (!draft.nom) { showToast('Donne un nom au programme', 'warning'); return; }
      showLoading();
      try {
        if (prog) {
          const structure = prog.structure
            .map((j, di) => removed.has(di) ? null : { ...j, joursSemaine: draft.jours[di].joursSemaine })
            .filter(Boolean);
          const { error } = await supabase.from('programmes')
            .update({ nom: draft.nom, description: draft.description || null, structure }).eq('id', prog.id);
          if (error) throw error;
          done();
          showToast('Programme enregistré', 'success');
          _render();
        } else {
          const { data, error } = await supabase.from('programmes')
            .insert({ user_id: currentUser.id, nom: draft.nom, description: draft.description || null, structure: [] })
            .select().single();
          if (error) throw error;
          done();
          showToast('Programme créé : ajoute sa première séance', 'success');
          _tab = 'mine';
          _render();
          _editDay({ ...data, structure: [] }, null);
        }
      } catch {
        showToast('Erreur lors de la sauvegarde', 'error');
      } finally {
        hideLoading();
      }
    });
  }
  bindFooter();
}

// ── Modèles ───────────────────────────────────────────────────────────

function _renderModels() {
  const content = _section.querySelector('#prog-content');
  content.innerHTML = `
    <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-4)">
      Copie un modèle dans tes programmes, puis ajuste les séances à ta guise.
    </p>
    <div style="display:flex;flex-direction:column;gap:var(--space-3)">
      ${PREDEFINED.map(p => `
        <button class="prog-model" data-slug="${p.slug}">
          <span class="prog-model-badge">${escapeHtml(p.badge)}</span>
          <span class="prog-model-title">${escapeHtml(p.nom)}</span>
          <span class="prog-model-desc">${escapeHtml(p.description)}</span>
          <span class="prog-model-meta">${p.jours.length} séances</span>
        </button>`).join('')}
    </div>`;

  content.onclick = (e) => {
    const card = e.target.closest('[data-slug]');
    if (!card) return;
    const model = PREDEFINED.find(p => p.slug === card.dataset.slug);
    if (model) _openModel(model);
  };
}

function _openModel(model) {
  openModal({
    title: model.nom,
    body: `
      <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-4)">${escapeHtml(model.description)}</p>
      <div style="display:flex;flex-direction:column;gap:var(--space-3)">
        ${model.jours.map(j => `
          <div class="pe-day">
            <p class="pe-day-name">${escapeHtml(j.nom)}</p>
            <p style="font-size:var(--font-size-xs);color:var(--text-secondary);margin-top:4px">${j.exercices.map(escapeHtml).join(' · ')}</p>
          </div>`).join('')}
      </div>`,
    footer: `
      <button class="btn btn-secondary" id="model-cancel">Fermer</button>
      <button class="btn btn-primary" id="model-use" style="flex:1">Utiliser ce modèle</button>`,
  });
  document.getElementById('model-cancel')?.addEventListener('click', closeModal);
  document.getElementById('model-use')?.addEventListener('click', async () => {
    showLoading();
    try {
      const structure = model.jours.map(j => normalizeJour({ nom: j.nom, joursSemaine: [], exercices: j.exercices }));
      const { error } = await supabase.from('programmes')
        .insert({ user_id: currentUser.id, nom: model.nom, description: model.description, structure });
      if (error) throw error;
      closeModal();
      showToast(`« ${model.nom} » ajouté à tes programmes`, 'success');
      _tab = 'mine';
      _render();
    } catch {
      showToast('Erreur lors de la copie du modèle', 'error');
    } finally {
      hideLoading();
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────

function _skeletonList() {
  return `
    <div class="skeleton-list-wrapper" style="display:flex;flex-direction:column;gap:var(--space-3)">
      <div class="skeleton skeleton-card" style="height:140px"></div>
      <div class="skeleton skeleton-card" style="height:140px"></div>
    </div>`;
}
