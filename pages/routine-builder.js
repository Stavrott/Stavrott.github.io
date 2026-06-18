import { showToast }           from '../js/utils.js';
import { getAllExercices }      from './exercices.js';
import { fetchExerciseImage }  from '../js/exercisedb.js';
import { metricFields, parseFieldValue, defaultFieldValue, DEFAULT_METRIC_TYPE } from '../js/metrics.js';

const DEFAULT_REPOS_SERIE = 90;
const DEFAULT_REPOS_INTER = 120;

const _uid = () => Math.random().toString(36).slice(2, 10);
const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');

let _state  = null;
let _el     = null;
let _onSave = null;

// ── Public ─────────────────────────────────────────────────────────────

export function openRoutineBuilder(routine, onSave) {
  _onSave = onSave;
  _state  = routine
    ? JSON.parse(JSON.stringify(routine))
    : { id: null, nom: 'Nouvelle routine', exercices: [] };
  _state.exercices = (_state.exercices || []).map(_normalizeExo);
  _mount();
}

// ── Normalisation ──────────────────────────────────────────────────────

function _normalizeExo(ex) {
  const type_metrique = ex.type_metrique || DEFAULT_METRIC_TYPE;
  return {
    uid:           ex.uid || _uid(),
    nom:           ex.nom || '',
    type_metrique,
    repos_inter:   ex.repos_inter !== undefined ? ex.repos_inter : DEFAULT_REPOS_INTER,
    series:        (ex.series?.length ? ex.series : [_newSerie(null, type_metrique)])
                     .map(s => _normalizeSerie(s, type_metrique)),
  };
}

function _normalizeSerie(s, type_metrique) {
  const out = { uid: s.uid || _uid(), repos: s.repos ?? DEFAULT_REPOS_SERIE, fait: s.fait ?? false };
  metricFields(type_metrique).forEach(f => { out[f.key] = defaultFieldValue(f, s); });
  return out;
}

function _newSerie(ref, type_metrique) {
  const out = { uid: _uid(), repos: ref?.repos ?? DEFAULT_REPOS_SERIE, fait: false };
  metricFields(type_metrique ?? ref?.type_metrique ?? DEFAULT_METRIC_TYPE)
    .forEach(f => { out[f.key] = defaultFieldValue(f, ref); });
  return out;
}

// ── Montage ────────────────────────────────────────────────────────────

function _mount() {
  _el?.remove();
  _el = document.createElement('div');
  _el.id = 'rb-overlay';
  _el.style.cssText = 'position:fixed;inset:0;background:var(--background);z-index:1000;display:flex;flex-direction:column;overflow:hidden';

  _el.innerHTML = `
    <header style="display:flex;align-items:center;gap:10px;padding:12px 16px;
      border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0">
      <button id="rb-back" class="icon-btn" aria-label="Retour">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
      </button>
      <input id="rb-nom" class="form-input" type="text" value="${_esc(_state.nom)}"
        placeholder="Nom de la routine"
        style="flex:1;font-weight:800;font-size:1.05rem;border:none;background:transparent;
          padding:6px 0;box-shadow:none;min-width:0">
      <button id="rb-save" class="btn btn-primary" style="flex-shrink:0">Sauvegarder</button>
    </header>

    <div id="rb-body" style="flex:1;overflow-y:auto;padding:16px;padding-bottom:calc(80px + env(safe-area-inset-bottom, 0px))">
      <div id="rb-list"></div>
      <p id="rb-empty" style="text-align:center;padding:56px 0;color:var(--text-muted)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
          style="width:48px;height:48px;margin:0 auto 12px;display:block;opacity:.3">
          <path d="M6 5v14M18 5v14M3 8h3m12 0h3M3 16h3m12 0h3"/>
        </svg>
        Ajoutez votre premier exercice
      </p>
    </div>

    <div style="position:fixed;bottom:0;left:0;right:0;padding:12px 16px;
      padding-bottom:calc(12px + env(safe-area-inset-bottom, 0px));
      background:var(--surface);border-top:1px solid var(--border);z-index:1010">
      <button id="rb-add-exo" class="btn btn-secondary btn-full">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
          style="width:16px;height:16px">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Ajouter un exercice
      </button>
    </div>`;

  document.body.appendChild(_el);
  _renderList();
  _bindEvents();
}

