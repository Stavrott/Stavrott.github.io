// ── Coaching ──────────────────────────────────────────────────────────
// Onglet « Coaching » de la page Programmes, avec les deux rôles :
// - membre : rejoindre un coach avec son code, lancer les programmes
//   qu'il m'a assignés (toujours à jour, en lecture seule) ou les copier ;
// - coach : inviter des membres, leur assigner mes programmes et suivre
//   leurs séances et records.
import { currentUser } from '../js/auth.js';
import { supabase }    from '../js/supabase.js';
import { showToast, openModal, closeModal, showLoading, hideLoading, confirmDialog, escapeHtml, formatDate, formatDuration, localDateStr } from '../js/utils.js';
import { formatKg }    from '../js/pulse-ui.js';
import {
  fetchMesCoachs, rejoindreCoach, quitterCoach, fetchProgrammesAssignes,
  fetchMembres, fetchInvitation, invitationLink, fetchSuiviMembre,
  fetchAssignations, assignerProgramme, retirerAssignation, retirerMembre,
  isCoachingMissing, coachingErrorMessage, takePendingCode,
} from '../js/coaching.js';
import { fetchProgrammes, lancerSeanceProgramme, normalizeJour } from './programmes.js';
import { openRoutineView } from './routine-view.js';

const _SVG_PLAY  = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="7 4 20 12 7 20 7 4"/></svg>`;
const _SVG_PLUS  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const _SVG_CHEV  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;
const _SVG_X     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const _SVG_COPY  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
const _SVG_TROPHY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z"/><path d="M17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3"/></svg>`;

let _content = null;
let _coachProgs = [];

export async function renderCoaching(content) {
  _content = content;
  content.innerHTML = _skeleton();

  let coachs, progs, membres;
  try {
    [coachs, progs, membres] = await Promise.all([fetchMesCoachs(), fetchProgrammesAssignes(), fetchMembres()]);
  } catch (e) {
    content.innerHTML = isCoachingMissing(e)
      ? `<div class="card coach-empty">
           <p class="coach-empty-title">Coaching pas encore activé</p>
           <p class="coach-hint">Lance le script <code>supabase/migrations/20261013_coaching.sql</code> une fois dans Supabase (SQL Editor), puis reviens ici.</p>
         </div>`
      : `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Erreur de chargement</p>`;
    return;
  }
  if (_content !== content || !content.isConnected) return;

  _coachProgs = progs.map(p => ({ ...p, structure: (p.structure ?? []).map(normalizeJour) }));

  content.innerHTML = `
    <div class="page-section">
      <h3 class="section-title" style="margin-bottom:var(--space-3)">Mon coach</h3>
      ${coachs.length ? coachs.map(_coachBlockHTML).join('') : `
        <div class="card coach-empty">
          <p class="coach-empty-title">Tu n’as pas de coach</p>
          <p class="coach-hint">Ton coach te donne un code (ou un lien) : il pourra t’assigner des programmes et suivre tes séances.</p>
          <button class="btn btn-primary btn-full" data-action="join">J’ai un code</button>
        </div>`}
      ${coachs.length ? `<button class="btn btn-ghost btn-sm" data-action="join" style="margin-top:var(--space-2)">Rejoindre un autre coach</button>` : ''}
    </div>

    <div class="page-section">
      <h3 class="section-title" style="margin-bottom:var(--space-3)">Mes membres</h3>
      ${membres.length
        ? `<div class="item-list">${membres.map(_membreRowHTML).join('')}</div>`
        : `<p class="coach-hint" style="margin-bottom:var(--space-3)">Tu coaches un proche ? Invite-le : tu pourras lui assigner tes programmes et voir ses séances.</p>`}
      <button class="btn btn-secondary btn-full" data-action="invite" style="margin-top:var(--space-3)">${_SVG_PLUS} Inviter un membre</button>
    </div>`;

  content.onclick = _onClick;

  // Arrivée par un lien d'invitation (?coach=CODE).
  const pending = takePendingCode();
  if (pending) _openJoinModal(pending);
}

// ── Rendu ─────────────────────────────────────────────────────────────

