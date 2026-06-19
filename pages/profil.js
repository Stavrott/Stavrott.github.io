import { currentUser, getUserPrenom } from '../js/auth.js';
import { supabase }  from '../js/supabase.js';
import { showToast, todayStr, confirmDialog } from '../js/utils.js';

const OBJECTIFS = [
  { value: 'hypertrophie', label: 'Prise de masse',    desc: 'Développer la masse musculaire' },
  { value: 'force',        label: 'Force',              desc: 'Augmenter les performances max' },
  { value: 'seche',        label: 'Sèche',              desc: 'Réduire la masse grasse' },
  { value: 'endurance',    label: 'Endurance',          desc: 'Améliorer le cardio et l\'endurance' },
  { value: 'maintenance',  label: 'Maintien',           desc: 'Maintenir la condition actuelle' },
];

const NIVEAUX = [
  { value: 'debutant',      label: 'Débutant',      desc: 'Moins d\'un an d\'entraînement' },
  { value: 'intermediaire', label: 'Intermédiaire', desc: 'Entre 1 et 3 ans d\'entraînement' },
  { value: 'avance',        label: 'Avancé',        desc: 'Plus de 3 ans d\'entraînement' },
];

const FREQUENCES = [
  { value: 2, label: '2× par semaine' },
  { value: 3, label: '3× par semaine' },
  { value: 4, label: '4× par semaine' },
  { value: 5, label: '5×+ par semaine' },
];

const LIEUX = [
  { value: 'salle',    label: 'Salle de sport' },
  { value: 'domicile', label: 'À domicile' },
  { value: 'mixte',    label: 'Les deux' },
];

const SEXES = [
  { value: 'homme', label: 'Homme' },
  { value: 'femme', label: 'Femme' },
  { value: 'autre', label: 'Non précisé' },
];

const EQUIPEMENTS_ALL = [
  { value: 'corps',      label: 'Poids du corps' },
  { value: 'halteres',   label: 'Haltères' },
  { value: 'barre',      label: 'Barre + disques' },
  { value: 'machines',   label: 'Machines guidées' },
  { value: 'cables',     label: 'Câbles / Poulies' },
  { value: 'elastiques', label: 'Élastiques' },
  { value: 'banc',       label: 'Banc' },
];

// ── Lookup helpers ─────────────────────────────────────────────────────

function labelOf(list, value) {
  return list.find(i => i.value === value)?.label ?? '—';
}

// ── Export pour le drawer ──────────────────────────────────────────────

export async function getProfilSummary() {
  try {
    const { data } = await supabase
      .from('profils')
      .select('objectif, niveau')
      .eq('user_id', currentUser.id)
      .maybeSingle();
    if (!data) return null;
    return {
      objectifLabel: labelOf(OBJECTIFS, data.objectif),
      niveauLabel:   labelOf(NIVEAUX,   data.niveau),
    };
  } catch { return null; }
}

// ── Point d'entrée ────────────────────────────────────────────────────

export async function loadProfil(section) {
  section.innerHTML = `<div style="text-align:center;padding:var(--space-8)"><div class="spinner" style="margin:0 auto"></div></div>`;

  const [profil, histPoids] = await Promise.all([
    _fetchProfil(),
    _fetchHistPoids(),
  ]);

  _render(section, profil, histPoids);
}

// ── Données ───────────────────────────────────────────────────────────

async function _fetchProfil() {
  try {
    const { data } = await supabase
      .from('profils')
      .select('*')
      .eq('user_id', currentUser.id)
      .maybeSingle();
    return data ?? {};
  } catch { return {}; }
}

async function _fetchHistPoids() {
  try {
    const { data } = await supabase
      .from('historique_poids')
      .select('date, poids_kg')
      .eq('user_id', currentUser.id)
      .order('date', { ascending: false })
      .limit(60);
    return data ?? [];
  } catch { return []; }
}

// ── Rendu principal ───────────────────────────────────────────────────

