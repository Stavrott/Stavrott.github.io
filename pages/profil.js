import { currentUser, getUserPrenom } from '../js/auth.js';
import { supabase }  from '../js/supabase.js';
import { showToast, todayStr } from '../js/utils.js';

const OBJECTIFS = [
  { value: 'hypertrophie', label: 'Hypertrophie', desc: 'Développer la masse musculaire' },
  { value: 'force',        label: 'Force',        desc: 'Augmenter les performances max' },
  { value: 'seche',        label: 'Sèche',        desc: 'Réduire la masse grasse' },
  { value: 'endurance',    label: 'Endurance',    desc: 'Améliorer le cardio et l\'endurance' },
  { value: 'maintenance',  label: 'Maintenance',  desc: 'Maintenir la condition actuelle' },
];

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

// ── Rendu ─────────────────────────────────────────────────────────────

function _render(section, profil, histPoids) {
  const prenom    = getUserPrenom() || 'Utilisateur';
  const initial   = prenom.charAt(0).toUpperCase();
  const poidsActuel = histPoids[0]?.poids_kg ?? profil.poids_kg ?? null;
  const objectif  = OBJECTIFS.find(o => o.value === (profil.objectif ?? 'hypertrophie')) ?? OBJECTIFS[0];
  const today     = todayStr();
  const hasToday  = histPoids[0]?.date === today;

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

    <!-- Poids actuel -->
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

    <!-- Objectif -->
    <div class="page-section">
      <div class="section-header">
        <h3 class="section-title">Objectif</h3>
        <button class="btn btn-ghost btn-sm" id="btn-edit-objectif" style="color:var(--color-primary)">Modifier</button>
      </div>
      <div class="card" style="display:flex;align-items:center;gap:var(--space-3)">
        <div style="width:44px;height:44px;border-radius:var(--radius-md);background:var(--color-primary-light);
          display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${_objectifIcon(objectif.value)}
        </div>
        <div>
          <p style="font-weight:800">${objectif.label}</p>
          <p style="font-size:var(--font-size-xs);color:var(--text-muted)">${objectif.desc}</p>
        </div>
      </div>
    </div>

    <!-- Mensurations -->
    <div class="page-section">
      <div class="section-header">
        <h3 class="section-title">Mensurations</h3>
        <button class="btn btn-ghost btn-sm" id="btn-edit-mensur" style="color:var(--color-primary)">Modifier</button>
      </div>
      <div class="grid-2">
        <div class="card" style="text-align:center">
          <p class="card-title">Taille</p>
          <p class="card-value">${profil.taille_cm ?? '—'}<span>${profil.taille_cm ? ' cm' : ''}</span></p>
        </div>
        <div class="card" style="text-align:center">
          <p class="card-title">Poids cible</p>
          <p class="card-value">${profil.objectif_poids_kg ?? '—'}<span>${profil.objectif_poids_kg ? ' kg' : ''}</span></p>
        </div>
      </div>
    </div>

    <!-- Historique poids table -->
    ${histPoids.length ? `
    <div class="page-section">
      <h3 class="section-title" style="margin-bottom:var(--space-3)">Historique</h3>
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

  // Événements
  section.querySelector('#btn-log-poids')?.addEventListener('click', () => _openPoidsModal(false, section));
  section.querySelector('#btn-update-poids')?.addEventListener('click', () => _openPoidsModal(true, section));
  section.querySelector('#btn-edit-objectif')?.addEventListener('click', () => _openObjectifModal(profil, section));
  section.querySelector('#btn-edit-mensur')?.addEventListener('click', () => _openMensurModal(profil, section));

  section.querySelectorAll('[data-del-poids]').forEach(btn => {
    btn.addEventListener('click', () => _deletePoids(btn.dataset.delPoids, section));
  });
}

// ── Modal log poids ───────────────────────────────────────────────────

function _openPoidsModal(isUpdate, section) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);
    display:flex;align-items:flex-end;justify-content:center;z-index:300`;
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--radius-xl) var(--radius-xl) 0 0;
      width:100%;max-width:560px;padding:var(--space-6)">
      <h3 style="font-weight:800;margin-bottom:var(--space-5)">${isUpdate ? 'Modifier le poids' : 'Enregistrer le poids'}</h3>
      <div class="form-group" style="margin-bottom:var(--space-5)">
        <label class="form-label">Poids (kg)</label>
        <input class="form-input" id="poids-input" type="number" step="0.1" min="20" max="300"
          placeholder="ex: 75.5" style="font-size:var(--font-size-2xl);font-weight:900;text-align:center" inputmode="decimal">
      </div>
      <div style="display:flex;gap:var(--space-3)">
        <button class="btn btn-secondary" id="poids-cancel" style="flex:1">Annuler</button>
        <button class="btn btn-primary" id="poids-save" style="flex:2">Enregistrer</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  setTimeout(() => overlay.querySelector('#poids-input')?.focus(), 80);

  const close = () => overlay.remove();
  overlay.querySelector('#poids-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('#poids-save').addEventListener('click', async () => {
    const val = parseFloat(overlay.querySelector('#poids-input').value);
    if (!val || val < 20 || val > 300) { showToast('Entrez un poids valide', 'warning'); return; }
    try {
      await supabase.from('historique_poids').upsert({
        user_id: currentUser.id, date: todayStr(), poids_kg: val,
      }, { onConflict: 'user_id,date' });
      showToast('Poids enregistré', 'success');
      close();
      const [profil, hist] = await Promise.all([_fetchProfil(), _fetchHistPoids()]);
      _render(section, profil, hist);
    } catch {
      showToast('Erreur lors de l\'enregistrement', 'error');
    }
  });
}

