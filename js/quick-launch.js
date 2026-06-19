// Lancement rapide d'une routine — depuis le bouton accueil ou l'appui
// long sur l'onglet "Séances" de la nav du bas.
import { currentUser }   from './auth.js';
import { supabase }      from './supabase.js';
import { navigate }      from './router.js';
import { openModal, closeModal } from './utils.js';
import { lancerRoutine } from '../pages/programmes.js';

export async function openQuickLaunchModal() {
  openModal({
    title: 'Démarrer',
    body: `<div id="ql-body">${_skeleton()}</div>`,
  });

  const body = document.getElementById('ql-body');

  try {
    const { data, error } = await supabase
      .from('routines').select('*').eq('user_id', currentUser.id)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const routines = data ?? [];

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
        ${routines.length === 0
          ? `<p style="color:var(--text-muted);font-size:var(--font-size-sm);text-align:center;padding:var(--space-4) 0">Aucune routine enregistrée</p>`
          : routines.map(r => `
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
      </div>`;

    body.querySelector('#ql-free')?.addEventListener('click', () => {
      closeModal();
      navigate('seances');
    });

    body.querySelectorAll('[data-ql-rid]').forEach(item => {
      item.addEventListener('click', () => {
        const r = routines.find(x => x.id === item.dataset.qlRid);
        if (!r) return;
        closeModal();
        lancerRoutine(r);
      });
    });
  } catch {
    body.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Erreur de chargement</p>`;
  }
}

function _skeleton() {
  return `
    <div class="skeleton skeleton-card" style="margin-bottom:8px"></div>
    <div class="skeleton skeleton-card" style="margin-bottom:8px"></div>
    <div class="skeleton skeleton-card"></div>`;
}
