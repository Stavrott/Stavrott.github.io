import { currentUser }            from '../js/auth.js';
import { supabase }               from '../js/supabase.js';
import { navigate }               from '../js/router.js';
import { showToast, openModal, closeModal, showLoading, hideLoading, emptyState } from '../js/utils.js';
import { startSeance, addExercices } from './seance-active.js';

// ── Programmes prédéfinis ─────────────────────────────────────────────

const PREDEFINED = [
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

// ── État local ────────────────────────────────────────────────────────

let _section   = null;
let _activeTab = 'predefined';

// ── Point d'entrée ────────────────────────────────────────────────────

export async function loadProgrammes(section) {
  _section = section;
  _render();
}

function _render() {
  _section.innerHTML = `
    <div class="tabs" id="prog-tabs">
      <button class="tab ${_activeTab === 'predefined' ? 'active' : ''}" data-tab="predefined">Prédéfinis</button>
      <button class="tab ${_activeTab === 'custom'     ? 'active' : ''}" data-tab="custom">Mes programmes</button>
    </div>
    <div id="prog-content"></div>`;

  _section.querySelectorAll('#prog-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _activeTab = tab.dataset.tab;
      _section.querySelectorAll('#prog-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _activeTab === 'predefined' ? _renderPredefined() : _renderCustom();
    });
  });

  _activeTab === 'predefined' ? _renderPredefined() : _renderCustom();
}

// ── Onglet Prédéfinis ─────────────────────────────────────────────────