function _render(section, profil, histPoids) {
  const prenom       = getUserPrenom() || 'Utilisateur';
  const initial      = prenom.charAt(0).toUpperCase();
  const poidsActuel  = histPoids[0]?.poids_kg ?? profil.poids_kg ?? null;
  const today        = todayStr();
  const hasToday     = histPoids[0]?.date === today;

  const objectif     = OBJECTIFS.find(o => o.value === profil.objectif);
  const niveau       = NIVEAUX.find(n => n.value === profil.niveau);
  const frequenceLabel = FREQUENCES.find(f => f.value === profil.frequence)?.label ?? null;
  const lieuLabel    = labelOf(LIEUX, profil.lieu);
  const sexeLabel    = labelOf(SEXES, profil.sexe);
  const equipements  = Array.isArray(profil.equipements) ? profil.equipements : [];

  section.innerHTML = `
    <!-- Avatar + nom -->
    <div style="display:flex;flex-direction:column;align-items:center;gap:var(--space-3);margin-bottom:var(--space-6)">
      <div style="width:72px;height:72px;border-radius:var(--radius-full);background:var(--color-primary);
        display:flex;align-items:center;justify-content:center;color:white;font-weight:900;
        font-size:2rem;box-shadow:0 4px 16px rgba(232,67,42,.4)">${initial}</div>
      <div style="text-align:center">
        <h2 style="font-weight:900;font-size:var(--font-size-xl)">${prenom}</h2>
        <p style="color:var(--text-muted);font-size:var(--font-size-sm)">${currentUser.email}</p>
      </div>
    </div>

    <!-- Profil personnel -->
    <div class="page-section">
      <div class="section-header">
        <h3 class="section-title">Profil personnel</h3>
        <button class="btn btn-ghost btn-sm" id="btn-edit-identite" style="color:var(--color-primary)">Modifier</button>
      </div>
      <div class="card">
        ${_row('Âge',    profil.age    ? `${profil.age} ans` : '—')}
        ${_row('Sexe',   profil.sexe   ? sexeLabel           : '—')}
        ${_row('Taille', profil.taille_cm ? `${profil.taille_cm} cm` : '—')}
      </div>
    </div>

    <!-- Mon programme -->
    <div class="page-section">
      <div class="section-header">
        <h3 class="section-title">Mon programme</h3>
        <button class="btn btn-ghost btn-sm" id="btn-edit-programme" style="color:var(--color-primary)">Modifier</button>
      </div>
      <div class="card">
        ${_row('Objectif',    objectif ? `<span style="color:var(--color-primary);font-weight:700">${objectif.label}</span>` : '—')}
        ${_row('Niveau',      niveau   ? niveau.label     : '—')}
        ${_row('Fréquence',   frequenceLabel ?? '—')}
        ${_row('Lieu',        profil.lieu ? lieuLabel : '—')}
      </div>
    </div>

    <!-- Équipements -->
    <div class="page-section">
      <div class="section-header">
        <h3 class="section-title">Équipements</h3>
        <button class="btn btn-ghost btn-sm" id="btn-edit-equip" style="color:var(--color-primary)">Modifier</button>
      </div>
      <div class="card">
        ${equipements.length
          ? `<div style="display:flex;flex-wrap:wrap;gap:8px">
               ${equipements.map(v => {
                 const eq = EQUIPEMENTS_ALL.find(e => e.value === v);
                 return eq ? `<span class="chip active" style="pointer-events:none">${eq.label}</span>` : '';
               }).join('')}
             </div>`
          : `<p style="color:var(--text-muted);font-size:var(--font-size-sm)">Aucun équipement renseigné</p>`}
      </div>
    </div>

    <!-- Poids corporel -->
    <div class="card page-section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3)">
        <p class="card-title">Poids corporel</p>
        ${!hasToday ? `<button class="btn btn-sm btn-primary" id="btn-log-poids">+ Enregistrer</button>` : ''}
      </div>
      ${poidsActuel
        ? `<p class="card-value">${poidsActuel} <span>kg</span></p>
           <p style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:4px">
             ${hasToday ? 'Aujourd\'hui' : 'Dernière mesure : ' + histPoids[0]?.date}
           </p>`
        : `<p style="color:var(--text-muted);font-size:var(--font-size-sm)">Aucune mesure enregistrée</p>`}
      ${hasToday ? `
        <button class="btn btn-ghost btn-sm" id="btn-update-poids" style="margin-top:var(--space-3);color:var(--color-primary)">
          Modifier la mesure d'aujourd'hui
        </button>` : ''}
    </div>

    <!-- Graphique poids -->
    ${histPoids.length >= 2 ? `
    <div class="card page-section">
      <p class="card-title" style="margin-bottom:var(--space-3)">Évolution du poids</p>
      ${_svgPoidsChart(histPoids)}
    </div>` : ''}

    <!-- Historique poids -->
    ${histPoids.length ? `
    <div class="page-section">
      <h3 class="section-title" style="margin-bottom:var(--space-3)">Historique du poids</h3>
      <div class="item-list">
        ${histPoids.slice(0, 10).map(p => `
          <div class="list-item">
            <div class="item-body">
              <p class="item-title">${p.poids_kg} kg</p>
              <p class="item-subtitle">${p.date}</p>
            </div>
            <button class="icon-btn" data-del-poids="${p.date}" style="color:var(--color-error)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              </svg>
            </button>
          </div>`).join('')}
      </div>
    </div>` : ''}`;

  section.querySelector('#btn-log-poids')?.addEventListener('click',    () => _openPoidsModal(false, section));
  section.querySelector('#btn-update-poids')?.addEventListener('click', () => _openPoidsModal(true,  section));
  section.querySelector('#btn-edit-identite')?.addEventListener('click',  () => _openIdentiteModal(profil,  section));
  section.querySelector('#btn-edit-programme')?.addEventListener('click', () => _openProgrammeModal(profil, section));
  section.querySelector('#btn-edit-equip')?.addEventListener('click',     () => _openEquipModal(profil, section));

  section.querySelectorAll('[data-del-poids]').forEach(btn => {
    btn.addEventListener('click', () => _deletePoids(btn.dataset.delPoids, section));
  });
}

