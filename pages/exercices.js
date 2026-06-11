import { currentUser }  from '../js/auth.js';
import { supabase }      from '../js/supabase.js';
import { debounce, openModal, closeModal, showToast, showLoading, hideLoading, emptyState } from '../js/utils.js';

// ── Bibliothèque intégrée ─────────────────────────────────────────────

export const EXERCICES = [
  // Poitrine
  { nom: 'Développé couché', groupe: 'Poitrine', materiel: 'Barre', niveau: 'Intermédiaire',
    muscles: ['Pectoraux', 'Triceps', 'Deltoïdes antérieurs'],
    description: 'Exercice de base pour la poitrine. Allongé sur le banc, descendez la barre jusqu\'à la poitrine en contrôlant le mouvement, puis poussez explositement.' },
  { nom: 'Développé incliné haltères', groupe: 'Poitrine', materiel: 'Haltères', niveau: 'Intermédiaire',
    muscles: ['Pectoraux supérieurs', 'Triceps'],
    description: 'Même mouvement que le développé couché mais sur un banc incliné à 30-45°. Cible davantage la partie supérieure de la poitrine.' },
  { nom: 'Écarté couché', groupe: 'Poitrine', materiel: 'Haltères', niveau: 'Intermédiaire',
    muscles: ['Pectoraux', 'Deltoïdes antérieurs'],
    description: 'Isole les pectoraux. Bras légèrement fléchis, descendez les haltères en arc de cercle jusqu\'à sentir l\'étirement.' },
  { nom: 'Pompes', groupe: 'Poitrine', materiel: 'Aucun', niveau: 'Débutant',
    muscles: ['Pectoraux', 'Triceps', 'Stabilisateurs'],
    description: 'Exercice au poids du corps. Mains légèrement plus larges que les épaules, corps gainé, descendez la poitrine jusqu\'au sol.' },
  { nom: 'Dips', groupe: 'Poitrine', materiel: 'Barre parallèle', niveau: 'Intermédiaire',
    muscles: ['Pectoraux inférieurs', 'Triceps'],
    description: 'Penchez le buste légèrement en avant pour cibler la poitrine. Descendez jusqu\'à ce que les épaules soient en dessous des coudes.' },
  // Dos
  { nom: 'Soulevé de terre', groupe: 'Dos', materiel: 'Barre', niveau: 'Avancé',
    muscles: ['Érecteurs spinaux', 'Trapèzes', 'Ischio-jambiers', 'Fessiers'],
    description: 'Roi des exercices de dos. Pieds écartés hanches, barre près des tibias, dos droit, poussez le sol pour monter.' },
  { nom: 'Tractions', groupe: 'Dos', materiel: 'Barre de traction', niveau: 'Intermédiaire',
    muscles: ['Grand dorsal', 'Biceps', 'Rhomboïdes'],
    description: 'Tirez votre corps vers la barre en contractant les dorsaux. Évitez de balancer. Descente lente et contrôlée.' },
  { nom: 'Rowing barre', groupe: 'Dos', materiel: 'Barre', niveau: 'Intermédiaire',
    muscles: ['Dorsaux', 'Trapèzes', 'Rhomboïdes', 'Biceps'],
    description: 'Buste penché à 45°, tirez la barre vers le bas du ventre en serrant les omoplates.' },
  { nom: 'Tirage horizontal câble', groupe: 'Dos', materiel: 'Câble', niveau: 'Débutant',
    muscles: ['Dorsaux', 'Biceps', 'Rhomboïdes'],
    description: 'Assis face à la poulie basse, tirez la poignée vers le bas du ventre en gardant le dos droit.' },
  // Épaules
  { nom: 'Développé militaire', groupe: 'Épaules', materiel: 'Barre', niveau: 'Intermédiaire',
    muscles: ['Deltoïdes', 'Triceps', 'Trapèzes'],
    description: 'Debout ou assis, poussez la barre au-dessus de la tête en gardant le gainage actif.' },
  { nom: 'Élévations latérales', groupe: 'Épaules', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Deltoïdes latéraux'],
    description: 'Bras légèrement fléchis, montez les haltères sur les côtés jusqu\'à hauteur des épaules. Mouvement lent et contrôlé.' },
  { nom: 'Élévations frontales', groupe: 'Épaules', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Deltoïdes antérieurs'],
    description: 'Montez les haltères devant vous jusqu\'à hauteur des épaules. Évitez de balancer le dos.' },
  // Biceps
  { nom: 'Curl biceps barre', groupe: 'Biceps', materiel: 'Barre', niveau: 'Débutant',
    muscles: ['Biceps brachial', 'Brachial'],
    description: 'Coudes fixes contre le corps, fléchissez les coudes pour monter la barre. Descente lente.' },
  { nom: 'Hammer curl', groupe: 'Biceps', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Biceps', 'Brachioradial'],
    description: 'Prise neutre (pouces vers le haut), même mouvement que le curl. Travaille davantage le brachioradial.' },
  // Triceps
  { nom: 'Triceps poulie haute', groupe: 'Triceps', materiel: 'Câble', niveau: 'Débutant',
    muscles: ['Triceps'],
    description: 'Coudes fixes, poussez la corde ou la barre vers le bas en contractant les triceps.' },
  { nom: 'Skull crushers', groupe: 'Triceps', materiel: 'Barre EZ', niveau: 'Intermédiaire',
    muscles: ['Triceps long'],
    description: 'Allongé sur le banc, barre EZ en mains, fléchissez les coudes pour descendre la barre vers le front.' },
  // Jambes
  { nom: 'Squat', groupe: 'Jambes', materiel: 'Barre', niveau: 'Intermédiaire',
    muscles: ['Quadriceps', 'Fessiers', 'Ischio-jambiers'],
    description: 'Roi des exercices jambes. Barre en position haute, pieds écartés légèrement plus que les hanches, descendez jusqu\'à ce que les cuisses soient parallèles au sol.' },
  { nom: 'Leg press', groupe: 'Jambes', materiel: 'Machine', niveau: 'Débutant',
    muscles: ['Quadriceps', 'Fessiers'],
    description: 'Poussez la plateforme en extension complète sans verrouiller les genoux. Position des pieds varie le ciblage musculaire.' },
  { nom: 'Fentes', groupe: 'Jambes', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Quadriceps', 'Fessiers', 'Ischio-jambiers'],
    description: 'Avancez un pied, fléchissez les deux genoux. Le genou avant ne dépasse pas le pied.' },
  { nom: 'Soulevé de terre roumain', groupe: 'Jambes', materiel: 'Barre', niveau: 'Intermédiaire',
    muscles: ['Ischio-jambiers', 'Fessiers', 'Érecteurs spinaux'],
    description: 'Pieds à hanches, penchez le buste en gardant les jambes quasi-tendues. Sentez l\'étirement des ischios.' },
  { nom: 'Hip thrust', groupe: 'Jambes', materiel: 'Barre', niveau: 'Débutant',
    muscles: ['Fessiers', 'Ischio-jambiers'],
    description: 'Dos appuyé sur un banc, barre sur le bassin. Poussez les hanches vers le haut en contractant les fessiers.' },
  { nom: 'Mollets debout', groupe: 'Jambes', materiel: 'Machine', niveau: 'Débutant',
    muscles: ['Gastrocnémiens', 'Soléaire'],
    description: 'Montez sur la pointe des pieds avec amplitude complète. Descente lente pour un étirement maximal.' },
  // Abdominaux
  { nom: 'Crunchs', groupe: 'Abdominaux', materiel: 'Aucun', niveau: 'Débutant',
    muscles: ['Grand droit de l\'abdomen'],
    description: 'Contractez les abdos pour lever les épaules du sol. Ne tirez pas sur la nuque.' },
  { nom: 'Planche', groupe: 'Abdominaux', materiel: 'Aucun', niveau: 'Débutant',
    muscles: ['Transverse', 'Grand droit', 'Stabilisateurs'],
    description: 'Corps aligné de la tête aux talons, abdos et fessiers contractés. Tenez la position.' },
  { nom: 'Relevés de jambes', groupe: 'Abdominaux', materiel: 'Barre de traction', niveau: 'Intermédiaire',
    muscles: ['Abdominaux inférieurs', 'Fléchisseurs de hanche'],
    description: 'Suspendu à la barre, montez les jambes tendues ou genoux vers la poitrine en contractant les abdos.' },
];

