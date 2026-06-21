// Page Nutrition — calories, macros, micro-nutriments
import { currentUser }  from '../js/auth.js';
import { supabase }     from '../js/supabase.js';
import { showToast, todayStr, formatDate, openModal, confirmDialog } from '../js/utils.js';
import { calcIMC, imcCategorie, calcMetabolismeBase, calcDepenseTotale, calcCaloriesRecommandees, calcMacrosRecommandees } from '../js/calories.js';
import { navigate } from '../js/router.js';

export async function loadNutrition(section) {
  section.innerHTML = `
    <div class="tabs" id="nutri-tabs">
      <button class="tab active" data-tab="journal">Journal</button>
      <button class="tab" data-tab="objectifs">Objectifs</button>
    </div>
    <div id="nutri-content">
      ${skeletonNutri()}
    </div>
    <button class="fab" id="btn-add-repas" aria-label="Ajouter un repas">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:24px;height:24px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>`;

  await renderJournal(section, todayStr());

  section.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      section.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      if (tab.dataset.tab === 'journal') renderJournal(section, todayStr());
      else renderObjectifs(section);
    });
  });

  section.querySelector('#btn-add-repas')?.addEventListener('click', () => openAddRepasModal(section));
}

function skeletonNutri() {
  return `
    <div class="skeleton" style="height:100px;border-radius:var(--radius-lg);margin-bottom:var(--space-4)"></div>
    <div class="skeleton skeleton-card" style="margin-bottom:var(--space-3)"></div>
    <div class="skeleton skeleton-card"></div>`;
}