// ── Helper ligne de données ────────────────────────────────────────────

function _row(label, value) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;border-bottom:1px solid var(--border)">
      <p style="color:var(--text-muted);font-size:var(--font-size-sm)">${label}</p>
      <p style="font-weight:600;font-size:var(--font-size-sm)">${value}</p>
    </div>`;
}

// ── Reload helper ─────────────────────────────────────────────────────

async function _reload(section) {
  const [p, h] = await Promise.all([_fetchProfil(), _fetchHistPoids()]);
  _render(section, p, h);
}

// ── Modal identité ────────────────────────────────────────────────────

function _openIdentiteModal(profil, section) {
  const overlay = _createOverlay(`
    <h3 style="font-weight:800;margin-bottom:var(--space-5)">Profil personnel</h3>
    <div style="display:flex;flex-direction:column;gap:var(--space-4);margin-bottom:var(--space-5)">
      <div class="form-group">
        <label class="form-label">Âge</label>
        <input class="form-input" id="m-age" type="number" min="10" max="100"
          value="${profil.age ?? ''}" placeholder="25" inputmode="numeric">
      </div>
      <div class="form-group">
        <label class="form-label">Sexe</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${SEXES.map(s => `
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 14px;
              border-radius:var(--radius-md);border:2px solid ${profil.sexe === s.value ? 'var(--color-primary)' : 'var(--border)'};
              background:${profil.sexe === s.value ? 'var(--color-primary-light)' : ''};flex:1;min-width:80px;justify-content:center">
              <input type="radio" name="m-sexe" value="${s.value}" ${profil.sexe === s.value ? 'checked' : ''} style="display:none">
              <span style="font-size:var(--font-size-sm);font-weight:600;color:${profil.sexe === s.value ? 'var(--color-primary)' : ''}">${s.label}</span>
            </label>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Taille (cm)</label>
        <input class="form-input" id="m-taille" type="number" min="100" max="250"
          value="${profil.taille_cm ?? ''}" placeholder="178" inputmode="numeric">
      </div>
    </div>
    <div style="display:flex;gap:var(--space-3)">
      <button class="btn btn-secondary" id="m-cancel" style="flex:1">Annuler</button>
      <button class="btn btn-primary" id="m-save" style="flex:2">Enregistrer</button>
    </div>`);

  // Highlight radio on click
  overlay.querySelectorAll('input[name="m-sexe"]').forEach(r => {
    r.addEventListener('change', () => {
      overlay.querySelectorAll('label').forEach(l => {
        const inp = l.querySelector('input[name="m-sexe"]');
        if (!inp) return;
        l.style.borderColor = inp.checked ? 'var(--color-primary)' : 'var(--border)';
        l.style.background  = inp.checked ? 'var(--color-primary-light)' : '';
        l.querySelector('span').style.color = inp.checked ? 'var(--color-primary)' : '';
      });
    });
  });

  overlay.querySelector('#m-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#m-save').addEventListener('click', async () => {
    const age    = parseInt(overlay.querySelector('#m-age').value)    || null;
    const taille = parseInt(overlay.querySelector('#m-taille').value) || null;
    const sexe   = overlay.querySelector('input[name="m-sexe"]:checked')?.value || null;
    try {
      await supabase.from('profils').upsert({ user_id: currentUser.id, age, taille_cm: taille, sexe }, { onConflict: 'user_id' });
      showToast('Profil mis à jour', 'success');
      overlay.remove();
      await _reload(section);
    } catch { showToast('Erreur lors de l\'enregistrement', 'error'); }
  });
}