const GROUPES_BASE = [...new Set(EXERCICES.map(e => e.groupe))];

// ── Chargement des exercices custom (Supabase) ────────────────────────

let _customCache = null;

async function _loadCustom() {
  try {
    const { data } = await supabase
      .from('exercices_custom')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });
    _customCache = (data ?? []).map(e => ({ ...e, custom: true }));
  } catch {
    _customCache = [];
  }
  return _customCache;
}

// ── Page Exercices ────────────────────────────────────────────────────

let _section    = null;
let _activeTab  = 'tous';
let _allExos    = [];

export async function loadExercices(section) {
  _section   = section;
  _activeTab = 'tous';

  section.innerHTML = `
    <div class="tabs" id="exo-page-tabs">
      <button class="tab active" data-tab="tous">Tous</button>
      <button class="tab" data-tab="mes">Mes exercices</button>
    </div>
    <div id="exo-page-content"></div>`;

  section.querySelectorAll('#exo-page-tabs .tab').forEach(t => {
    t.addEventListener('click', () => {
      section.querySelectorAll('#exo-page-tabs .tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      _activeTab = t.dataset.tab;
      _activeTab === 'tous' ? _renderTous() : _renderMes();
    });
  });

  await _renderTous();
}

// ── Onglet Tous ───────────────────────────────────────────────────────

async function _renderTous() {
  const content = _section.querySelector('#exo-page-content');
  content.innerHTML = `
    <div class="search-bar">
      <div class="search-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>
      <input class="search-input" id="exo-search" placeholder="Rechercher un exercice…" type="search" autocomplete="off">
    </div>
    <div class="filter-chips" id="filter-chips">
      <div class="chip active" data-groupe="Tous">Tous</div>
      ${GROUPES_BASE.map(g => `<div class="chip" data-groupe="${g}">${g}</div>`).join('')}
    </div>
    <div id="exo-list" class="item-list"></div>`;

  const custom = await _loadCustom();
  _allExos = [...EXERCICES, ...custom];

  let activeGroupe = 'Tous';
  let searchTerm   = '';

  const render = () => {
    const filtered = _allExos.filter(e => {
      const matchG = activeGroupe === 'Tous' || e.groupe === activeGroupe;
      const q      = searchTerm;
      const matchS = !q || e.nom.toLowerCase().includes(q)
                       || (e.muscles ?? []).some(m => m.toLowerCase().includes(q));
      return matchG && matchS;
    });

    const list = content.querySelector('#exo-list');
    if (!filtered.length) {
      list.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-8);font-size:var(--font-size-sm)">Aucun exercice trouvé</p>`;
      return;
    }
    list.innerHTML = filtered.map((e, i) => _exoItem(e, i, filtered)).join('');
    list.querySelectorAll('[data-exo-idx]').forEach(item => {
      item.addEventListener('click', () => _showDetail(filtered[parseInt(item.dataset.exoIdx)]));
    });
  };

  content.querySelector('#filter-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    content.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeGroupe = chip.dataset.groupe;
    render();
  });

  content.querySelector('#exo-search').addEventListener('input', debounce(e => {
    searchTerm = e.target.value.toLowerCase().trim();
    render();
  }, 200));

  render();
}

