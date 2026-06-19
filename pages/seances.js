import { currentUser }       from '../js/auth.js';
import { supabase }           from '../js/supabase.js';
import { showToast, formatDate, formatDuration, openModal, closeModal, emptyState, showLoading, hideLoading, confirmDialog } from '../js/utils.js';
import { hasActiveSeance, startSeance, resumeActiveView } from './seance-active.js';

// ── Chargement de la page ─────────────────────────────────────────────

export async function loadSeances(section) {
  if (hasActiveSeance()) { resumeActiveView(section); return; }

  section.innerHTML = `
    <div class="page-section">
      <button class="btn btn-primary btn-full btn-lg" id="btn-new-seance">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:20px;height:20px">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nouvelle séance
      </button>
    </div>

    <div class="tabs" id="seances-tabs">
      <button class="tab active" data-tab="recentes">Récentes</button>
      <button class="tab" data-tab="calendrier">Calendrier</button>
      <button class="tab" data-tab="volume">Volume</button>
    </div>
    <div id="seances-list-content">${_skeleton()}</div>`;

  section.querySelector('#btn-new-seance')?.addEventListener('click', () => _openNewSeanceModal(section));

  section.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      section.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const id = tab.dataset.tab;
      if (id === 'recentes')    _loadList(section, 'recentes');
      else if (id === 'calendrier') _renderCalendrier(section);
      else if (id === 'volume')     _renderVolume(section);
    });
  });

  await _loadList(section, 'recentes');
}

// ── Onglet Récentes ───────────────────────────────────────────────────

async function _loadList(section, filter) {
  const content = section.querySelector('#seances-list-content');
  content.innerHTML = _skeleton();

  try {
    let query = supabase
      .from('seances')
      .select('id, nom, date, duree_minutes, notes')
      .eq('user_id', currentUser.id)
      .order('date', { ascending: false });

    if (filter === 'recentes') query = query.limit(20);
    else if (filter === 'mois') {
      const d = new Date(); d.setDate(1);
      query = query.gte('date', d.toISOString().split('T')[0]);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (!data?.length) {
      content.innerHTML = emptyState(
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14M18 5v14M3 8h3m12 0h3M3 16h3m12 0h3"/></svg>`,
        'Aucune séance',
        'Démarrez votre première séance pour commencer votre suivi.',
        null, null
      );
      return;
    }

    content.innerHTML = `<div class="item-list">${data.map(_seanceItem).join('')}</div>`;

    content.querySelectorAll('[data-seance-id]').forEach(item => {
      item.addEventListener('click', () => _openSeanceDetail(item.dataset.seanceId, item.dataset.seanceNom, section));
    });
    content.querySelectorAll('[data-del-seance]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        _deleteSeance(btn.dataset.delSeance, btn.dataset.delNom, () => _loadList(section, filter));
      });
    });
  } catch {
    content.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Erreur de chargement</p>`;
  }
}

function _seanceItem(s) {
  return `
    <div class="list-item clickable" data-seance-id="${s.id}" data-seance-nom="${s.nom}">
      <div class="item-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 5v14M18 5v14M3 8h3m12 0h3M3 16h3m12 0h3"/>
        </svg>
      </div>
      <div class="item-body">
        <p class="item-title">${s.nom}</p>
        <p class="item-subtitle">${formatDate(s.date, { weekday: 'long', year: true })}</p>
      </div>
      <div class="item-meta">
        ${s.duree_minutes
          ? `<p class="item-meta-primary">${formatDuration(s.duree_minutes)}</p>`
          : `<p class="item-meta-secondary">—</p>`}
      </div>
      <button class="icon-btn" data-del-seance="${s.id}" data-del-nom="${s.nom}"
        aria-label="Supprimer" style="color:var(--color-error);flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
        </svg>
      </button>
    </div>`;
}

// ── Suppression d'une séance ──────────────────────────────────────────

async function _deleteSeance(id, nom, onDone) {
  if (!await confirmDialog(`Supprimer "${nom}" ? Cette action est définitive.`)) return;
  try {
    const { error } = await supabase.from('seances').delete().eq('id', id);
    if (error) throw error;
    showToast('Séance supprimée', 'success');
    onDone?.();
  } catch {
    showToast('Erreur lors de la suppression', 'error');
  }
}

// ── Onglet Calendrier ─────────────────────────────────────────────────

async function _renderCalendrier(section) {
  const content = section.querySelector('#seances-list-content');
  content.innerHTML = `<div style="text-align:center;padding:var(--space-8)"><div class="spinner" style="margin:0 auto"></div></div>`;

  try {
    const { data } = await supabase
      .from('seances')
      .select('date, nom, id, duree_minutes')
      .eq('user_id', currentUser.id)
      .order('date', { ascending: false });

    const seances = data ?? [];
    let viewDate  = new Date();

    const render = () => {
      content.innerHTML = _calendarHTML(viewDate, seances);

      content.querySelector('#cal-prev')?.addEventListener('click', () => {
        viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
        render();
      });
      content.querySelector('#cal-next')?.addEventListener('click', () => {
        viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
        render();
      });

      // Clic sur un jour avec séance
      content.querySelectorAll('[data-cal-date]').forEach(day => {
        day.addEventListener('click', () => {
          const dateStr = day.dataset.calDate;
          const daySessions = seances.filter(s => s.date === dateStr);
          if (!daySessions.length) return;
          if (daySessions.length === 1) {
            _openSeanceDetail(daySessions[0].id, daySessions[0].nom, section);
          } else {
            _openDaySessionsPicker(dateStr, daySessions, section);
          }
        });
      });
    };

    render();
  } catch {
    content.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Erreur de chargement</p>`;
  }
}