// ── Modal programme ───────────────────────────────────────────────────

function _openProgrammeModal(profil, section) {
  const overlay = _createOverlay(`
    <h3 style="font-weight:800;margin-bottom:var(--space-5)">Mon programme</h3>
    <div style="display:flex;flex-direction:column;gap:var(--space-5);margin-bottom:var(--space-5)">

      <div>
        <p class="form-label" style="margin-bottom:8px">Objectif</p>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${OBJECTIFS.map(o => `
            <button class="list-item clickable prog-opt" data-field="objectif" data-value="${o.value}"
              style="width:100%;text-align:left;border:2px solid ${profil.objectif === o.value ? 'var(--color-primary)' : 'var(--border)'};
                background:${profil.objectif === o.value ? 'var(--color-primary-light)' : ''}">
              <div class="item-body">
                <p class="item-title" style="color:${profil.objectif === o.value ? 'var(--color-primary)' : ''}">${o.label}</p>
                <p class="item-subtitle">${o.desc}</p>
              </div>
            </button>`).join('')}
        </div>
      </div>

      <div>
        <p class="form-label" style="margin-bottom:8px">Niveau</p>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${NIVEAUX.map(n => `
            <button class="list-item clickable prog-opt" data-field="niveau" data-value="${n.value}"
              style="width:100%;text-align:left;border:2px solid ${profil.niveau === n.value ? 'var(--color-primary)' : 'var(--border)'};
                background:${profil.niveau === n.value ? 'var(--color-primary-light)' : ''}">
              <div class="item-body">
                <p class="item-title" style="color:${profil.niveau === n.value ? 'var(--color-primary)' : ''}">${n.label}</p>
                <p class="item-subtitle">${n.desc}</p>
              </div>
            </button>`).join('')}
        </div>
      </div>

      <div>
        <p class="form-label" style="margin-bottom:8px">Fréquence</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${FREQUENCES.map(f => `
            <button class="prog-opt chip ${profil.frequence === f.value ? 'active' : ''}"
              data-field="frequence" data-value="${f.value}" data-type="int"
              style="flex:1;min-width:100px">${f.label}</button>`).join('')}
        </div>
      </div>

      <div>
        <p class="form-label" style="margin-bottom:8px">Lieu</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${LIEUX.map(l => `
            <button class="prog-opt chip ${profil.lieu === l.value ? 'active' : ''}"
              data-field="lieu" data-value="${l.value}"
              style="flex:1">${l.label}</button>`).join('')}
        </div>
      </div>

    </div>
    <div style="display:flex;gap:var(--space-3)">
      <button class="btn btn-secondary" id="prog-cancel" style="flex:1">Annuler</button>
      <button class="btn btn-primary" id="prog-save" style="flex:2">Enregistrer</button>
    </div>`);

  // State
  const sel = {
    objectif:  profil.objectif  || null,
    niveau:    profil.niveau    || null,
    frequence: profil.frequence || null,
    lieu:      profil.lieu      || null,
  };

  overlay.querySelectorAll('.prog-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.field;
      const val   = btn.dataset.type === 'int' ? parseInt(btn.dataset.value) : btn.dataset.value;
      sel[field]  = val;

      overlay.querySelectorAll(`.prog-opt[data-field="${field}"]`).forEach(b => {
        const isSelected = (btn.dataset.type === 'int' ? parseInt(b.dataset.value) : b.dataset.value) === val;
        // list-item style
        if (b.classList.contains('list-item')) {
          b.style.borderColor = isSelected ? 'var(--color-primary)' : 'var(--border)';
          b.style.background  = isSelected ? 'var(--color-primary-light)' : '';
          const title = b.querySelector('.item-title');
          if (title) title.style.color = isSelected ? 'var(--color-primary)' : '';
        }
        // chip style
        if (b.classList.contains('chip')) {
          b.classList.toggle('active', isSelected);
        }
      });
    });
  });

  overlay.querySelector('#prog-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#prog-save').addEventListener('click', async () => {
    try {
      await supabase.from('profils').upsert({
        user_id:   currentUser.id,
        objectif:  sel.objectif,
        niveau:    sel.niveau,
        frequence: sel.frequence,
        lieu:      sel.lieu,
      }, { onConflict: 'user_id' });
      showToast('Programme mis à jour', 'success');
      overlay.remove();
      await _reload(section);
    } catch { showToast('Erreur lors de l\'enregistrement', 'error'); }
  });
}

