import { supabase } from '../js/supabase.js';
import { currentUser, getUserPrenom, signOut } from '../js/auth.js';
import { lsSet, lsGet, showToast, confirmDialog } from '../js/utils.js';

const LS_KEY = (uid) => `onboarding_done_${uid}`;

export function checkOnboardingDone(userId) {
  return lsGet(LS_KEY(userId)) === true;
}

export function resetOnboardingDone(userId) {
  lsSet(LS_KEY(userId), false);
}

// ── Données des étapes ─────────────────────────────────────────────────

const OBJECTIFS = [
  { value: 'hypertrophie', label: 'Prise de masse',       desc: 'Développer votre musculature' },
  { value: 'force',        label: 'Force',                desc: 'Soulever plus lourd' },
  { value: 'seche',        label: 'Sèche',                desc: 'Perdre du gras, garder le muscle' },
  { value: 'endurance',    label: 'Endurance musculaire', desc: 'Améliorer votre résistance' },
  { value: 'maintenance',  label: 'Maintien',             desc: 'Rester en forme' },
];

const NIVEAUX = [
  { value: 'debutant',      label: 'Débutant',      desc: 'Moins d\'un an d\'entraînement' },
  { value: 'intermediaire', label: 'Intermédiaire', desc: 'Entre 1 et 3 ans d\'entraînement' },
  { value: 'avance',        label: 'Avancé',        desc: 'Plus de 3 ans d\'entraînement' },
];

const FREQUENCES = [
  { value: 2, label: '2× par semaine',  desc: 'Idéal pour débuter' },
  { value: 3, label: '3× par semaine',  desc: 'Équilibre parfait' },
  { value: 4, label: '4× par semaine',  desc: 'Programme sérieux' },
  { value: 5, label: '5×+ par semaine', desc: 'Entraînement intensif' },
];

const LIEUX = [
  { value: 'salle',    label: 'Salle de sport', desc: 'Accès complet aux machines' },
  { value: 'domicile', label: 'À domicile',     desc: 'Entraînement chez soi' },
  { value: 'mixte',    label: 'Les deux',       desc: 'Flexibilité maximale' },
];

const EQUIPEMENTS = [
  { value: 'corps',      label: 'Poids du corps' },
  { value: 'halteres',   label: 'Haltères' },
  { value: 'barre',      label: 'Barre + disques' },
  { value: 'machines',   label: 'Machines guidées' },
  { value: 'cables',     label: 'Câbles / Poulies' },
  { value: 'elastiques', label: 'Élastiques' },
  { value: 'banc',       label: 'Banc' },
];

const TOTAL_STEPS = 7;

// ── État ──────────────────────────────────────────────────────────────

let _step      = 0;
let _data      = {};
let _container = null;
let _onDone    = null;

// ── Init ──────────────────────────────────────────────────────────────

export function initOnboarding(container, onDone) {
  _container = container;
  _onDone    = onDone;
  _step      = 0;
  _data = {
    prenom:      getUserPrenom(),
    age:         null,
    sexe:        '',
    poids_kg:    null,
    taille_cm:   null,
    objectif:    '',
    niveau:      '',
    frequence:   null,
    lieu:        '',
    equipements: [],
  };
  _render();
}

// ── Rendu ─────────────────────────────────────────────────────────────