function _calendarHTML(viewDate, seances) {
  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const today = new Date().toISOString().split('T')[0];

  const monthName = new Date(year, month, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const firstDay  = new Date(year, month, 1).getDay();
  const offset    = (firstDay + 6) % 7; // 0=lundi
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const seanceDates = new Set(seances.filter(s => {
    const d = new Date(s.date);
    return d.getFullYear() === year && d.getMonth() === month;
  }).map(s => s.date));

  const dayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  let cells = '';
  for (let i = 0; i < offset; i++) cells += `<div></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const iso    = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isDone = seanceDates.has(iso);
    const isToday = iso === today;
    cells += `
      <div data-cal-date="${iso}" style="
        aspect-ratio:1;display:flex;align-items:center;justify-content:center;
        border-radius:var(--radius-full);font-size:var(--font-size-sm);font-weight:${isToday ? 800 : 500};
        background:${isDone ? 'var(--color-primary)' : isToday ? 'var(--surface-2)' : 'transparent'};
        color:${isDone ? 'white' : isToday ? 'var(--color-primary)' : 'var(--text-primary)'};
        border:${isToday && !isDone ? '2px solid var(--color-primary)' : '2px solid transparent'};
        cursor:${isDone ? 'pointer' : 'default'};
        transition:opacity var(--transition-fast);
        ${isDone ? 'box-shadow:0 2px 8px rgba(232,67,42,0.35)' : ''}
      " ${isDone ? `title="Séance enregistrée"` : ''}>
        ${d}
      </div>`;
  }

  // Stat du mois
  const monthSessions = seances.filter(s => {
    const d = new Date(s.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const totalMin = monthSessions.reduce((n, s) => n + (s.duree_minutes || 0), 0);

  return `
    <div style="display:flex;flex-direction:column;gap:var(--space-4)">

      <!-- En-tête navigation -->
      <div style="display:flex;align-items:center;justify-content:space-between">
        <button id="cal-prev" class="icon-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style="font-weight:800;font-size:var(--font-size-md);text-transform:capitalize">${monthName}</span>
        <button id="cal-next" class="icon-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <!-- Labels jours -->
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center">
        ${dayLabels.map(l => `<div style="font-size:11px;font-weight:700;color:var(--text-muted);padding:4px 0">${l}</div>`).join('')}
        ${cells}
      </div>

      <!-- Stats du mois -->
      <div class="grid-2" style="margin-top:var(--space-2)">
        <div class="card" style="text-align:center">
          <p class="card-title">Séances</p>
          <p class="card-value">${monthSessions.length}</p>
        </div>
        <div class="card" style="text-align:center">
          <p class="card-title">Temps total</p>
          <p class="card-value">${totalMin >= 60 ? Math.floor(totalMin/60) + 'h' + String(totalMin%60).padStart(2,'0') : totalMin}<span>${totalMin >= 60 ? '' : ' min'}</span></p>
        </div>
      </div>
    </div>`;
}

function _openDaySessionsPicker(dateStr, sessions, section) {
  const dateLabel = formatDate(dateStr, { weekday: 'long', year: true });
  openModal({
    title: dateLabel,
    body: `<div style="display:flex;flex-direction:column;gap:var(--space-2)">
      ${sessions.map(s => `
        <button class="list-item clickable" data-pick-id="${s.id}" data-pick-nom="${s.nom}" style="width:100%;text-align:left">
          <div class="item-body">
            <p class="item-title">${s.nom}</p>
            ${s.duree_minutes ? `<p class="item-subtitle">${formatDuration(s.duree_minutes)}</p>` : ''}
          </div>
          <span class="item-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg></span>
        </button>`).join('')}
    </div>`,
  });
  document.querySelectorAll('[data-pick-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal();
      _openSeanceDetail(btn.dataset.pickId, btn.dataset.pickNom, section);
    });
  });
}

// ── Onglet Volume ─────────────────────────────────────────────────────

async function _renderVolume(section) {
  const content = section.querySelector('#seances-list-content');
  content.innerHTML = `<div style="text-align:center;padding:var(--space-8)"><div class="spinner" style="margin:0 auto"></div></div>`;

  try {
    // Récupère les séries des 8 dernières semaines
    const since = new Date(Date.now() - 8 * 7 * 86400000).toISOString().split('T')[0];
    const { data: series } = await supabase
      .from('series')
      .select('seance_id, poids_kg, repetitions, created_at')
      .eq('user_id', currentUser.id)
      .gte('created_at', since + 'T00:00:00');

    const { data: seances } = await supabase
      .from('seances')
      .select('id, date')
      .eq('user_id', currentUser.id)
      .gte('date', since);

    const seanceDateMap = Object.fromEntries((seances ?? []).map(s => [s.id, s.date]));

    // Construire les 8 semaines
    const weeks = [];
    for (let w = 7; w >= 0; w--) {
      const end   = new Date(Date.now() - w * 7 * 86400000);
      const start = new Date(end - 6 * 86400000);
      const startStr = start.toISOString().split('T')[0];
      const endStr   = end.toISOString().split('T')[0];
      const weekSeries = (series ?? []).filter(s => {
        const date = seanceDateMap[s.seance_id];
        return date && date >= startStr && date <= endStr;
      });
      const volume = weekSeries.reduce((n, s) => n + (s.poids_kg ?? 0) * (s.repetitions ?? 0), 0);
      weeks.push({ label: _shortWeekLabel(start), volume: Math.round(volume) });
    }

    const maxVol = Math.max(...weeks.map(w => w.volume), 1);

    content.innerHTML = `
      <div class="card page-section">
        <p class="card-title" style="margin-bottom:var(--space-4)">Volume total par semaine (kg)</p>
        <div style="display:flex;align-items:flex-end;gap:6px;height:120px">
          ${weeks.map((w, i) => {
            const h  = Math.max(Math.round((w.volume / maxVol) * 100), w.volume > 0 ? 6 : 3);
            const isLast = i === weeks.length - 1;
            return `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                ${w.volume > 0 ? `<span style="font-size:9px;color:var(--text-muted);font-weight:700">${w.volume >= 1000 ? (w.volume/1000).toFixed(1)+'t' : w.volume+'kg'}</span>` : '<span></span>'}
                <div style="width:100%;height:${h}%;background:${isLast ? 'var(--color-primary)' : 'var(--surface-3)'};
                  border-radius:4px 4px 2px 2px;min-height:3px;transition:height .4s;
                  ${isLast ? 'box-shadow:0 2px 8px rgba(232,67,42,.35)' : ''}"></div>
                <span style="font-size:9px;color:${isLast ? 'var(--color-primary)' : 'var(--text-muted)'};font-weight:${isLast ? 700 : 400}">${w.label}</span>
              </div>`;
          }).join('')}
        </div>
      </div>

      <div class="page-section">
        <h3 class="section-title" style="margin-bottom:var(--space-3)">Résumé</h3>
        <div class="grid-2">
          <div class="card" style="text-align:center">
            <p class="card-title">Volume cette sem.</p>
            <p class="card-value">${weeks.at(-1)?.volume ?? 0}<span> kg</span></p>
          </div>
          <div class="card" style="text-align:center">
            <p class="card-title">Volume mois</p>
            <p class="card-value">${weeks.slice(-4).reduce((n,w)=>n+w.volume,0)}<span> kg</span></p>
          </div>
        </div>
      </div>`;
  } catch {
    content.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Erreur de chargement</p>`;
  }
}