// ── Modal équipements ─────────────────────────────────────────────────

function _openEquipModal(profil, section) {
  const equip = Array.isArray(profil.equipements) ? [...profil.equipements] : [];

  const overlay = _createOverlay(`
    <h3 style="font-weight:800;margin-bottom:var(--space-5)">Mes équipements</h3>
    <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-bottom:var(--space-4)">Sélectionnez tout ce dont vous disposez</p>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:var(--space-6)">
      ${EQUIPEMENTS_ALL.map(e => `
        <button class="chip equip-chip ${equip.includes(e.value) ? 'active' : ''}"
          data-value="${e.value}">${e.label}</button>`).join('')}
    </div>
    <div style="display:flex;gap:var(--space-3)">
      <button class="btn btn-secondary" id="eq-cancel" style="flex:1">Annuler</button>
      <button class="btn btn-primary" id="eq-save" style="flex:2">Enregistrer</button>
    </div>`);

  overlay.querySelectorAll('.equip-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.value;
      if (equip.includes(val)) {
        equip.splice(equip.indexOf(val), 1);
        chip.classList.remove('active');
      } else {
        equip.push(val);
        chip.classList.add('active');
      }
    });
  });

  overlay.querySelector('#eq-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#eq-save').addEventListener('click', async () => {
    try {
      await supabase.from('profils').upsert({ user_id: currentUser.id, equipements: equip }, { onConflict: 'user_id' });
      showToast('Équipements mis à jour', 'success');
      overlay.remove();
      await _reload(section);
    } catch { showToast('Erreur lors de l\'enregistrement', 'error'); }
  });
}

// ── Modal log poids ───────────────────────────────────────────────────