async function renderJournal(section, date) {
  const content = section.querySelector('#nutri-content');
  content.innerHTML = skeletonNutri();

  try {
    const [{ data: repas }, { data: objectifs }, { data: seancesJour }] = await Promise.all([
      supabase.from('nutrition').select('*').eq('user_id', currentUser.id).eq('date', date).order('created_at'),
      supabase.from('objectifs_nutrition').select('*').eq('user_id', currentUser.id).maybeSingle(),
      supabase.from('seances').select('calories_estimees').eq('user_id', currentUser.id).eq('date', date),
    ]);

    const obj = objectifs || { calories: 2000, proteines: 150, glucides: 200, lipides: 70 };
    const totaux = (repas ?? []).reduce((acc, r) => {
      acc.calories  += r.calories  || 0;
      acc.proteines += r.proteines || 0;
      acc.glucides  += r.glucides  || 0;
      acc.lipides   += r.lipides   || 0;
      return acc;
    }, { calories: 0, proteines: 0, glucides: 0, lipides: 0 });

    const caloriesBrulees = (seancesJour ?? []).reduce((s, x) => s + (x.calories_estimees || 0), 0);
    const bilan = totaux.calories - caloriesBrulees;

    const pct = (v, max) => Math.min(Math.round((v / max) * 100), 100);

    content.innerHTML = `
      <!-- Résumé calories -->
      <div class="card page-section">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-3)">
          <div>
            <p style="font-size:var(--font-size-xs);font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">Calories aujourd'hui</p>
            <p style="font-size:var(--font-size-3xl);font-weight:800;margin-top:4px;color:var(--color-primary)">${totaux.calories} <span style="font-size:var(--font-size-md);color:var(--text-muted)">/ ${obj.calories} kcal</span></p>
          </div>
          <div style="text-align:right">
            <p style="font-size:var(--font-size-xs);color:var(--text-muted)">Restant</p>
            <p style="font-size:var(--font-size-xl);font-weight:800">${Math.max(obj.calories - totaux.calories, 0)}</p>
          </div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct(totaux.calories, obj.calories)}%"></div>
        </div>
      </div>

      <!-- Macros -->
      <div class="macro-grid page-section">
        <div class="macro-item protein">
          <p class="macro-value">${totaux.proteines}g</p>
          <p class="macro-label">Protéines</p>
          <div class="progress-bar" style="margin-top:var(--space-2)">
            <div class="progress-fill" style="background:#3b82f6;width:${pct(totaux.proteines, obj.proteines)}%"></div>
          </div>
          <p style="font-size:10px;color:var(--text-muted);margin-top:4px">/ ${obj.proteines}g</p>
        </div>
        <div class="macro-item carbs">
          <p class="macro-value">${totaux.glucides}g</p>
          <p class="macro-label">Glucides</p>
          <div class="progress-bar" style="margin-top:var(--space-2)">
            <div class="progress-fill" style="background:#f59e0b;width:${pct(totaux.glucides, obj.glucides)}%"></div>
          </div>
          <p style="font-size:10px;color:var(--text-muted);margin-top:4px">/ ${obj.glucides}g</p>
        </div>
        <div class="macro-item fat">
          <p class="macro-value">${totaux.lipides}g</p>
          <p class="macro-label">Lipides</p>
          <div class="progress-bar" style="margin-top:var(--space-2)">
            <div class="progress-fill" style="background:#ef4444;width:${pct(totaux.lipides, obj.lipides)}%"></div>
          </div>
          <p style="font-size:10px;color:var(--text-muted);margin-top:4px">/ ${obj.lipides}g</p>
        </div>
      </div>

      <!-- Bilan ingérées / brûlées -->
      <div class="card page-section">
        <p class="card-title" style="margin-bottom:var(--space-3)">Bilan calorique du jour</p>
        <div style="display:flex;align-items:center;justify-content:space-around;text-align:center;gap:var(--space-2)">
          <div>
            <p style="font-size:var(--font-size-2xl);font-weight:800;color:var(--color-primary)">${totaux.calories}</p>
            <p style="font-size:var(--font-size-xs);color:var(--text-muted)">Ingérées</p>
          </div>
          <span style="font-size:var(--font-size-xl);color:var(--text-muted)">−</span>
          <div>
            <p style="font-size:var(--font-size-2xl);font-weight:800;color:var(--color-success)">${caloriesBrulees}</p>
            <p style="font-size:var(--font-size-xs);color:var(--text-muted)">Brûlées (séances)</p>
          </div>
          <span style="font-size:var(--font-size-xl);color:var(--text-muted)">=</span>
          <div>
            <p style="font-size:var(--font-size-2xl);font-weight:800;color:${bilan > 0 ? 'var(--color-warning)' : 'var(--color-success)'}">${bilan > 0 ? '+' : ''}${bilan}</p>
            <p style="font-size:var(--font-size-xs);color:var(--text-muted)">Bilan</p>
          </div>
        </div>
      </div>

      <!-- Liste des repas -->
      <div class="page-section">
        <h3 class="section-title" style="margin-bottom:var(--space-3)">Repas du jour</h3>
        <div class="item-list" id="repas-list">
          ${(repas ?? []).length === 0
            ? `<p style="color:var(--text-muted);font-size:var(--font-size-sm);text-align:center;padding:var(--space-6) 0">Aucun repas enregistré aujourd'hui</p>`
            : (repas ?? []).map(renderRepasItem).join('')}
        </div>
      </div>`;

    content.querySelectorAll('[data-del-repas]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteRepas(section, btn.dataset.delRepas, btn.dataset.delNom);
      });
    });
  } catch {
    content.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Erreur de chargement</p>`;
  }
}

function renderRepasItem(r) {
  return `
    <div class="list-item">
      <div class="item-icon accent">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/>
          <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
        </svg>
      </div>
      <div class="item-body">
        <p class="item-title">${r.nom || 'Repas'}</p>
        <p class="item-subtitle">P: ${r.proteines || 0}g • G: ${r.glucides || 0}g • L: ${r.lipides || 0}g</p>
      </div>
      <div class="item-meta">
        <p class="item-meta-primary">${r.calories || 0} kcal</p>
      </div>
      <button class="icon-btn" data-del-repas="${r.id}" data-del-nom="${r.nom || 'Repas'}"
        aria-label="Supprimer" style="color:var(--color-error);flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
        </svg>
      </button>
    </div>`;
}

async function deleteRepas(section, id, nom) {
  if (!await confirmDialog(`Supprimer "${nom}" ? Cette action est définitive.`)) return;
  try {
    const { error } = await supabase.from('nutrition').delete().eq('id', id);
    if (error) throw error;
    showToast('Repas supprimé', 'success');
    await renderJournal(section, todayStr());
  } catch {
    showToast('Erreur lors de la suppression', 'error');
  }
}