// ── Rendu ──────────────────────────────────────────────────────────────

function _renderList() {
  const list  = _el.querySelector('#rb-list');
  const empty = _el.querySelector('#rb-empty');
  list.innerHTML = _state.exercices.map((ex, i) => _exoHTML(ex, i)).join('');
  empty.style.display = _state.exercices.length ? 'none' : '';
  _loadExoImages(list);
}

function _loadExoImages(container) {
  container.querySelectorAll('.exo-thumb[data-img-nom]').forEach(el => {
    const nom = el.dataset.imgNom;
    fetchExerciseImage(nom).then(url => {
      if (!el.isConnected || !url) return;
      el.innerHTML = `<img src="${url}" alt="${nom}"
        style="width:100%;height:100%;object-fit:cover;display:block">`;
    });
  });
}

function _exoHTML(ex, i) {
  const first = i === 0;
  const last  = i === _state.exercices.length - 1;
  return `
    <div class="card" data-exo="${ex.uid}" style="margin-bottom:8px">

      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0">
          <button class="rb-up icon-btn" data-uid="${ex.uid}" ${first?'disabled':''}
            style="width:22px;height:22px;${first?'opacity:.25':''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>
          <button class="rb-dn icon-btn" data-uid="${ex.uid}" ${last?'disabled':''}
            style="width:22px;height:22px;${last?'opacity:.25':''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
        <div class="exo-thumb" data-img-nom="${_esc(ex.nom)}"
          style="width:40px;height:40px;min-width:40px;border-radius:8px;overflow:hidden;
            background:var(--surface-3);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round"
            style="width:18px;height:18px;color:var(--text-muted)">
            <path d="M6 5v14M18 5v14M3 8h3m12 0h3M3 16h3m12 0h3"/>
          </svg>
        </div>
        <p style="flex:1;font-weight:700;font-size:.95rem">${_esc(ex.nom)}</p>
        <button class="rb-del-exo icon-btn" data-uid="${ex.uid}" style="color:var(--color-error)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
          </svg>
        </button>
      </div>

      <div style="${_rowGrid(ex.type_metrique)};
        padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid var(--border)">
        ${metricFields(ex.type_metrique).map(f => `
          <p style="font-size:10px;font-weight:700;color:var(--text-muted);text-align:center;letter-spacing:.05em">${f.header}</p>`).join('')}
        <p style="font-size:10px;font-weight:700;color:var(--text-muted);text-align:center;letter-spacing:.05em">REPOS</p>
        <span></span>
      </div>

      <div data-series="${ex.uid}">
        ${ex.series.map(s => _serieHTML(s, ex.uid, ex.type_metrique)).join('')}
      </div>

      <button class="rb-add-serie btn btn-ghost btn-sm" data-uid="${ex.uid}"
        style="width:100%;margin-top:8px;border:1.5px dashed var(--border);justify-content:center;color:var(--text-muted)">
        + Ajouter une série
      </button>
    </div>

    ${!last ? _sepHTML(ex) : ''}`;
}

function _rowGrid(type_metrique) {
  return `display:grid;grid-template-columns:repeat(${metricFields(type_metrique).length},1fr) 54px 20px;gap:4px`;
}

function _serieHTML(s, exUid, type_metrique) {
  return `
    <div data-sid="${s.uid}" data-exo="${exUid}"
      style="${_rowGrid(type_metrique)};align-items:center;margin-bottom:4px">
      ${metricFields(type_metrique).map(f => `
        <input class="form-input rb-field" data-field="${f.key}" data-sid="${s.uid}" data-exo="${exUid}"
          type="number" step="${f.step}" min="0" inputmode="${f.type === 'int' ? 'numeric' : 'decimal'}"
          value="${s[f.key] ?? ''}" placeholder="—"
          style="text-align:center;padding:5px 2px;font-size:.88rem;font-weight:600;min-width:0">`).join('')}
      <button class="rb-repos-btn chip" data-sid="${s.uid}" data-exo="${exUid}"
        style="font-size:11px;font-weight:700;padding:4px 0;width:100%;justify-content:center">
        ${s.repos??DEFAULT_REPOS_SERIE}s
      </button>
      <button class="rb-del-serie icon-btn" data-sid="${s.uid}" data-exo="${exUid}"
        style="width:20px;height:20px;color:var(--text-muted)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>`;
}