function _openPoidsModal(isUpdate, section) {
  const overlay = _createOverlay(`
    <h3 style="font-weight:800;margin-bottom:var(--space-5)">${isUpdate ? 'Modifier le poids' : 'Enregistrer le poids'}</h3>
    <div class="form-group" style="margin-bottom:var(--space-5)">
      <label class="form-label">Poids (kg)</label>
      <input class="form-input" id="poids-input" type="number" step="0.1" min="20" max="300"
        placeholder="ex: 75.5" style="font-size:var(--font-size-2xl);font-weight:900;text-align:center" inputmode="decimal">
    </div>
    <div style="display:flex;gap:var(--space-3)">
      <button class="btn btn-secondary" id="poids-cancel" style="flex:1">Annuler</button>
      <button class="btn btn-primary" id="poids-save" style="flex:2">Enregistrer</button>
    </div>`);

  setTimeout(() => overlay.querySelector('#poids-input')?.focus(), 80);

  overlay.querySelector('#poids-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#poids-save').addEventListener('click', async () => {
    const val = parseFloat(overlay.querySelector('#poids-input').value);
    if (!val || val < 20 || val > 300) { showToast('Entrez un poids valide', 'warning'); return; }
    try {
      await supabase.from('historique_poids').upsert({
        user_id: currentUser.id, date: todayStr(), poids_kg: val,
      }, { onConflict: 'user_id,date' });
      showToast('Poids enregistré', 'success');
      overlay.remove();
      await _reload(section);
    } catch { showToast('Erreur lors de l\'enregistrement', 'error'); }
  });
}

// ── Supprimer une entrée de poids ─────────────────────────────────────

async function _deletePoids(date, section) {
  if (!await confirmDialog('Supprimer cette mesure ?')) return;
  try {
    await supabase.from('historique_poids').delete()
      .eq('user_id', currentUser.id).eq('date', date);
    showToast('Mesure supprimée', 'success');
    await _reload(section);
  } catch { showToast('Erreur', 'error'); }
}

// ── Overlay générique bottom-sheet ────────────────────────────────────

function _createOverlay(innerHTML) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);
    display:flex;align-items:flex-end;justify-content:center;z-index:300`;
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--radius-xl) var(--radius-xl) 0 0;
      width:100%;max-width:560px;padding:var(--space-6);max-height:90vh;overflow-y:auto">
      ${innerHTML}
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

// ── Graphique SVG poids ───────────────────────────────────────────────

function _svgPoidsChart(histPoids) {
  const data = [...histPoids].reverse();
  if (data.length < 2) return '';

  const W = 320, H = 100, padX = 36, padY = 12;
  const cW = W - padX * 2;
  const cH = H - padY * 2;

  const ys    = data.map(d => parseFloat(d.poids_kg));
  const minY  = Math.min(...ys) - 1;
  const maxY  = Math.max(...ys) + 1;
  const rangeY = maxY - minY;

  const pts = data.map((d, i) => {
    const sx = padX + (i / (data.length - 1)) * cW;
    const sy = padY + cH - ((parseFloat(d.poids_kg) - minY) / rangeY) * cH;
    return { sx, sy };
  });

  const polyline = pts.map(p => `${p.sx},${p.sy}`).join(' ');
  const areaPath = `M ${pts[0].sx},${padY+cH} ` + pts.map(p => `L ${p.sx},${p.sy}`).join(' ') + ` L ${pts.at(-1).sx},${padY+cH} Z`;

  return `
    <div style="overflow:hidden">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px">
        <defs>
          <linearGradient id="poids-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.2"/>
            <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="${padX}" y1="${padY}" x2="${padX}" y2="${padY+cH}" stroke="var(--border)" stroke-width="1"/>
        <line x1="${padX}" y1="${padY+cH}" x2="${W-padX}" y2="${padY+cH}" stroke="var(--border)" stroke-width="1"/>
        <path d="${areaPath}" fill="url(#poids-grad)"/>
        <polyline points="${polyline}" fill="none" stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${pts.at(-1).sx}" cy="${pts.at(-1).sy}" r="4" fill="var(--color-primary)" stroke="var(--surface)" stroke-width="2"/>
        <text x="${padX-4}" y="${padY+4}" fill="var(--text-muted)" font-size="9" text-anchor="end" font-weight="600">${Math.round(maxY)}</text>
        <text x="${padX-4}" y="${padY+cH}" fill="var(--text-muted)" font-size="9" text-anchor="end" font-weight="600">${Math.round(minY)}</text>
      </svg>
    </div>`;
}