// ── Onglet Mes exercices ──────────────────────────────────────────────

async function _renderMes() {
  const content = _section.querySelector('#exo-page-content');
  content.innerHTML = `
    <div style="margin-bottom:var(--space-4)">
      <button class="btn btn-primary btn-full" id="btn-new-exo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
          style="width:18px;height:18px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Créer un exercice
      </button>
    </div>
    <div id="custom-exo-list" class="item-list">
      <div class="skeleton skeleton-card" style="margin-bottom:8px"></div>
      <div class="skeleton skeleton-card"></div>
    </div>`;

  content.querySelector('#btn-new-exo').addEventListener('click', () => _openCreateModal());

  const custom = await _loadCustom();
  const list   = content.querySelector('#custom-exo-list');

  if (!custom.length) {
    list.innerHTML = emptyState(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14M18 5v14M3 8h3m12 0h3M3 16h3m12 0h3"/></svg>`,
      'Aucun exercice custom',
      'Créez des exercices personnalisés pour les retrouver dans vos séances.', null, null
    );
    return;
  }

  list.innerHTML = custom.map((e, i) => _exoItem(e, i, custom, true)).join('');

  list.querySelectorAll('[data-exo-idx]').forEach(item => {
    item.addEventListener('click', () => _showDetail(custom[parseInt(item.dataset.exoIdx)]));
  });
  list.querySelectorAll('[data-delete-exo]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _deleteCustom(btn.dataset.deleteExo);
    });
  });
}

// ── HTML item exercice ────────────────────────────────────────────────

function _exoItem(e, i, list, showDelete = false) {
  return `
    <div class="list-item clickable" data-exo-idx="${i}" style="align-items:flex-start">
      <div class="item-icon" style="margin-top:2px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 5v14M18 5v14M3 8h3m12 0h3M3 16h3m12 0h3"/>
        </svg>
      </div>
      <div class="item-body">
        <div style="display:flex;align-items:center;gap:var(--space-2)">
          <p class="item-title">${e.nom}</p>
          ${e.custom ? `<span class="badge badge-primary" style="font-size:10px;padding:1px 6px">Custom</span>` : ''}
        </div>
        <p class="item-subtitle">${e.groupe} • ${e.materiel}</p>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:var(--space-2)">
          ${(e.muscles ?? []).slice(0, 3).map(m => `<span class="muscle-tag">${m}</span>`).join('')}
        </div>
      </div>
      ${showDelete
        ? `<button class="icon-btn" data-delete-exo="${e.id}" style="color:var(--color-error);flex-shrink:0">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
             </svg>
           </button>`
        : `<span class="badge badge-muted" style="flex-shrink:0;margin-top:2px">${e.niveau ?? ''}</span>`
      }
    </div>`;
}