function _renderPredefined() {
  const content = _section.querySelector('#prog-content');
  content.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:var(--space-3)">
      ${PREDEFINED.map(p => _progCard(p)).join('')}
    </div>`;

  content.querySelectorAll('[data-prog-slug]').forEach(card => {
    card.addEventListener('click', () => {
      const prog = PREDEFINED.find(p => p.slug === card.dataset.progSlug);
      if (prog) _openProgDetail(prog);
    });
  });
}

function _progCard(p) {
  return `
    <div class="card card-interactive" data-prog-slug="${p.slug}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:var(--space-3)">
        <div>
          <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-1)">
            <div style="width:10px;height:10px;border-radius:50%;background:${p.couleur};flex-shrink:0"></div>
            <h3 style="font-size:var(--font-size-md);font-weight:800">${p.nom}</h3>
          </div>
          <p style="font-size:var(--font-size-sm);color:var(--text-secondary);line-height:1.5">${p.description}</p>
        </div>
        <span class="badge badge-primary" style="flex-shrink:0;margin-left:var(--space-3)">${p.badge}</span>
      </div>
      <div style="display:flex;gap:var(--space-2);flex-wrap:wrap">
        ${p.jours.map(j => `<span class="chip" style="pointer-events:none;font-size:11px">${j.nom}</span>`).join('')}
      </div>
      <div style="display:flex;align-items:center;justify-content:flex-end;margin-top:var(--space-3)">
        <span style="font-size:var(--font-size-xs);color:var(--text-muted);font-weight:600">Voir le détail →</span>
      </div>
    </div>`;
}

// ── Détail d'un programme prédéfini ───────────────────────────────────

function _openProgDetail(prog) {
  openModal({
    title: prog.nom,
    body: `
      <div class="prog-detail">
        <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-4)">
          <span class="badge badge-primary">${prog.badge}</span>
          <span class="badge badge-muted">${prog.jours.length} jours</span>
        </div>
        <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-5);line-height:1.6">
          ${prog.description}
        </p>
        <div class="prog-jours">
          ${prog.jours.map((j, i) => _jourAccordion(j, i)).join('')}
        </div>
      </div>`,
  });

  // Accordéons
  document.querySelectorAll('.prog-jour-header').forEach(h => {
    h.addEventListener('click', () => {
      const body = h.nextElementSibling;
      const chevron = h.querySelector('.prog-chevron');
      const isOpen = !body.classList.contains('hidden');
      body.classList.toggle('hidden', isOpen);
      if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
    });
  });

  // Boutons Lancer
  document.querySelectorAll('[data-lancer-jour]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const jourIndex = parseInt(btn.dataset.lancerJour);
      const jour = prog.jours[jourIndex];
      await _lancerJour(prog, jour);
    });
  });
}

const _JS_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const _JS_NAMES  = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function _jourAccordion(jour, i) {
  const isFirst = i === 0;
  const days    = (jour.joursSemaine ?? []).map(d => _JS_LABELS[d]).join(' · ');
  return `
    <div class="prog-jour" style="margin-bottom:var(--space-3)">
      <div class="prog-jour-header ${isFirst ? 'prog-jour-open' : ''}">
        <div style="display:flex;align-items:center;gap:var(--space-3);flex:1">
          <div class="prog-jour-num">${i + 1}</div>
          <div>
            <span style="font-weight:800;font-size:var(--font-size-sm)">${jour.nom}</span>
            ${days ? `<p style="font-size:11px;color:var(--color-primary);font-weight:700;margin-top:1px">${days}</p>` : ''}
          </div>
          <span style="font-size:var(--font-size-xs);color:var(--text-muted);margin-left:auto">${jour.exercices.length} exos</span>
        </div>
        <svg class="prog-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
          style="width:16px;height:16px;color:var(--text-muted);transition:transform var(--transition-base);${isFirst ? 'transform:rotate(180deg)' : ''}">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="prog-jour-body ${isFirst ? '' : 'hidden'}">
        <ul class="prog-exo-list">
          ${jour.exercices.map(e => `
            <li class="prog-exo-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                style="width:14px;height:14px;color:var(--color-primary);flex-shrink:0">
                <path d="M6 5v14M18 5v14M3 8h3m12 0h3M3 16h3m12 0h3"/>
              </svg>
              ${e}
            </li>`).join('')}
        </ul>
        <button class="btn btn-primary btn-full" data-lancer-jour="${i}" style="margin-top:var(--space-3)">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Lancer ce jour
        </button>
      </div>
    </div>`;
}

// ── Lancer une séance depuis un programme ─────────────────────────────

async function _lancerJour(prog, jour) {
  closeModal();
  showLoading();
  try {
    const nom     = `${prog.nom} — ${jour.nom}`;
    const section = document.getElementById('page-seances');
    await startSeance(nom, section, () => navigate('seances'));
    await addExercices(jour.exercices);
    navigate('seances');
  } catch {
    showToast('Erreur lors du lancement de la séance', 'error');
  } finally {
    hideLoading();
  }
}

// ── Onglet Mes programmes ─────────────────────────────────────────────

async function _renderCustom() {
  const content = _section.querySelector('#prog-content');
  content.innerHTML = `
    ${_skeletonList()}
    <button class="btn btn-primary btn-full" id="btn-create-prog" style="margin-top:var(--space-4)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
        style="width:18px;height:18px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Créer un programme
    </button>`;

  content.querySelector('#btn-create-prog')?.addEventListener('click', () => _openBuilder());

  try {
    const { data, error } = await supabase
      .from('programmes')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const listEl = document.createElement('div');
    if (!data?.length) {
      listEl.innerHTML = emptyState(
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
        'Aucun programme',
        'Créez votre propre programme personnalisé.', null, null
      );
    } else {
      listEl.innerHTML = `<div class="item-list">${data.map(_customProgItem).join('')}</div>`;
    }

    // Remplace le skeleton
    content.querySelector('.skeleton-list-wrapper')?.replaceWith(listEl);

    // Boutons
    listEl.querySelectorAll('[data-action-prog]').forEach(btn => {
      const { actionProg, progId } = btn.dataset;
      const prog = data.find(p => p.id === progId);
      if (!prog) return;
      if (actionProg === 'edit')    btn.addEventListener('click', e => { e.stopPropagation(); _openBuilder(prog); });
      if (actionProg === 'delete')  btn.addEventListener('click', e => { e.stopPropagation(); _deleteCustomProg(prog, data); });
      if (actionProg === 'lancer')  btn.addEventListener('click', e => { e.stopPropagation(); _openJourPicker(prog); });
    });

    listEl.querySelectorAll('[data-prog-id]').forEach(item => {
      const prog = data.find(p => p.id === item.dataset.progId);
      if (prog) item.addEventListener('click', () => _openJourPicker(prog));
    });

  } catch {
    content.querySelector('.skeleton-list-wrapper')?.remove();
    content.insertAdjacentHTML('afterbegin', `<p style="color:var(--text-muted);text-align:center;padding:var(--space-4)">Erreur de chargement</p>`);
  }
}

function _customProgItem(p) {
  const jours = p.structure?.length ?? 0;
  // Construire la chaîne des jours de la semaine assignés
  const todayDow = (new Date().getDay() + 6) % 7; // 0=lundi
  const todayJour = (p.structure ?? []).find(j => (j.joursSemaine ?? []).includes(todayDow));
  return `
    <div class="list-item clickable" data-prog-id="${p.id}">
      <div class="item-icon" ${todayJour ? 'style="background:var(--color-primary-light);color:var(--color-primary)"' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </div>
      <div class="item-body">
        <p class="item-title">${p.nom}</p>
        <p class="item-subtitle">${p.description || ''} ${jours ? `• ${jours} jour${jours > 1 ? 's' : ''}` : ''}</p>
        ${todayJour ? `<p style="font-size:11px;color:var(--color-primary);font-weight:700;margin-top:3px">Aujourd'hui : ${todayJour.nom}</p>` : ''}
      </div>
      <div style="display:flex;gap:var(--space-1)">
        <button class="icon-btn" data-action-prog="edit" data-prog-id="${p.id}" title="Modifier">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="icon-btn" data-action-prog="delete" data-prog-id="${p.id}" title="Supprimer"
          style="color:var(--color-error)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
          </svg>
        </button>
      </div>
    </div>`;
}

// ── Supprimer un programme custom ─────────────────────────────────────

async function _deleteCustomProg(prog) {
  if (!confirm(`Supprimer le programme "${prog.nom}" ?`)) return;
  try {
    await supabase.from('programmes').delete().eq('id', prog.id);
    showToast('Programme supprimé', 'success');
    _renderCustom();
  } catch {
    showToast('Erreur lors de la suppression', 'error');
  }
}

// ── Picker de jour (programme custom) ────────────────────────────────

function _openJourPicker(prog) {
  const jours = prog.structure ?? [];
  if (!jours.length) {
    showToast('Ce programme n\'a aucun jour configuré', 'warning');
    return;
  }
  if (jours.length === 1) { _lancerJour(prog, jours[0]); return; }

  openModal({
    title: `Lancer — ${prog.nom}`,
    body: `
      <div style="display:flex;flex-direction:column;gap:var(--space-2)">
        ${jours.map((j, i) => `
          <button class="list-item clickable" data-jour-index="${i}" style="text-align:left;width:100%">
            <div class="prog-jour-num" style="flex-shrink:0">${i + 1}</div>
            <div class="item-body">
              <p class="item-title">${j.nom}</p>
              <p class="item-subtitle">${(j.exercices ?? []).length} exercices</p>
            </div>
            <span class="item-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg></span>
          </button>`).join('')}
      </div>`,
  });

  document.querySelectorAll('[data-jour-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      const jour = jours[parseInt(btn.dataset.jourIndex)];
      _lancerJour(prog, jour);
    });
  });
}

// ── Builder de programme ──────────────────────────────────────────────

let _builderState = null;

function _openBuilder(existing = null) {
  _builderState = existing
    ? { id: existing.id, nom: existing.nom, description: existing.description || '', jours: JSON.parse(JSON.stringify(existing.structure || [])) }
    : { id: null, nom: '', description: '', jours: [] };

  _renderBuilder();
}

function _renderBuilder() {
  openModal({
    title: _builderState.id ? 'Modifier le programme' : 'Nouveau programme',
    body: `
      <div style="display:flex;flex-direction:column;gap:var(--space-4)">
        <div class="form-group">
          <label class="form-label">Nom du programme</label>
          <input class="form-input" id="builder-nom" type="text"
            placeholder="Mon programme PPL…" value="${_builderState.nom}">
        </div>
        <div class="form-group">
          <label class="form-label">Description (facultatif)</label>
          <input class="form-input" id="builder-desc" type="text"
            placeholder="ex: 5 jours/semaine, hypertrophie…" value="${_builderState.description}">
        </div>
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3)">
            <label class="form-label" style="margin:0">Jours d'entraînement</label>
            <button class="btn btn-sm btn-secondary" id="builder-add-jour">+ Jour</button>
          </div>
          <div id="builder-jours-list">
            ${_builderState.jours.map((j, i) => _jourBuilderHTML(j, i)).join('')}
          </div>
        </div>
      </div>`,
    footer: `
      <button class="btn btn-secondary" id="builder-cancel">Annuler</button>
      <button class="btn btn-primary" id="builder-save" style="flex:1">
        ${_builderState.id ? 'Enregistrer' : 'Créer le programme'}
      </button>`,
  });

  _bindBuilderEvents();
}

const JOURS_SEMAINE = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function _jourBuilderHTML(jour, ji) {
  const selected = jour.joursSemaine ?? [];
  return `
    <div class="builder-jour-card" data-jour-index="${ji}">
      <div class="builder-jour-header">
        <input class="form-input builder-jour-nom" type="text"
          placeholder="Nom du jour (ex: Push A)" value="${jour.nom}"
          data-jour="${ji}" style="flex:1">
        <button class="icon-btn builder-remove-jour" data-jour="${ji}" style="color:var(--color-error)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <!-- Sélecteur jours de la semaine -->
      <div style="display:flex;gap:6px;margin-bottom:var(--space-3)" class="builder-days-row" data-jour="${ji}">
        ${JOURS_SEMAINE.map((l, di) => `
          <button class="builder-day-btn ${selected.includes(di) ? 'active' : ''}"
            data-jour="${ji}" data-day="${di}"
            style="flex:1;padding:4px 2px;border-radius:var(--radius-sm);font-size:11px;font-weight:700;
              border:1.5px solid ${selected.includes(di) ? 'var(--color-primary)' : 'var(--border)'};
              background:${selected.includes(di) ? 'var(--color-primary-light)' : 'transparent'};
              color:${selected.includes(di) ? 'var(--color-primary)' : 'var(--text-muted)'};
              transition:all var(--transition-fast)">
            ${l}
          </button>`).join('')}
      </div>
      <div class="builder-exo-list" data-exos="${ji}">
        ${(jour.exercices || []).map((e, ei) => _exoBuilderHTML(e, ji, ei)).join('')}
      </div>
      <button class="btn btn-ghost btn-sm builder-add-exo" data-jour="${ji}"
        style="width:100%;justify-content:center;margin-top:var(--space-2);border:1px dashed var(--border)">
        + Ajouter un exercice
      </button>
    </div>`;
}

function _exoBuilderHTML(nom, ji, ei) {
  return `
    <div class="builder-exo-row" data-jour="${ji}" data-exo="${ei}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        style="width:14px;height:14px;color:var(--color-primary);flex-shrink:0">
        <path d="M6 5v14M18 5v14M3 8h3m12 0h3M3 16h3m12 0h3"/>
      </svg>
      <span style="flex:1;font-size:var(--font-size-sm)">${nom}</span>
      <button class="icon-btn builder-remove-exo" data-jour="${ji}" data-exo="${ei}"
        style="width:28px;height:28px;color:var(--text-muted)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>`;
}

