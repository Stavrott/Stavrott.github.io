// Lancement rapide d'une séance — depuis le bouton accueil ou l'appui
// long sur l'onglet "Séances" de la nav du bas. Regroupe les routines
// ("Mes routines") et les programmes (prédéfinis + personnalisés).
import { currentUser }   from './auth.js';
import { supabase }      from './supabase.js';
import { navigate }      from './router.js';
import { openModal, closeModal } from './utils.js';
import { lancerRoutine, lancerJour, PREDEFINED } from '../pages/programmes.js';

export async function openQuickLaunchModal() {
  openModal({
    title: 'Démarrer',
    body: `<div id="ql-body">${_skeleton()}</div>`,
  });

  const body = document.getElementById('ql-body');

  try {
    const [{ data: routines, error: rErr }, { data: customProgs, error: pErr }] = await Promise.all([
      supabase.from('routines').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: true }),
      supabase.from('programmes').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }),
    ]);
    if (rErr) throw rErr;
    if (pErr) throw pErr;

    const programmes = [
      ...PREDEFINED.map(p => ({ nom: p.nom, jours: p.jours })),
      ...(customProgs ?? []).map(p => ({ nom: p.nom, jours: p.structure ?? [] })),
    ];

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:6px">
        <div class="list-item clickable" id="ql-free" style="gap:10px">
          <div class="item-icon" style="flex-shrink:0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <div class="item-body">
            <p class="item-title">Séance libre</p>
            <p class="item-subtitle">Sans routine pré-définie</p>
          </div>
        </div>

        ${(routines ?? []).length ? `
          <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
            color:var(--text-muted);margin:var(--space-3) 0 2px">Mes routines</p>
          ${routines.map(r => `
            <div class="list-item clickable" data-ql-rid="${r.id}" style="gap:10px">
              <div class="item-icon" style="background:var(--color-primary-light);color:var(--color-primary);flex-shrink:0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M6 5v14M18 5v14M3 8h3m12 0h3M3 16h3m12 0h3"/>
                </svg>
              </div>
              <div class="item-body">
                <p class="item-title">${r.nom}</p>
                <p class="item-subtitle">${(r.exercices ?? []).length} exercice${(r.exercices ?? []).length !== 1 ? 's' : ''}</p>
              </div>
            </div>`).join('')}
        ` : ''}

        ${programmes.length ? `
          <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
            color:var(--text-muted);margin:var(--space-3) 0 2px">Programmes</p>
          ${programmes.map((p, i) => `
            <div class="list-item clickable" data-ql-prog="${i}" style="gap:10px">
              <div class="item-icon" style="background:var(--color-primary-light);color:var(--color-primary);flex-shrink:0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <div class="item-body">
                <p class="item-title">${p.nom}</p>
                <p class="item-subtitle">${p.jours.length} jour${p.jours.length !== 1 ? 's' : ''}</p>
              </div>
            </div>`).join('')}
        ` : ''}
      </div>`;

    body.querySelector('#ql-free')?.addEventListener('click', () => {
      closeModal();
      navigate('seances');
    });

    body.querySelectorAll('[data-ql-rid]').forEach(item => {
      item.addEventListener('click', () => {
        const r = (routines ?? []).find(x => x.id === item.dataset.qlRid);
        if (!r) return;
        closeModal();
        lancerRoutine(r);
      });
    });

    body.querySelectorAll('[data-ql-prog]').forEach(item => {
      item.addEventListener('click', () => {
        const prog = programmes[parseInt(item.dataset.qlProg)];
        if (!prog) return;
        if (prog.jours.length <= 1) {
          closeModal();
          lancerJour(prog, prog.jours[0]);
        } else {
          _showJourPicker(prog);
        }
      });
    });
  } catch {
    body.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Erreur de chargement</p>`;
  }
}

function _showJourPicker(prog) {
  openModal({
    title: `Lancer — ${prog.nom}`,
    body: `
      <div style="display:flex;flex-direction:column;gap:6px">
        ${prog.jours.map((j, i) => `
          <div class="list-item clickable" data-ql-jour="${i}" style="gap:10px">
            <div class="item-body">
              <p class="item-title">${j.nom}</p>
              <p class="item-subtitle">${(j.exercices ?? []).length} exercice${(j.exercices ?? []).length !== 1 ? 's' : ''}</p>
            </div>
          </div>`).join('')}
      </div>`,
  });

  document.querySelectorAll('[data-ql-jour]').forEach(btn => {
    btn.addEventListener('click', () => {
      const jour = prog.jours[parseInt(btn.dataset.qlJour)];
      lancerJour(prog, jour);
    });
  });
}

function _skeleton() {
  return `
    <div class="skeleton skeleton-card" style="margin-bottom:8px"></div>
    <div class="skeleton skeleton-card" style="margin-bottom:8px"></div>
    <div class="skeleton skeleton-card"></div>`;
}