function _coachBlockHTML(c) {
  const progs = _coachProgs.filter(p => p.coach_id === c.coach_id);
  return `
    <div class="coach-block">
      <div class="coach-head">
        <span class="coach-avatar">${escapeHtml(_initial(c.prenom))}</span>
        <div style="flex:1;min-width:0">
          <p class="coach-name">${escapeHtml(c.prenom)}</p>
          <p class="coach-hint">Voit tes séances et tes records</p>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="leave" data-coach="${c.coach_id}" style="color:var(--text-muted)">Quitter</button>
      </div>
      ${progs.length
        ? `<div class="prog-list">${progs.map(_coachProgHTML).join('')}</div>`
        : `<p class="coach-hint" style="padding:var(--space-2) 0">Pas encore de programme assigné.</p>`}
    </div>`;
}

function _coachProgHTML(p) {
  const n = p.structure.length;
  return `
    <section class="prog-card" aria-label="${escapeHtml(p.nom)}">
      <div class="prog-card-head">
        <div style="min-width:0">
          <span class="coach-tag">De ton coach</span>
          <h3 class="prog-card-title">${escapeHtml(p.nom)}</h3>
          <p class="prog-card-sub">${n} séance${n > 1 ? 's' : ''}${p.description ? ` · ${escapeHtml(p.description)}` : ''}</p>
        </div>
        <button class="icon-btn" data-action="copy-prog" data-pid="${p.id}" aria-label="Copier ${escapeHtml(p.nom)} dans mes programmes" title="Copier dans mes programmes">${_SVG_COPY}</button>
      </div>
      <div class="prog-days">
        ${p.structure.map((j, di) => `
          <div class="prog-day">
            <button class="prog-day-body" data-action="view-day" data-pid="${p.id}" data-di="${di}" style="padding-left:var(--space-2)">
              <span class="prog-day-name">${escapeHtml(j.nom)}</span>
              <span class="prog-day-meta">${j.exercices.length} exercice${j.exercices.length > 1 ? 's' : ''}</span>
            </button>
            <button class="prog-day-play" data-action="launch-day" data-pid="${p.id}" data-di="${di}" aria-label="Lancer ${escapeHtml(j.nom)}">${_SVG_PLAY}</button>
          </div>`).join('') || '<p class="coach-hint">Programme vide pour l’instant.</p>'}
      </div>
    </section>`;
}

function _membreRowHTML(m) {
  const objectif = m.objectif_hebdo ? `${m.seances_7j}/${m.objectif_hebdo}` : `${m.seances_7j}`;
  const parts = [
    `${objectif} séance${m.seances_7j > 1 ? 's' : ''} sur 7 jours`,
    m.derniere_seance ? `dernière ${_ago(m.derniere_seance)}` : 'aucune séance',
  ];
  if (m.programmes) parts.push(`${m.programmes} programme${m.programmes > 1 ? 's' : ''}`);
  return `
    <button class="list-item clickable" data-action="membre" data-membre="${m.membre_id}" style="width:100%;text-align:left">
      <span class="coach-avatar">${escapeHtml(_initial(m.prenom))}</span>
      <span class="item-body">
        <span class="item-title" style="display:block">${escapeHtml(m.prenom)}</span>
        <span class="item-subtitle" style="display:block">${parts.join(' · ')}</span>
      </span>
      <span class="coach-chev">${_SVG_CHEV}</span>
    </button>`;
}

// ── Actions ───────────────────────────────────────────────────────────

async function _onClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, pid } = btn.dataset;
  const prog = _coachProgs.find(p => p.id === pid);
  const di   = parseInt(btn.dataset.di, 10);

  if (action === 'join')    return _openJoinModal('');
  if (action === 'invite')  return _openInviteModal(false);
  if (action === 'membre')  return _openMembre(btn.dataset.membre);
  if (action === 'leave')   return _leave(btn.dataset.coach);
  if (!prog) return;
  if (action === 'launch-day') return lancerSeanceProgramme(prog, di);
  if (action === 'copy-prog')  return _copyProg(prog);
  if (action === 'view-day') {
    const jour = prog.structure[di];
    return openRoutineView({ nom: jour.nom, exercices: jour.exercices }, {
      onStart: () => lancerSeanceProgramme(prog, di),
    });
  }
}

function _refresh() {
  if (_content?.isConnected) renderCoaching(_content);
}