function _bindBuilderEvents() {
  const overlay = document.getElementById('modal-overlay');

  document.getElementById('builder-cancel')?.addEventListener('click', closeModal);

  // Ajouter un jour
  document.getElementById('builder-add-jour')?.addEventListener('click', () => {
    _syncBuilderFromDOM();
    _builderState.jours.push({ nom: `Jour ${_builderState.jours.length + 1}`, exercices: [] });
    _refreshBuilderJours();
  });

  // Délégation sur la liste des jours
  document.getElementById('builder-jours-list')?.addEventListener('click', async e => {
    // Toggle jour de la semaine
    const dayBtn = e.target.closest('.builder-day-btn');
    if (dayBtn) {
      _syncBuilderFromDOM();
      const ji  = parseInt(dayBtn.dataset.jour);
      const day = parseInt(dayBtn.dataset.day);
      const jour = _builderState.jours[ji];
      if (!jour.joursSemaine) jour.joursSemaine = [];
      const idx = jour.joursSemaine.indexOf(day);
      if (idx >= 0) jour.joursSemaine.splice(idx, 1);
      else           jour.joursSemaine.push(day);
      _refreshBuilderJours();
      return;
    }
    // Supprimer jour
    const rmJour = e.target.closest('.builder-remove-jour');
    if (rmJour) {
      _syncBuilderFromDOM();
      _builderState.jours.splice(parseInt(rmJour.dataset.jour), 1);
      _refreshBuilderJours();
      return;
    }
    // Supprimer exercice
    const rmExo = e.target.closest('.builder-remove-exo');
    if (rmExo) {
      _syncBuilderFromDOM();
      _builderState.jours[parseInt(rmExo.dataset.jour)].exercices.splice(parseInt(rmExo.dataset.exo), 1);
      _refreshBuilderJours();
      return;
    }
    // Ajouter exercice
    const addExo = e.target.closest('.builder-add-exo');
    if (addExo) {
      const ji = parseInt(addExo.dataset.jour);
      _syncBuilderFromDOM();
      await _openExoPickerForBuilder(ji);
    }
  });

  // Sauvegarder
  document.getElementById('builder-save')?.addEventListener('click', _saveBuilder);
}