async function renderObjectifs(section) {
  const content = section.querySelector('#nutri-content');
  content.innerHTML = skeletonNutri();

  try {
    const { getProfilPhysique } = await import('./profil.js');
    const [{ data: objectifs }, physique] = await Promise.all([
      supabase.from('objectifs_nutrition').select('*').eq('user_id', currentUser.id).maybeSingle(),
      getProfilPhysique(),
    ]);

    const obj = objectifs || { calories: 2000, proteines: 150, glucides: 200, lipides: 70 };

    const imc  = calcIMC(physique?.poids_kg, physique?.taille_cm);
    const bmr  = calcMetabolismeBase(physique?.poids_kg, physique?.taille_cm, physique?.age, physique?.sexe);
    const tdee   = calcDepenseTotale(bmr, physique?.frequence);
    const reco   = calcCaloriesRecommandees(tdee, physique?.objectif);
    const macros = calcMacrosRecommandees(reco, physique?.poids_kg, physique?.objectif);

    content.innerHTML = `
      <div class="page-section">
        <h3 class="section-title" style="margin-bottom:var(--space-3)">Bilan métabolique</h3>
        ${imc && bmr && tdee ? `
        <div class="card">
          <div style="display:flex;justify-content:space-around;text-align:center;gap:var(--space-2)">
            <div>
              <p class="card-value" style="font-size:var(--font-size-xl)">${imc.toFixed(1)}</p>
              <p class="card-label">IMC</p>
              <p style="font-size:10px;color:var(--text-muted);margin-top:2px">${imcCategorie(imc)}</p>
            </div>
            <div>
              <p class="card-value" style="font-size:var(--font-size-xl)">${bmr}</p>
              <p class="card-label">Métabolisme de base</p>
              <p style="font-size:10px;color:var(--text-muted);margin-top:2px">kcal/j au repos</p>
            </div>
            <div>
              <p class="card-value" style="font-size:var(--font-size-xl)">${tdee}</p>
              <p class="card-label">Dépense totale</p>
              <p style="font-size:10px;color:var(--text-muted);margin-top:2px">kcal/j estimés</p>
            </div>
          </div>
          ${reco ? `
          <div style="margin-top:var(--space-4);padding-top:var(--space-4);border-top:1px solid var(--border);
            display:flex;justify-content:space-between;align-items:center;gap:var(--space-3)">
            <div>
              <p class="card-label">Recommandé pour ton objectif</p>
              <p class="card-value" style="color:var(--color-primary)">${reco}<span class="card-unit"> kcal/j</span></p>
              ${macros ? `<p style="font-size:11px;color:var(--text-muted);margin-top:2px">
                P ${macros.proteines}g · G ${macros.glucides}g · L ${macros.lipides}g</p>` : ''}
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-apply-reco">Utiliser</button>
          </div>` : ''}
        </div>` : `
        <div class="card">
          <p style="color:var(--text-muted);font-size:var(--font-size-sm)">
            Renseigne ton âge, ta taille, ton sexe, ton poids et ton objectif dans ton
            <a href="#" id="link-profil-metabo" style="color:var(--color-primary);font-weight:700">profil</a>
            pour estimer tes besoins caloriques.
          </p>
        </div>`}
      </div>

      <div class="page-section">
        <h3 class="section-title" style="margin-bottom:var(--space-3)">Objectifs quotidiens</h3>
        <div class="card" style="display:flex;flex-direction:column;gap:var(--space-4)">
          <div class="form-group">
            <label class="form-label">Calories (kcal)</label>
            <input class="form-input" id="obj-cal" type="number" min="0" value="${obj.calories}">
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Protéines (g)</label>
              <input class="form-input" id="obj-prot" type="number" min="0" value="${obj.proteines}">
            </div>
            <div class="form-group">
              <label class="form-label">Glucides (g)</label>
              <input class="form-input" id="obj-gluc" type="number" min="0" value="${obj.glucides}">
            </div>
            <div class="form-group">
              <label class="form-label">Lipides (g)</label>
              <input class="form-input" id="obj-lip" type="number" min="0" value="${obj.lipides}">
            </div>
          </div>
          <button class="btn btn-primary btn-full" id="btn-save-objectifs">Enregistrer</button>
        </div>
      </div>`;

    content.querySelector('#btn-apply-reco')?.addEventListener('click', () => {
      const calInp = content.querySelector('#obj-cal');
      if (calInp) calInp.value = reco;
      if (macros) {
        const protInp = content.querySelector('#obj-prot');
        const glucInp = content.querySelector('#obj-gluc');
        const lipInp  = content.querySelector('#obj-lip');
        if (protInp) protInp.value = macros.proteines;
        if (glucInp) glucInp.value = macros.glucides;
        if (lipInp)  lipInp.value  = macros.lipides;
      }
      showToast('Valeurs appliquées — n\'oublie pas d\'enregistrer', 'info');
    });
    content.querySelector('#link-profil-metabo')?.addEventListener('click', e => {
      e.preventDefault();
      navigate('profil');
    });

    content.querySelector('#btn-save-objectifs')?.addEventListener('click', async () => {
      const calories  = parseFloat(content.querySelector('#obj-cal')?.value)  || 0;
      const proteines = parseFloat(content.querySelector('#obj-prot')?.value) || 0;
      const glucides  = parseFloat(content.querySelector('#obj-gluc')?.value) || 0;
      const lipides   = parseFloat(content.querySelector('#obj-lip')?.value)  || 0;

      try {
        const { error } = await supabase.from('objectifs_nutrition').upsert({
          user_id: currentUser.id,
          calories, proteines, glucides, lipides,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (error) throw error;
        showToast('Objectifs enregistrés !', 'success');
      } catch {
        showToast('Erreur lors de l\'enregistrement', 'error');
      }
    });
  } catch {
    content.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Erreur de chargement</p>`;
  }
}

function openAddRepasModal(section) {
  openModal({
    title: 'Ajouter un repas',
    body: `
      <div style="display:flex;flex-direction:column;gap:var(--space-4)">
        <div class="form-group">
          <label class="form-label">Nom du repas / aliment</label>
          <input class="form-input" id="repas-nom" placeholder="ex: Poulet riz brocolis" type="text">
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Calories (kcal)</label>
            <input class="form-input" id="repas-cal" type="number" min="0" placeholder="500">
          </div>
          <div class="form-group">
            <label class="form-label">Protéines (g)</label>
            <input class="form-input" id="repas-prot" type="number" min="0" placeholder="40">
          </div>
          <div class="form-group">
            <label class="form-label">Glucides (g)</label>
            <input class="form-input" id="repas-gluc" type="number" min="0" placeholder="60">
          </div>
          <div class="form-group">
            <label class="form-label">Lipides (g)</label>
            <input class="form-input" id="repas-lip" type="number" min="0" placeholder="15">
          </div>
        </div>
      </div>`,
    footer: `
      <button class="btn btn-secondary" id="modal-cancel">Annuler</button>
      <button class="btn btn-primary" id="modal-save" style="flex:1">Enregistrer</button>`,
  });

  document.getElementById('modal-cancel')?.addEventListener('click', () => {
    document.getElementById('modal-overlay').classList.add('hidden');
  });

  document.getElementById('modal-save')?.addEventListener('click', async () => {
    const nom      = document.getElementById('repas-nom')?.value.trim();
    const calories = parseFloat(document.getElementById('repas-cal')?.value)  || 0;
    const proteines= parseFloat(document.getElementById('repas-prot')?.value) || 0;
    const glucides = parseFloat(document.getElementById('repas-gluc')?.value) || 0;
    const lipides  = parseFloat(document.getElementById('repas-lip')?.value)  || 0;

    if (!nom) { showToast('Entrez un nom de repas', 'warning'); return; }

    try {
      await supabase.from('nutrition').insert({
        user_id: currentUser.id,
        date: todayStr(),
        nom, calories, proteines, glucides, lipides,
      });
      document.getElementById('modal-overlay').classList.add('hidden');
      showToast('Repas ajouté !', 'success');
      await renderJournal(section, todayStr());
    } catch {
      showToast('Erreur lors de l\'enregistrement', 'error');
    }
  });
}