async function _leave(coachId) {
  if (!await confirmDialog('Quitter ce coach ? Il ne verra plus tes séances et ses programmes disparaîtront de ta liste (tu peux d’abord les copier).', { confirmLabel: 'Quitter' })) return;
  showLoading();
  try {
    await quitterCoach(coachId);
    showToast('Tu as quitté ton coach', 'success');
    _refresh();
  } catch (e) {
    showToast(coachingErrorMessage(e), 'error');
  } finally {
    hideLoading();
  }
}

async function _copyProg(prog) {
  showLoading();
  try {
    const { error } = await supabase.from('programmes').insert({
      user_id: currentUser.id, nom: prog.nom, description: prog.description ?? null, structure: prog.structure,
    });
    if (error) throw error;
    showToast(`« ${escapeHtml(prog.nom)} » copié dans tes programmes`, 'success');
  } catch {
    showToast('Erreur lors de la copie', 'error');
  } finally {
    hideLoading();
  }
}

// ── Rejoindre un coach ────────────────────────────────────────────────

function _openJoinModal(code) {
  openModal({
    title: 'Rejoindre un coach',
    body: `
      <div style="display:flex;flex-direction:column;gap:var(--space-4)">
        <div class="form-group">
          <label class="form-label" for="cj-code">Code d’invitation</label>
          <input class="form-input coach-code-input" id="cj-code" type="text" maxlength="8" autocomplete="off"
            autocapitalize="characters" spellcheck="false" placeholder="ex : K7P2QX" value="${escapeHtml(code ?? '')}">
        </div>
        <p class="coach-hint">Ton coach verra tes séances et tes records, et pourra t’assigner des programmes. Tu peux le quitter quand tu veux.</p>
      </div>`,
    footer: `
      <button class="btn btn-secondary" id="cj-cancel">Annuler</button>
      <button class="btn btn-primary" id="cj-ok" style="flex:1">Rejoindre</button>`,
  });
  const input = document.getElementById('cj-code');
  if (!code) input?.focus();
  document.getElementById('cj-cancel')?.addEventListener('click', closeModal);
  const submit = async () => {
    const value = input?.value.trim() ?? '';
    if (!value) { showToast('Entre le code reçu', 'warning'); return; }
    showLoading();
    try {
      const prenom = await rejoindreCoach(value);
      closeModal();
      showToast(`Tu es suivi par ${escapeHtml(prenom)}`, 'success');
      _refresh();
    } catch (e) {
      showToast(coachingErrorMessage(e), 'error', 4000);
    } finally {
      hideLoading();
    }
  };
  document.getElementById('cj-ok')?.addEventListener('click', submit);
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}

// ── Inviter un membre ─────────────────────────────────────────────────

async function _openInviteModal(nouveau) {
  showLoading();
  let inv;
  try {
    inv = await fetchInvitation(nouveau);
  } catch (e) {
    showToast(coachingErrorMessage(e), 'error');
    return;
  } finally {
    hideLoading();
  }
  const link = invitationLink(inv.code);
  const texte = `Rejoins-moi sur Forme pour suivre ton programme : ${link} (code ${inv.code})`;

  openModal({
    title: 'Inviter un membre',
    body: `
      <div style="display:flex;flex-direction:column;gap:var(--space-4);text-align:center">
        <p class="coach-hint">Envoie ce lien ou ce code à ton membre. Dans Forme, il va dans Programmes, onglet Coaching, puis « J’ai un code ».</p>
        <p class="coach-code" aria-label="Code ${inv.code.split('').join(' ')}">${escapeHtml(inv.code)}</p>
        <p class="coach-hint">Valable jusqu’au ${formatDate(inv.expire_le)}, pour autant de membres que tu veux.</p>
        <button class="btn btn-ghost btn-sm" id="ci-new" style="align-self:center">Générer un nouveau code</button>
      </div>`,
    footer: `
      <button class="btn btn-secondary" id="ci-copy">Copier</button>
      <button class="btn btn-primary" id="ci-share" style="flex:1">Partager le lien</button>`,
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(texte);
      showToast('Invitation copiée', 'success');
    } catch {
      showToast(`Code : ${inv.code}`, 'info', 5000);
    }
  };
  document.getElementById('ci-copy')?.addEventListener('click', copy);
  document.getElementById('ci-share')?.addEventListener('click', async () => {
    if (!navigator.share) return copy();
    try { await navigator.share({ title: 'Forme', text: texte }); } catch { /* partage annulé */ }
  });
  document.getElementById('ci-new')?.addEventListener('click', async () => {
    if (!await confirmDialog('Le code actuel ne marchera plus. Les membres déjà inscrits restent suivis.', { title: 'Nouveau code', confirmLabel: 'Générer', danger: false })) {
      _openInviteModal(false);
      return;
    }
    _openInviteModal(true);
  });
}