function _syncBuilderFromDOM() {
  document.querySelectorAll('.builder-jour-nom').forEach(input => {
    const ji = parseInt(input.dataset.jour);
    if (_builderState.jours[ji]) _builderState.jours[ji].nom = input.value.trim() || `Jour ${ji + 1}`;
  });
  const nomEl  = document.getElementById('builder-nom');
  const descEl = document.getElementById('builder-desc');
  if (nomEl)  _builderState.nom         = nomEl.value.trim();
  if (descEl) _builderState.description = descEl.value.trim();
}

function _refreshBuilderJours() {
  const list = document.getElementById('builder-jours-list');
  if (list) {
    list.innerHTML = _builderState.jours.map((j, i) => _jourBuilderHTML(j, i)).join('');
    _bindBuilderEvents(); // rebind après refresh
  }
}

async function _openExoPickerForBuilder(jourIndex) {
  const { getAllExercices } = await import('./exercices.js');
  const EXERCICES = await getAllExercices();
  const GROUPES = ['Tous', ...new Set(EXERCICES.map(e => e.groupe))];
  let search = '', groupe = 'Tous';

  // Ouvrir un second modal (temporaire) — on utilise une div positionnée
  const pickerEl = document.createElement('div');
  pickerEl.id = 'exo-picker-builder';
  pickerEl.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);
    display:flex;align-items:flex-end;justify-content:center;z-index:400;`;
  pickerEl.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--radius-xl) var(--radius-xl) 0 0;
      width:100%;max-width:560px;max-height:85dvh;display:flex;flex-direction:column;overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:var(--space-5);border-bottom:1px solid var(--border)">
        <h3 style="font-weight:700">Choisir un exercice</h3>
        <button id="picker-builder-close" class="icon-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div style="padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-3);overflow-y:auto">
        <div class="search-bar" style="margin:0">
          <div class="search-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
          <input class="search-input" id="pb-search" placeholder="Nom d'exercice…" type="search">
        </div>
        <div class="filter-chips" id="pb-chips" style="margin:0">
          ${GROUPES.map((g, i) => `<div class="chip ${i === 0 ? 'active' : ''}" data-groupe="${g}">${g}</div>`).join('')}
        </div>
        <div id="pb-list" class="picker-list"></div>
        <div id="pb-custom"></div>
      </div>
    </div>`;

  document.body.appendChild(pickerEl);

  const close = () => pickerEl.remove();
  pickerEl.querySelector('#picker-builder-close').addEventListener('click', close);
  pickerEl.addEventListener('click', e => { if (e.target === pickerEl) close(); });

  const rerender = () => {
    const filtered = EXERCICES.filter(e => {
      const g = groupe === 'Tous' || e.groupe === groupe;
      const s = !search || e.nom.toLowerCase().includes(search);
      return g && s;
    });
    const list = document.getElementById('pb-list');
    if (!list) return;
    list.innerHTML = filtered.map(e => `
      <button class="list-item clickable" data-nom="${e.nom}" style="width:100%;text-align:left">
        <div class="item-body"><p class="item-title">${e.nom}</p><p class="item-subtitle">${e.groupe}</p></div>
      </button>`).join('');

    list.querySelectorAll('[data-nom]').forEach(btn => {
      btn.addEventListener('click', () => {
        _builderState.jours[jourIndex].exercices.push(btn.dataset.nom);
        close();
        _refreshBuilderJours();
      });
    });
  };

  rerender();

  document.getElementById('pb-search')?.addEventListener('input', e => {
    search = e.target.value.toLowerCase().trim();
    rerender();
    const raw = e.target.value.trim();
    const wrap = document.getElementById('pb-custom');
    if (wrap && raw && !EXERCICES.find(ex => ex.nom.toLowerCase() === raw.toLowerCase())) {
      wrap.innerHTML = `<button class="btn btn-secondary btn-full" id="pb-custom-btn">+ "${raw}"</button>`;
      document.getElementById('pb-custom-btn').addEventListener('click', () => {
        _builderState.jours[jourIndex].exercices.push(raw);
        close();
        _refreshBuilderJours();
      });
    } else if (wrap) wrap.innerHTML = '';
  });

  document.getElementById('pb-chips')?.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#pb-chips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    groupe = chip.dataset.groupe;
    rerender();
  });
}

async function _saveBuilder() {
  _syncBuilderFromDOM();
  const { nom, description, jours, id } = _builderState;

  if (!nom) { showToast('Entrez un nom de programme', 'warning'); return; }

  showLoading();
  try {
    if (id) {
      await supabase.from('programmes').update({ nom, description, structure: jours }).eq('id', id);
      showToast('Programme mis à jour !', 'success');
    } else {
      await supabase.from('programmes').insert({ user_id: currentUser.id, nom, description, structure: jours });
      showToast('Programme créé !', 'success');
    }
    closeModal();
    _activeTab = 'custom';
    _render();
  } catch {
    showToast('Erreur lors de la sauvegarde', 'error');
  } finally {
    hideLoading();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function _skeletonList() {
  return `
    <div class="skeleton-list-wrapper">
      <div class="skeleton skeleton-card" style="margin-bottom:var(--space-3)"></div>
      <div class="skeleton skeleton-card" style="margin-bottom:var(--space-3)"></div>
    </div>`;
}