function _sepHTML(ex) {
  const sup = ex.repos_inter === null;
  return `
    <div style="display:flex;align-items:center;gap:8px;margin:4px 0 12px;padding:0 4px">
      <div style="flex:1;height:1px;background:var(--border)"></div>
      ${sup
        ? `<span style="font-size:11px;font-weight:800;color:var(--color-primary)">⚡ SUPERSET</span>
           <button class="rb-rm-sup chip" data-uid="${ex.uid}"
             style="font-size:11px;padding:2px 8px;background:transparent;
               border-color:var(--border);color:var(--text-muted)">Retirer</button>`
        : `<button class="rb-repos-inter chip" data-uid="${ex.uid}"
             style="font-size:11px;font-weight:700;padding:3px 10px">⏱ ${ex.repos_inter}s</button>
           <button class="rb-add-sup chip" data-uid="${ex.uid}"
             style="font-size:11px;font-weight:700;padding:3px 10px;
               border-color:var(--color-primary);color:var(--color-primary)">⚡ Superset</button>`}
      <div style="flex:1;height:1px;background:var(--border)"></div>
    </div>`;
}

// ── Événements ─────────────────────────────────────────────────────────

function _bindEvents() {
  _el.querySelector('#rb-back')?.addEventListener('click', () => {
    if (!_state.exercices.length || confirm('Quitter sans sauvegarder ?')) _close();
  });
  _el.querySelector('#rb-save')?.addEventListener('click', _save);
  _el.querySelector('#rb-add-exo')?.addEventListener('click', _pickExo);

  _el.querySelector('#rb-body')?.addEventListener('click', e => {
    const up = e.target.closest('.rb-up');
    if (up && !up.disabled) { _syncDOM(); _swap(up.dataset.uid, -1); return; }

    const dn = e.target.closest('.rb-dn');
    if (dn && !dn.disabled) { _syncDOM(); _swap(dn.dataset.uid, 1); return; }

    const de = e.target.closest('.rb-del-exo');
    if (de) {
      _syncDOM();
      _state.exercices = _state.exercices.filter(x => x.uid !== de.dataset.uid);
      _renderList();
      return;
    }

    const as = e.target.closest('.rb-add-serie');
    if (as) {
      _syncDOM();
      const ex = _findExo(as.dataset.uid);
      if (ex) ex.series.push(_newSerie(ex.series.at(-1), ex.type_metrique));
      _renderList();
      return;
    }

    const ds = e.target.closest('.rb-del-serie');
    if (ds) {
      _syncDOM();
      const ex = _findExo(ds.dataset.exo);
      if (ex) {
        if (ex.series.length <= 1) { showToast('Minimum 1 série', 'warning'); return; }
        ex.series = ex.series.filter(s => s.uid !== ds.dataset.sid);
      }
      _renderList();
      return;
    }

    const rb = e.target.closest('.rb-repos-btn');
    if (rb) {
      _syncDOM();
      const ex = _findExo(rb.dataset.exo);
      const s  = ex?.series.find(s => s.uid === rb.dataset.sid);
      _reposPopup(rb, s?.repos ?? DEFAULT_REPOS_SERIE, val => {
        if (s) s.repos = val;
        rb.textContent = val + 's';
      });
      return;
    }

    const ri = e.target.closest('.rb-repos-inter');
    if (ri) {
      _syncDOM();
      const ex = _findExo(ri.dataset.uid);
      _reposPopup(ri, ex?.repos_inter ?? DEFAULT_REPOS_INTER, val => {
        if (ex) ex.repos_inter = val;
        ri.textContent = '⏱ ' + val + 's';
      }, true);
      return;
    }

    const addSup = e.target.closest('.rb-add-sup');
    if (addSup) {
      _syncDOM();
      const ex = _findExo(addSup.dataset.uid);
      if (ex) ex.repos_inter = null;
      _renderList();
      return;
    }

    const rmSup = e.target.closest('.rb-rm-sup');
    if (rmSup) {
      _syncDOM();
      const ex = _findExo(rmSup.dataset.uid);
      if (ex) ex.repos_inter = DEFAULT_REPOS_INTER;
      _renderList();
      return;
    }
  });

}

function _swap(uid, dir) {
  const i = _state.exercices.findIndex(x => x.uid === uid);
  const j = i + dir;
  if (j < 0 || j >= _state.exercices.length) return;
  [_state.exercices[i], _state.exercices[j]] = [_state.exercices[j], _state.exercices[i]];
  _renderList();
}

function _findExo(uid) {
  return _state.exercices.find(x => x.uid === uid);
}

function _syncDOM() {
  _state.nom = _el.querySelector('#rb-nom')?.value.trim() || 'Nouvelle routine';
  _state.exercices.forEach(ex => {
    ex.series.forEach(s => {
      const row = _el.querySelector(`[data-sid="${s.uid}"]`);
      if (!row) return;
      metricFields(ex.type_metrique).forEach(f => {
        const raw = row.querySelector(`[data-field="${f.key}"]`)?.value;
        s[f.key] = parseFieldValue(f, raw);
      });
    });
  });
}

// ── Popup repos ────────────────────────────────────────────────────────

function _reposPopup(anchor, current, onConfirm, isInter = false) {
  document.getElementById('rb-repos-pop')?.remove();

  const rect = anchor.getBoundingClientRect();
  const pop  = document.createElement('div');
  pop.id = 'rb-repos-pop';
  pop.style.cssText = `
    position:fixed;background:var(--surface);border:1px solid var(--border);
    border-radius:var(--radius-lg);padding:14px;z-index:1200;
    box-shadow:0 8px 24px rgba(0,0,0,.4);min-width:230px;
    top:${Math.min(rect.bottom + 8, window.innerHeight - 200)}px;
    left:${Math.max(8, Math.min(rect.left - 80, window.innerWidth - 250))}px`;
  pop.innerHTML = `
    <p style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:10px;
      text-transform:uppercase;letter-spacing:.05em">
      ${isInter ? 'Repos entre exercices' : 'Repos après la série'} (s)
    </p>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
      ${[30,45,60,90,120,180,240].map(v => `
        <button class="chip rp-pre ${v === current ? 'active' : ''}" data-v="${v}"
          style="flex:1;min-width:42px;justify-content:center">${v}s</button>`).join('')}
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <input class="form-input" id="rp-inp" type="number" min="0" max="600"
        value="${current}" style="flex:1;text-align:center;font-weight:700" inputmode="numeric">
      <span style="color:var(--text-muted)">s</span>
      <button class="btn btn-primary btn-sm" id="rp-ok">OK</button>
    </div>`;
  document.body.appendChild(pop);
  pop.querySelector('#rp-inp')?.focus();

  const close   = () => { pop.remove(); document.removeEventListener('click', outside, true); };
  const confirm = val => { onConfirm(val); close(); };

  pop.querySelectorAll('.rp-pre').forEach(b =>
    b.addEventListener('click', e => { e.stopPropagation(); confirm(+b.dataset.v); }));
  pop.querySelector('#rp-ok')?.addEventListener('click', () => {
    const v = +pop.querySelector('#rp-inp').value;
    if (v >= 0) confirm(v);
  });
  pop.querySelector('#rp-inp')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const v = +e.target.value; if (v >= 0) confirm(v); }
  });

  const outside = e => { if (!pop.contains(e.target) && e.target !== anchor) close(); };
  setTimeout(() => document.addEventListener('click', outside, true), 100);
}

// ── Picker d'exercice ──────────────────────────────────────────────────

async function _pickExo() {
  const EXERCICES = await getAllExercices();
  const GROUPES   = ['Tous', ...new Set(EXERCICES.map(e => e.groupe).filter(Boolean))];
  let search = '', groupe = 'Tous';

  const desktop = window.innerWidth >= 600;

  const sheet = document.createElement('div');
  sheet.style.cssText = desktop
    ? `position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);
       display:flex;align-items:center;justify-content:center;z-index:1100;padding:24px`
    : `position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);
       display:flex;align-items:flex-end;justify-content:center;z-index:1100;
       padding-bottom:env(safe-area-inset-bottom, 0px)`;

  sheet.innerHTML = `
    <div style="background:var(--surface);
      border-radius:${desktop ? 'var(--radius-xl)' : 'var(--radius-xl) var(--radius-xl) 0 0'};
      width:100%;max-width:560px;
      ${desktop ? 'height:min(680px,80vh)' : 'max-height:80vh'};
      display:flex;flex-direction:column;overflow:hidden;
      box-shadow:0 16px 64px rgba(0,0,0,.6)">

      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0">
        <h3 style="font-weight:700">Ajouter un exercice</h3>
        <button id="rp-close" class="icon-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div style="padding:12px 16px 8px;flex-shrink:0;display:flex;flex-direction:column;gap:8px;
        border-bottom:1px solid var(--border)">
        <div class="search-bar" style="margin:0">
          <div class="search-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <input class="search-input" id="rp-search" placeholder="Rechercher…" type="search" autocomplete="off">
        </div>
        <div class="filter-chips" id="rp-groups" style="margin:0;padding-bottom:4px">
          ${GROUPES.map((g, i) => `<div class="chip ${i===0?'active':''}" data-g="${g}">${g}</div>`).join('')}
        </div>
      </div>

      <div style="flex:1;overflow-y:auto;padding:8px 16px 16px">
        <div id="rp-list"></div>
        <div id="rp-custom" style="padding-top:4px"></div>
      </div>
    </div>`;
  document.body.appendChild(sheet);

  const close = () => sheet.remove();
  sheet.querySelector('#rp-close').addEventListener('click', close);
  // Délai pour éviter le ghost-click sur mobile (le touch qui ouvre le picker
  // ne doit pas déclencher la fermeture immédiate du backdrop)
  setTimeout(() => {
    sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
  }, 250);

  const pick = nom => {
    _syncDOM();
    const def = EXERCICES.find(e => e.nom === nom);
    _state.exercices.push(_normalizeExo({ nom, type_metrique: def?.type_metrique }));
    close();
    _renderList();
  };

  const render = () => {
    const filtered = EXERCICES.filter(e => {
      const g = groupe === 'Tous' || e.groupe === groupe;
      const s = !search || e.nom.toLowerCase().includes(search)
             || (e.muscles ?? []).some(m => m.toLowerCase().includes(search));
      return g && s;
    });

    const list = sheet.querySelector('#rp-list');
    list.innerHTML = filtered.length
      ? filtered.map(e => `
          <button class="list-item clickable" data-nom="${_esc(e.nom)}"
            style="width:100%;text-align:left;align-items:center">
            <div class="exo-thumb" data-img-nom="${_esc(e.nom)}"
              style="width:48px;height:48px;min-width:48px;border-radius:8px;overflow:hidden;
                background:var(--surface-3);display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round"
                style="width:20px;height:20px;color:var(--text-muted)">
                <path d="M6 5v14M18 5v14M3 8h3m12 0h3M3 16h3m12 0h3"/>
              </svg>
            </div>
            <div class="item-body">
              <p class="item-title">${e.nom}</p>
              <p class="item-subtitle">${e.groupe} · ${e.materiel}</p>
            </div>
          </button>`).join('')
      : `<p style="color:var(--text-muted);text-align:center;padding:24px">Aucun résultat</p>`;

    list.querySelectorAll('[data-nom]').forEach(b => b.addEventListener('click', () => pick(b.dataset.nom)));
    _loadExoImages(list);

    const raw  = document.getElementById('rp-search')?.value.trim();
    const wrap = sheet.querySelector('#rp-custom');
    if (raw && !EXERCICES.find(e => e.nom.toLowerCase() === raw.toLowerCase())) {
      wrap.innerHTML = `<button class="btn btn-secondary btn-full" id="rp-new">+ Créer "${raw}"</button>`;
      wrap.querySelector('#rp-new')?.addEventListener('click', () => pick(raw));
    } else {
      wrap.innerHTML = '';
    }
  };

  render();
  sheet.querySelector('#rp-search')?.addEventListener('input', e => {
    search = e.target.value.toLowerCase().trim();
    render();
  });
  sheet.querySelector('#rp-groups')?.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    sheet.querySelectorAll('#rp-groups .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    groupe = chip.dataset.g;
    render();
  });
}

// ── Sauvegarde ─────────────────────────────────────────────────────────

async function _save() {
  _syncDOM();
  if (!_state.nom.trim())       { showToast('Donnez un nom à la routine', 'warning'); return; }
  if (!_state.exercices.length) { showToast('Ajoutez au moins un exercice', 'warning'); return; }
  await _onSave?.(_state);
  _close();
}

function _close() { _el?.remove(); _el = null; }