// ── Modal objectif ────────────────────────────────────────────────────

function _openObjectifModal(profil, section) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);
    display:flex;align-items:flex-end;justify-content:center;z-index:300`;
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--radius-xl) var(--radius-xl) 0 0;
      width:100%;max-width:560px;padding:var(--space-6)">
      <h3 style="font-weight:800;margin-bottom:var(--space-5)">Mon objectif</h3>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-5)">
        ${OBJECTIFS.map(o => `
          <button class="list-item ${(profil.objectif ?? 'hypertrophie') === o.value ? 'clickable' : 'clickable'}"
            data-obj="${o.value}"
            style="width:100%;text-align:left;border:2px solid ${(profil.objectif ?? 'hypertrophie') === o.value ? 'var(--color-primary)' : 'var(--border)'};
              background:${(profil.objectif ?? 'hypertrophie') === o.value ? 'var(--color-primary-light)' : ''}">
            <div class="item-body">
              <p class="item-title" style="color:${(profil.objectif ?? 'hypertrophie') === o.value ? 'var(--color-primary)' : ''}">${o.label}</p>
              <p class="item-subtitle">${o.desc}</p>
            </div>
            ${(profil.objectif ?? 'hypertrophie') === o.value
              ? `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round" style="width:18px;height:18px"><polyline points="20 6 9 17 4 12"/></svg>`
              : ''}
          </button>`).join('')}
      </div>
      <button class="btn btn-secondary btn-full" id="obj-cancel">Fermer</button>
    </div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#obj-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelectorAll('[data-obj]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const val = btn.dataset.obj;
      try {
        await supabase.from('profils').upsert({ user_id: currentUser.id, objectif: val }, { onConflict: 'user_id' });
        showToast('Objectif mis à jour', 'success');
        close();
        const [p, h] = await Promise.all([_fetchProfil(), _fetchHistPoids()]);
        _render(section, p, h);
      } catch { showToast('Erreur', 'error'); }
    });
  });
}

// ── Modal mensurations ────────────────────────────────────────────────

function _openMensurModal(profil, section) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);
    display:flex;align-items:flex-end;justify-content:center;z-index:300`;
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--radius-xl) var(--radius-xl) 0 0;
      width:100%;max-width:560px;padding:var(--space-6)">
      <h3 style="font-weight:800;margin-bottom:var(--space-5)">Mensurations</h3>
      <div style="display:flex;flex-direction:column;gap:var(--space-4);margin-bottom:var(--space-5)">
        <div class="form-group">
          <label class="form-label">Taille (cm)</label>
          <input class="form-input" id="m-taille" type="number" min="100" max="250"
            value="${profil.taille_cm ?? ''}" placeholder="ex: 178" inputmode="numeric">
        </div>
        <div class="form-group">
          <label class="form-label">Poids cible (kg)</label>
          <input class="form-input" id="m-poidscible" type="number" step="0.5" min="30" max="300"
            value="${profil.objectif_poids_kg ?? ''}" placeholder="ex: 82" inputmode="decimal">
        </div>
      </div>
      <div style="display:flex;gap:var(--space-3)">
        <button class="btn btn-secondary" id="m-cancel" style="flex:1">Annuler</button>
        <button class="btn btn-primary" id="m-save" style="flex:2">Enregistrer</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#m-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('#m-save').addEventListener('click', async () => {
    const taille     = parseInt(overlay.querySelector('#m-taille').value) || null;
    const poidsObj   = parseFloat(overlay.querySelector('#m-poidscible').value) || null;
    try {
      await supabase.from('profils').upsert({
        user_id: currentUser.id,
        taille_cm: taille,
        objectif_poids_kg: poidsObj,
      }, { onConflict: 'user_id' });
      showToast('Mensurations mises à jour', 'success');
      close();
      const [p, h] = await Promise.all([_fetchProfil(), _fetchHistPoids()]);
      _render(section, p, h);
    } catch { showToast('Erreur', 'error'); }
  });
}

// ── Supprimer une entrée de poids ─────────────────────────────────────

async function _deletePoids(date, section) {
  if (!confirm('Supprimer cette mesure ?')) return;
  try {
    await supabase.from('historique_poids').delete()
      .eq('user_id', currentUser.id).eq('date', date);
    showToast('Mesure supprimée', 'success');
    const [p, h] = await Promise.all([_fetchProfil(), _fetchHistPoids()]);
    _render(section, p, h);
  } catch { showToast('Erreur', 'error'); }
}

// ── Graphique SVG poids ───────────────────────────────────────────────

function _svgPoidsChart(histPoids) {
  const data = [...histPoids].reverse(); // du plus ancien au plus récent
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
    return { sx, sy, kg: parseFloat(d.poids_kg) };
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
        <text x="${padX - 4}" y="${padY + 4}" fill="var(--text-muted)" font-size="9" text-anchor="end" font-weight="600">${Math.round(maxY)}</text>
        <text x="${padX - 4}" y="${padY + cH}" fill="var(--text-muted)" font-size="9" text-anchor="end" font-weight="600">${Math.round(minY)}</text>
      </svg>
    </div>`;
}

// ── Icône objectif ────────────────────────────────────────────────────

function _objectifIcon(val) {
  const icons = {
    hypertrophie: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;color:var(--color-primary)"><path d="M6 5v14M18 5v14M3 8h3m12 0h3M3 16h3m12 0h3"/></svg>`,
    force:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:20px;height:20px;color:var(--color-primary)"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
    seche:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:20px;height:20px;color:var(--color-primary)"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
    endurance:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:20px;height:20px;color:var(--color-primary)"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    maintenance:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:20px;height:20px;color:var(--color-primary)"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  };
  return icons[val] ?? icons.hypertrophie;
}