function _shortWeekLabel(startDate) {
  return startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    .replace('.', '').replace(' ', ' ');
}

// ── Modal nouvelle séance ─────────────────────────────────────────────

function _openNewSeanceModal(section) {
  const today     = new Date();
  const jourFr    = today.toLocaleDateString('fr-FR', { weekday: 'long' });
  const defaultNom = `Séance du ${jourFr.charAt(0).toUpperCase() + jourFr.slice(1)}`;

  openModal({
    title: 'Nouvelle séance',
    body: `
      <div style="display:flex;flex-direction:column;gap:var(--space-4)">
        <div class="form-group">
          <label class="form-label">Nom de la séance</label>
          <input class="form-input" id="new-seance-nom" type="text"
            value="${defaultNom}" placeholder="ex: Push, Full Body A…">
        </div>
        <div class="form-group">
          <label class="form-label">Date</label>
          <input class="form-input" id="new-seance-date" type="date"
            value="${today.toISOString().split('T')[0]}">
        </div>
      </div>`,
    footer: `
      <button class="btn btn-secondary" id="btn-cancel-new">Annuler</button>
      <button class="btn btn-primary" id="btn-start-new" style="flex:1">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Démarrer
      </button>`,
  });

  setTimeout(() => { const i = document.getElementById('new-seance-nom'); if (i) { i.focus(); i.select(); } }, 100);

  document.getElementById('btn-cancel-new')?.addEventListener('click', closeModal);
  document.getElementById('btn-start-new')?.addEventListener('click', async () => {
    const nom = document.getElementById('new-seance-nom')?.value.trim();
    if (!nom) { showToast('Entrez un nom de séance', 'warning'); return; }
    closeModal();
    showLoading();
    try {
      await startSeance(nom, section, () => loadSeances(section));
    } catch {
      showToast('Erreur lors du démarrage de la séance', 'error');
    } finally {
      hideLoading();
    }
  });

  document.getElementById('new-seance-nom')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-start-new')?.click();
  });
}