function _render() {
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  _container.innerHTML = `
    <div class="ob-wrapper">
      <div class="ob-card">
        ${isLocalhost ? `<button class="ob-skip" id="ob-skip">Passer l'onboarding</button>` : ''}
        <button class="ob-cancel" id="ob-cancel" aria-label="Annuler et revenir à la connexion">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        <div class="ob-progress">
          ${Array.from({ length: TOTAL_STEPS }, (_, i) => `
            <div class="ob-dot ${i < _step ? 'ob-dot-done' : ''} ${i === _step ? 'ob-dot-active' : ''}"></div>
          `).join('')}
        </div>

        <div class="ob-step-content">
          ${_renderStep()}
        </div>

        <div class="ob-nav">
          ${_step > 0
            ? `<button class="btn btn-secondary" id="ob-prev">Précédent</button>`
            : `<div></div>`}
          <button class="btn btn-primary" id="ob-next" style="flex:1;max-width:200px">
            ${_step === TOTAL_STEPS - 1 ? 'Commencer !' : 'Suivant'}
          </button>
        </div>
      </div>
    </div>`;

  _bindEvents();
}

function _renderStep() {
  switch (_step) {
    case 0: return _stepIdentite();
    case 1: return _stepMorpho();
    case 2: return _stepObjectif();
    case 3: return _stepNiveau();
    case 4: return _stepFrequence();
    case 5: return _stepLieu();
    case 6: return _stepEquipements();
    default: return '';
  }
}

// ── Étapes ────────────────────────────────────────────────────────────

function _stepIdentite() {
  const sexeOptions = ['Homme', 'Femme', 'Non précisé'];
  return `
    <h2 class="ob-title">Qui êtes-vous ?</h2>
    <p class="ob-subtitle">Ces informations personnalisent votre expérience</p>
    <div class="ob-form">
      <div class="form-group">
        <label class="form-label">Prénom</label>
        <input class="form-input" type="text" id="ob-prenom"
          value="${_esc(_data.prenom)}" placeholder="Votre prénom" autocomplete="given-name">
      </div>
      <div class="form-group">
        <label class="form-label">Âge</label>
        <input class="form-input" type="number" id="ob-age"
          value="${_data.age ?? ''}" placeholder="25" min="10" max="100" inputmode="numeric">
      </div>
      <div class="form-group">
        <label class="form-label">Sexe</label>
        <div class="ob-radio-group">
          ${sexeOptions.map(s => {
            const val = s === 'Non précisé' ? 'autre' : s.toLowerCase();
            const sel = _data.sexe === val;
            return `<label class="ob-radio ${sel ? 'ob-radio-selected' : ''}">
              <input type="radio" name="sexe" value="${val}" ${sel ? 'checked' : ''}> ${s}
            </label>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

function _stepMorpho() {
  return `
    <h2 class="ob-title">Votre morphologie</h2>
    <p class="ob-subtitle">Pour suivre votre évolution au fil du temps</p>
    <div class="ob-form">
      <div class="form-group">
        <label class="form-label">Poids actuel</label>
        <div class="ob-input-unit">
          <input class="form-input" type="number" id="ob-poids"
            value="${_data.poids_kg ?? ''}" placeholder="70" min="30" max="300" step="0.5" inputmode="decimal">
          <span class="ob-unit">kg</span>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Taille</label>
        <div class="ob-input-unit">
          <input class="form-input" type="number" id="ob-taille"
            value="${_data.taille_cm ?? ''}" placeholder="175" min="100" max="250" inputmode="numeric">
          <span class="ob-unit">cm</span>
        </div>
      </div>
    </div>
    <p class="ob-hint">Ces champs sont facultatifs — vous pourrez les renseigner plus tard dans votre profil.</p>`;
}

function _stepObjectif() {
  return `
    <h2 class="ob-title">Votre objectif</h2>
    <p class="ob-subtitle">Sur quoi souhaitez-vous vous concentrer ?</p>
    <div class="ob-options">
      ${OBJECTIFS.map(o => `
        <button class="ob-option ${_data.objectif === o.value ? 'ob-option-selected' : ''}"
          data-value="${o.value}" data-field="objectif">
          <span class="ob-option-label">${o.label}</span>
          <span class="ob-option-desc">${o.desc}</span>
        </button>`).join('')}
    </div>`;
}

function _stepNiveau() {
  return `
    <h2 class="ob-title">Votre niveau</h2>
    <p class="ob-subtitle">Soyez honnête, c'est pour mieux vous accompagner</p>
    <div class="ob-options">
      ${NIVEAUX.map(n => `
        <button class="ob-option ${_data.niveau === n.value ? 'ob-option-selected' : ''}"
          data-value="${n.value}" data-field="niveau">
          <span class="ob-option-label">${n.label}</span>
          <span class="ob-option-desc">${n.desc}</span>
        </button>`).join('')}
    </div>`;
}

function _stepFrequence() {
  return `
    <h2 class="ob-title">Fréquence d'entraînement</h2>
    <p class="ob-subtitle">Combien de fois par semaine souhaitez-vous vous entraîner ?</p>
    <div class="ob-options ob-options-2col">
      ${FREQUENCES.map(f => `
        <button class="ob-option ${_data.frequence === f.value ? 'ob-option-selected' : ''}"
          data-value="${f.value}" data-field="frequence" data-type="int">
          <span class="ob-option-label">${f.label}</span>
          <span class="ob-option-desc">${f.desc}</span>
        </button>`).join('')}
    </div>`;
}

function _stepLieu() {
  return `
    <h2 class="ob-title">Où vous entraînez-vous ?</h2>
    <p class="ob-subtitle">Nous adaptons vos programmes en fonction de votre lieu</p>
    <div class="ob-options">
      ${LIEUX.map(l => `
        <button class="ob-option ${_data.lieu === l.value ? 'ob-option-selected' : ''}"
          data-value="${l.value}" data-field="lieu">
          <span class="ob-option-label">${l.label}</span>
          <span class="ob-option-desc">${l.desc}</span>
        </button>`).join('')}
    </div>`;
}

function _stepEquipements() {
  return `
    <h2 class="ob-title">Vos équipements</h2>
    <p class="ob-subtitle">Sélectionnez tout ce dont vous disposez</p>
    <div class="ob-chips-grid">
      ${EQUIPEMENTS.map(e => `
        <button class="chip ob-chip-btn ${_data.equipements.includes(e.value) ? 'active' : ''}"
          data-value="${e.value}">${e.label}</button>`).join('')}
    </div>
    <p class="ob-hint">Vous pouvez en sélectionner plusieurs.</p>`;
}

// ── Binding ───────────────────────────────────────────────────────────

function _bindEvents() {
  document.getElementById('ob-skip')?.addEventListener('click', _skip);
  document.getElementById('ob-cancel')?.addEventListener('click', _cancel);
  document.getElementById('ob-prev')?.addEventListener('click', _prev);
  document.getElementById('ob-next')?.addEventListener('click', _next);

  // Sélection unique (option cards)
  _container.querySelectorAll('.ob-option[data-field]').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.field;
      const raw   = btn.dataset.value;
      _data[field] = btn.dataset.type === 'int' ? parseInt(raw) : raw;
      _container.querySelectorAll(`.ob-option[data-field="${field}"]`)
        .forEach(b => b.classList.remove('ob-option-selected'));
      btn.classList.add('ob-option-selected');
    });
  });

  // Sélection multiple (équipements)
  _container.querySelectorAll('.ob-chip-btn').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.value;
      if (_data.equipements.includes(val)) {
        _data.equipements = _data.equipements.filter(e => e !== val);
        chip.classList.remove('active');
      } else {
        _data.equipements.push(val);
        chip.classList.add('active');
      }
    });
  });

  // Radio sexe
  _container.querySelectorAll('input[name="sexe"]').forEach(radio => {
    radio.addEventListener('change', () => {
      _data.sexe = radio.value;
      _container.querySelectorAll('.ob-radio').forEach(l => l.classList.remove('ob-radio-selected'));
      radio.closest('.ob-radio')?.classList.add('ob-radio-selected');
    });
  });
}

// ── Navigation ────────────────────────────────────────────────────────

function _prev() {
  _collect();
  _step = Math.max(0, _step - 1);
  _render();
}

async function _next() {
  _collect();
  if (_step === TOTAL_STEPS - 1) {
    await _finish();
  } else {
    _step++;
    _render();
  }
}

function _collect() {
  if (_step === 0) {
    _data.prenom = document.getElementById('ob-prenom')?.value.trim() || _data.prenom;
    _data.age    = parseInt(document.getElementById('ob-age')?.value) || null;
  } else if (_step === 1) {
    _data.poids_kg  = parseFloat(document.getElementById('ob-poids')?.value) || null;
    _data.taille_cm = parseInt(document.getElementById('ob-taille')?.value)  || null;
  }
}

// ── Finalisation ──────────────────────────────────────────────────────

async function _finish() {
  _collect();

  try {
    const user = currentUser;
    const { error: upsertErr } = await supabase.from('profils').upsert({
      user_id:     user.id,
      prenom:      _data.prenom || null,
      poids_kg:    _data.poids_kg,
      taille_cm:   _data.taille_cm,
      objectif:    _data.objectif || null,
      age:         _data.age,
      sexe:        _data.sexe || null,
      niveau:      _data.niveau || null,
      frequence:   _data.frequence,
      lieu:        _data.lieu || null,
      equipements: _data.equipements,
    }, { onConflict: 'user_id' });

    if (upsertErr) throw upsertErr;

    if (_data.poids_kg) {
      try {
        await supabase.from('historique_poids').upsert({
          user_id:  user.id,
          date:     new Date().toISOString().split('T')[0],
          poids_kg: _data.poids_kg,
        }, { onConflict: 'user_id,date' });
      } catch { /* non bloquant */ }
    }
  } catch(err) {
    showToast(`Erreur sauvegarde profil : ${err?.message ?? err}`, 'error', 6000);
  }

  lsSet(LS_KEY(currentUser.id), true);
  const prenom = _data.prenom || 'toi';
  showToast(`Bienvenue ${prenom} ! C'est parti !`, 'success', 4000);
  _onDone?.();
}

function _skip() {
  lsSet(LS_KEY(currentUser.id), true);
  _onDone?.();
}

// Annule l'inscription en cours : aucune réponse n'est encore enregistrée
// en base à ce stade (seulement en mémoire), donc se déconnecter suffit —
// onAuthStateChange (js/auth.js) renvoie alors automatiquement vers l'écran
// de connexion.
async function _cancel() {
  if (!await confirmDialog('Annuler l\'inscription et revenir à la connexion ?', { confirmLabel: 'Annuler', danger: false })) return;
  await signOut();
}

// ── Util ──────────────────────────────────────────────────────────────

function _esc(str) {
  return (str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