// ── Détail exercice ───────────────────────────────────────────────────

function _showDetail(exo) {
  openModal({
    title: exo.nom,
    body: `
      <div style="display:flex;flex-direction:column;gap:var(--space-4)">
        <div style="display:flex;gap:var(--space-2);flex-wrap:wrap">
          <span class="badge badge-primary">${exo.groupe}</span>
          <span class="badge badge-muted">${exo.materiel}</span>
          ${exo.niveau ? `<span class="badge badge-muted">${exo.niveau}</span>` : ''}
          ${exo.custom ? `<span class="badge badge-primary">Custom</span>` : ''}
        </div>
        ${(exo.muscles ?? []).length ? `
        <div>
          <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:var(--space-2)">Muscles ciblés</p>
          <div style="display:flex;gap:var(--space-2);flex-wrap:wrap">
            ${exo.muscles.map(m => `<span class="muscle-tag">${m}</span>`).join('')}
          </div>
        </div>` : ''}
        ${exo.description ? `
        <div>
          <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:var(--space-2)">Description</p>
          <p style="font-size:var(--font-size-sm);color:var(--text-secondary);line-height:1.7">${exo.description}</p>
        </div>` : ''}
      </div>`,
  });
}

// ── Créer un exercice custom ──────────────────────────────────────────

function _openCreateModal() {
  const GROUPES_ALL = [...GROUPES_BASE, 'Cardio', 'Mobilité', 'Autre'];

  openModal({
    title: 'Nouvel exercice',
    body: `
      <div style="display:flex;flex-direction:column;gap:var(--space-4)">
        <div class="form-group">
          <label class="form-label">Nom de l'exercice *</label>
          <input class="form-input" id="ce-nom" type="text" placeholder="ex: Curl marteau unilatéral" autocomplete="off">
        </div>
        <div class="form-group">
          <label class="form-label">Groupe musculaire *</label>
          <select class="form-select" id="ce-groupe">
            ${GROUPES_ALL.map(g => `<option value="${g}">${g}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Matériel</label>
          <input class="form-input" id="ce-materiel" type="text" placeholder="ex: Haltères, Câble, Machine…" value="Aucun">
        </div>
        <div class="form-group">
          <label class="form-label">Muscles ciblés</label>
          <input class="form-input" id="ce-muscles" type="text" placeholder="ex: Biceps, Brachioradial (séparés par des virgules)">
        </div>
        <div class="form-group">
          <label class="form-label">Description (facultatif)</label>
          <textarea class="form-input form-textarea" id="ce-desc" rows="3" placeholder="Consignes techniques…"></textarea>
        </div>
      </div>`,
    footer: `
      <button class="btn btn-secondary" id="ce-cancel">Annuler</button>
      <button class="btn btn-primary" id="ce-save" style="flex:1">Créer l'exercice</button>`,
  });

  setTimeout(() => document.getElementById('ce-nom')?.focus(), 80);
  document.getElementById('ce-cancel')?.addEventListener('click', closeModal);
  document.getElementById('ce-save')?.addEventListener('click', _saveCustom);
}

async function _saveCustom() {
  const nom      = document.getElementById('ce-nom')?.value.trim();
  const groupe   = document.getElementById('ce-groupe')?.value;
  const materiel = document.getElementById('ce-materiel')?.value.trim() || 'Aucun';
  const musclesRaw = document.getElementById('ce-muscles')?.value.trim();
  const muscles  = musclesRaw ? musclesRaw.split(',').map(m => m.trim()).filter(Boolean) : [];
  const desc     = document.getElementById('ce-desc')?.value.trim();

  if (!nom) { showToast('Entrez un nom d\'exercice', 'warning'); return; }

  showLoading();
  try {
    const { error } = await supabase.from('exercices_custom').insert({
      user_id: currentUser.id, nom, groupe, materiel, muscles, description: desc || null,
    });
    if (error) throw error;
    _customCache = null;
    closeModal();
    showToast(`"${nom}" ajouté à vos exercices`, 'success');
    _activeTab = 'mes';
    _section.querySelector('[data-tab="mes"]')?.click();
  } catch {
    showToast('Erreur lors de la création', 'error');
  } finally {
    hideLoading();
  }
}

async function _deleteCustom(id) {
  if (!confirm('Supprimer cet exercice ?')) return;
  try {
    await supabase.from('exercices_custom').delete().eq('id', id);
    _customCache = null;
    showToast('Exercice supprimé', 'success');
    _renderMes();
  } catch {
    showToast('Erreur lors de la suppression', 'error');
  }
}

// ── Export pour le picker de séance ──────────────────────────────────

export async function getAllExercices() {
  const custom = _customCache ?? await _loadCustom();
  return [...EXERCICES, ...custom];
}