// ── Fiche d'un membre ─────────────────────────────────────────────────

async function _openMembre(membreId) {
  openModal({ title: 'Membre', body: _skeleton() });
  const body = document.getElementById('modal-body');

  let membre, seances, assign, mesProgs;
  try {
    const membres = await fetchMembres();
    membre = membres.find(m => m.membre_id === membreId);
    if (!membre) { closeModal(); _refresh(); return; }
    [seances, assign, mesProgs] = await Promise.all([
      fetchSuiviMembre(membreId), fetchAssignations(membreId), fetchProgrammes(),
    ]);
  } catch (e) {
    body.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">${coachingErrorMessage(e)}</p>`;
    return;
  }
  // La modale a pu être fermée ou remplacée pendant le chargement.
  if (!body.isConnected || document.getElementById('modal-overlay')?.classList.contains('hidden')) return;

  document.getElementById('modal-title').textContent = membre.prenom;
  const progById = new Map(mesProgs.map(p => [p.id, p]));
  const assignes = assign.filter(a => progById.has(a.programme_id));
  const assignesIds = new Set(assignes.map(a => a.programme_id));
  const disponibles = mesProgs.filter(p => !assignesIds.has(p.id));

  const records = seances
    .flatMap(s => (Array.isArray(s.records) ? s.records : []).map(r => ({ ...r, date: s.date })))
    .slice(0, 6);

  const objectif = membre.objectif_hebdo ? `${membre.seances_7j}<span>/${membre.objectif_hebdo}</span>` : `${membre.seances_7j}`;

  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:var(--space-5)">
      <div class="grid-3">
        <div class="card"><p class="card-title">Sur 7 jours</p><p class="card-value">${objectif}</p></div>
        <div class="card"><p class="card-title">Dernière</p><p class="card-value" style="font-size:var(--font-size-md)">${membre.derniere_seance ? _ago(membre.derniere_seance) : '—'}</p></div>
        <div class="card"><p class="card-title">Suivi depuis</p><p class="card-value" style="font-size:var(--font-size-md)">${formatDate(membre.depuis, { short: true })}</p></div>
      </div>

      <div>
        <p class="form-label">Programmes assignés</p>
        <div class="item-list">
          ${assignes.map(a => `
            <div class="list-item" style="background:var(--surface-2)">
              <span class="item-body">
                <span class="item-title" style="display:block">${escapeHtml(progById.get(a.programme_id).nom)}</span>
                <span class="item-subtitle" style="display:block">Assigné le ${formatDate(a.created_at, { short: true })} · toujours à jour</span>
              </span>
              <button class="icon-btn" data-unassign="${a.id}" aria-label="Retirer ce programme" style="color:var(--text-muted)">${_SVG_X}</button>
            </div>`).join('') || '<p class="coach-hint">Aucun programme assigné.</p>'}
        </div>
        ${disponibles.length ? `
          <p class="form-label" style="margin-top:var(--space-4)">Assigner un de tes programmes</p>
          <div class="coach-assign">
            ${disponibles.map(p => `<button class="btn btn-secondary btn-sm" data-assign="${p.id}">${_SVG_PLUS} ${escapeHtml(p.nom)}</button>`).join('')}
          </div>` : mesProgs.length ? '' : '<p class="coach-hint" style="margin-top:var(--space-2)">Crée d’abord un programme dans « Mes programmes ».</p>'}
      </div>

      ${records.length ? `
        <div>
          <p class="form-label">Derniers records</p>
          <div class="item-list">
            ${records.map(r => `
              <div class="list-item" style="background:var(--surface-2)">
                <span class="item-icon">${_SVG_TROPHY}</span>
                <span class="item-body">
                  <span class="item-title" style="display:block">${escapeHtml(r.exercice)}</span>
                  <span class="item-subtitle" style="display:block">${escapeHtml(_recordLabel(r))} · ${_ago(r.date)}</span>
                </span>
              </div>`).join('')}
          </div>
        </div>` : ''}

      <div>
        <p class="form-label">Dernières séances</p>
        <div class="item-list">
          ${seances.map(s => {
            const meta = [
              formatDate(s.date, { weekday: 'short', short: true }),
              s.duree_minutes ? formatDuration(s.duree_minutes) : null,
              `${s.nb_series} série${s.nb_series > 1 ? 's' : ''}`,
              Number(s.volume) > 0 ? formatKg(Number(s.volume)) : null,
            ].filter(Boolean).join(' · ');
            const tag = progById.has(s.programme_id) && assignesIds.has(s.programme_id)
              ? `<span class="coach-tag" style="margin:0 0 4px">${escapeHtml(progById.get(s.programme_id).nom)}</span>` : '';
            return `
              <div class="list-item" style="background:var(--surface-2);align-items:flex-start">
                <span class="item-body">
                  ${tag}
                  <span class="item-title" style="display:block">${escapeHtml(s.nom)}${s.records?.length ? ` <span class="coach-pr">${s.records.length} record${s.records.length > 1 ? 's' : ''}</span>` : ''}</span>
                  <span class="item-subtitle" style="display:block">${meta}</span>
                  ${s.exercices?.length ? `<span class="item-subtitle" style="display:block;margin-top:2px">${s.exercices.map(escapeHtml).join(', ')}</span>` : ''}
                </span>
              </div>`;
          }).join('') || '<p class="coach-hint">Aucune séance pour l’instant.</p>'}
        </div>
      </div>

      <button class="btn btn-ghost btn-full" id="cm-remove" style="color:var(--color-error)">Ne plus suivre ${escapeHtml(membre.prenom)}</button>
    </div>`;

  body.onclick = async (e) => {
    const add = e.target.closest('[data-assign]');
    const rm  = e.target.closest('[data-unassign]');
    if (add || rm) {
      showLoading();
      try {
        if (add) await assignerProgramme(membreId, add.dataset.assign);
        else     await retirerAssignation(rm.dataset.unassign);
        showToast(add ? 'Programme assigné' : 'Programme retiré', 'success');
      } catch (err) {
        showToast(coachingErrorMessage(err), 'error');
      } finally {
        hideLoading();
      }
      body.onclick = null;
      _openMembre(membreId);
      _refresh();
      return;
    }
    if (e.target.closest('#cm-remove')) {
      body.onclick = null;
      if (!await confirmDialog(`Ne plus suivre ${escapeHtml(membre.prenom)} ? Ses programmes assignés lui seront retirés. Il pourra te rejoindre à nouveau avec un code.`, { confirmLabel: 'Retirer' })) {
        _openMembre(membreId);
        return;
      }
      showLoading();
      try {
        await retirerMembre(membreId);
        showToast('Membre retiré', 'success');
      } catch (err) {
        showToast(coachingErrorMessage(err), 'error');
      } finally {
        hideLoading();
      }
      _refresh();
    }
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function _initial(prenom) {
  return (prenom ?? '?').trim().charAt(0).toUpperCase() || '?';
}

// « aujourd’hui », « hier », « il y a 3 j », puis la date.
function _ago(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = localDateStr().split('-').map(Number);
  const diff = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000);
  if (diff <= 0) return 'aujourd’hui';
  if (diff === 1) return 'hier';
  if (diff < 7)  return `il y a ${diff} j`;
  return `le ${formatDate(`${String(dateStr).slice(0, 10)}T12:00:00`, { short: true })}`;
}

function _recordLabel(r) {
  const poids = Number(r.poids);
  if (r.reps && poids) return `${poids.toLocaleString('fr-FR')} kg × ${r.reps}`;
  if (poids) return `${poids.toLocaleString('fr-FR')} kg`;
  return 'Nouveau record';
}

function _skeleton() {
  return `
    <div style="display:flex;flex-direction:column;gap:var(--space-3)">
      <div class="skeleton skeleton-card" style="height:120px"></div>
      <div class="skeleton skeleton-card" style="height:80px"></div>
    </div>`;
}
