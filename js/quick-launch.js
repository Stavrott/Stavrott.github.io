// Lancement rapide d'une séance — depuis le bouton de l'accueil, l'onglet
// Séances ou l'appui long sur l'onglet « Séances » de la navigation.
// Propose une séance libre, puis chaque séance de chaque programme,
// lançable en un tap. Les programmes assignés par un coach passent en tête.
import { navigate }      from './router.js';
import { openModal, closeModal, escapeHtml } from './utils.js';
import { fetchProgrammes, lancerSeanceProgramme, normalizeJour } from '../pages/programmes.js';
import { fetchProgrammesAssignes } from './coaching.js';

const _SVG_PLUS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const _SVG_PLAY = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4"/></svg>`;
const _SVG_CAL  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

export async function openQuickLaunchModal() {
  openModal({
    title: 'Démarrer',
    body: `<div id="ql-body">${_skeleton()}</div>`,
  });

  const body = document.getElementById('ql-body');

  try {
    // Sans la migration coaching (ou hors-ligne), on se passe des
    // programmes du coach plutôt que de bloquer le lancement.
    const [mine, assignes] = await Promise.all([
      fetchProgrammes(),
      fetchProgrammesAssignes().catch(() => []),
    ]);
    const programmes = [
      ...assignes.map(p => ({ ...p, structure: (p.structure ?? []).map(normalizeJour) })),
      ...mine,
    ];
    const todayIdx = (new Date().getDay() + 6) % 7; // 0 = lundi

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:6px">
        <button class="list-item clickable" id="ql-free" style="gap:10px;width:100%;text-align:left">
          <span class="item-icon" style="flex-shrink:0">${_SVG_PLUS}</span>
          <span class="item-body">
            <span class="item-title" style="display:block">Séance libre</span>
            <span class="item-subtitle" style="display:block">Tu ajoutes les exercices au fur et à mesure</span>
          </span>
        </button>

        ${programmes.map((p, pi) => p.structure.length ? `
          <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;
            color:var(--text-muted);margin:var(--space-3) 0 2px">${escapeHtml(p.nom)}${p.coach ? ' · de ton coach' : ''}</p>
          ${p.structure.map((j, di) => {
            const prevu = (j.joursSemaine ?? []).includes(todayIdx);
            return `
              <button class="list-item clickable" data-ql-p="${pi}" data-ql-d="${di}" style="gap:10px;width:100%;text-align:left">
                <span class="item-icon ${prevu ? 'accent' : ''}" style="flex-shrink:0">${_SVG_PLAY}</span>
                <span class="item-body">
                  <span class="item-title" style="display:block">${escapeHtml(j.nom)}</span>
                  <span class="item-subtitle" style="display:block">${j.exercices.length} exercice${j.exercices.length > 1 ? 's' : ''}${prevu ? ' · prévue aujourd’hui' : ''}</span>
                </span>
              </button>`;
          }).join('')}` : '').join('')}

        <button class="list-item clickable" id="ql-progs" style="gap:10px;width:100%;text-align:left;margin-top:var(--space-3)">
          <span class="item-icon" style="flex-shrink:0">${_SVG_CAL}</span>
          <span class="item-body">
            <span class="item-title" style="display:block">${mine.length ? 'Gérer mes programmes' : 'Créer un programme'}</span>
            <span class="item-subtitle" style="display:block">${mine.length ? 'Modifier, ajouter une séance, partir d’un modèle' : 'Ou pars d’un modèle : PPL, Full Body, 5×5'}</span>
          </span>
        </button>
      </div>`;

    body.querySelector('#ql-free')?.addEventListener('click', () => {
      closeModal();
      navigate('seances');
    });
    body.querySelector('#ql-progs')?.addEventListener('click', () => {
      closeModal();
      navigate('programmes');
    });
    body.querySelectorAll('[data-ql-p]').forEach(item => {
      item.addEventListener('click', () => {
        const prog = programmes[parseInt(item.dataset.qlP, 10)];
        if (prog) lancerSeanceProgramme(prog, parseInt(item.dataset.qlD, 10));
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