// ── Détail d'une séance ───────────────────────────────────────────────

async function _openSeanceDetail(seanceId, seanceNom, section) {
  openModal({
    title: seanceNom || 'Détail',
    body: `<div style="padding:var(--space-4);text-align:center"><div class="spinner" style="margin:0 auto"></div></div>`,
    footer: `<button class="btn btn-secondary btn-full" id="btn-del-seance-detail" style="color:var(--color-error)">Supprimer cette séance</button>`,
  });

  document.getElementById('btn-del-seance-detail')?.addEventListener('click', () => {
    _deleteSeance(seanceId, seanceNom, () => { closeModal(); if (section) loadSeances(section); });
  });

  try {
    const { data: series } = await supabase
      .from('series')
      .select('exercice_nom, numero_serie, poids_kg, repetitions, temps_repos_s, notes')
      .eq('seance_id', seanceId)
      .order('exercice_nom')
      .order('numero_serie');

    if (!series?.length) {
      document.getElementById('modal-body').innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Aucune série enregistrée.</p>`;
      return;
    }

    const byExo = series.reduce((acc, s) => {
      if (!acc[s.exercice_nom]) acc[s.exercice_nom] = [];
      acc[s.exercice_nom].push(s);
      return acc;
    }, {});

    const totalVol = series.reduce((n, s) => n + (s.poids_kg ?? 0) * (s.repetitions ?? 0), 0);

    document.getElementById('modal-body').innerHTML = `
      <div style="display:flex;gap:var(--space-3);margin-bottom:var(--space-5)">
        <div class="card" style="flex:1;text-align:center;padding:var(--space-3)">
          <p class="card-title">Exercices</p>
          <p class="card-value" style="font-size:var(--font-size-xl)">${Object.keys(byExo).length}</p>
        </div>
        <div class="card" style="flex:1;text-align:center;padding:var(--space-3)">
          <p class="card-title">Séries</p>
          <p class="card-value" style="font-size:var(--font-size-xl)">${series.length}</p>
        </div>
        <div class="card" style="flex:1;text-align:center;padding:var(--space-3)">
          <p class="card-title">Volume</p>
          <p class="card-value" style="font-size:var(--font-size-xl)">${Math.round(totalVol)}<span> kg</span></p>
        </div>
      </div>
      ${Object.entries(byExo).map(([nom, sets]) => `
        <div style="margin-bottom:var(--space-5)">
          <p style="font-weight:800;font-size:var(--font-size-sm);margin-bottom:var(--space-2)">${nom}</p>
          <div style="display:flex;flex-direction:column;gap:var(--space-2)">
            ${sets.map(s => `
              <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-2) var(--space-3);background:var(--surface-2);border-radius:var(--radius-sm)">
                <div class="set-num set-num-done" style="flex-shrink:0">${s.numero_serie}</div>
                <span style="flex:1;font-size:var(--font-size-sm);font-weight:700">${s.poids_kg ?? '—'} kg × ${s.repetitions ?? '—'}</span>
                ${s.notes ? `<span style="font-size:var(--font-size-xs);color:var(--text-muted)">${s.notes}</span>` : ''}
              </div>`).join('')}
          </div>
        </div>`).join('')}`;
  } catch {
    document.getElementById('modal-body').innerHTML = `<p style="color:var(--color-error);text-align:center">Erreur de chargement</p>`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function _skeleton() {
  return `
    <div class="skeleton skeleton-card" style="margin-bottom:var(--space-3)"></div>
    <div class="skeleton skeleton-card" style="margin-bottom:var(--space-3)"></div>
    <div class="skeleton skeleton-card"></div>`;
}
