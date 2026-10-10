import { currentUser }  from '../js/auth.js';
import { supabase }     from '../js/supabase.js';
import { escapeHtml, localDateStr } from '../js/utils.js';
import { bodyMapHTML, highlightMuscles } from '../js/body-map.js';
import { goalOf, regularityHTML, muscleShares, muscleWeights, muscleBarsHTML, localKey, mondayOf, addDays } from '../js/pulse-ui.js';
import { fetchAll, sessionsOf, summarize, fmtNum, fmtDuree, fmtShortDate, ago, lineChartHTML, barsHTML } from '../js/perf.js';

// ── Point d'entrée ────────────────────────────────────────────────────

let _tab = 'resumes';

export async function loadStats(section) {
  section.innerHTML = `
    <div class="tabs" id="stats-tabs">
      <button class="tab ${_tab === 'resumes' ? 'active' : ''}" data-tab="resumes">Résumé</button>
      <button class="tab ${_tab === 'records' ? 'active' : ''}" data-tab="records">Records</button>
      <button class="tab ${_tab === 'progression' ? 'active' : ''}" data-tab="progression">Progression</button>
    </div>
    <div id="stats-content">${_skeleton()}</div>`;

  const show = (id) => {
    _tab = id;
    section.querySelectorAll('#stats-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
    if (id === 'resumes')          _renderResumes(section);
    else if (id === 'records')     _renderRecords(section);
    else if (id === 'progression') _renderProgression(section);
  };
  section.querySelectorAll('#stats-tabs .tab').forEach(tab => tab.addEventListener('click', () => show(tab.dataset.tab)));
  show(_tab);
}

// ── Onglet Résumé : semaine / mois / année ────────────────────────────

const PERIODES = { semaine: 'Semaine', mois: 'Mois', annee: 'Année' };
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_INITIALES = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function _periode() {
  try { return PERIODES[localStorage.getItem('forme_stats_periode')] ? localStorage.getItem('forme_stats_periode') : 'semaine'; }
  catch { return 'semaine'; }
}

// Bornes de la période en cours et de la précédente « au même stade »
// (lundi → aujourd'hui comparé à lundi dernier → même jour, etc.).
function _bornes(p, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start, prevStart, end;
  if (p === 'semaine') { start = mondayOf(today); end = addDays(start, 7); prevStart = addDays(start, -7); }
  else if (p === 'mois') { start = new Date(today.getFullYear(), today.getMonth(), 1); end = new Date(today.getFullYear(), today.getMonth() + 1, 1); prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1); }
  else { start = new Date(today.getFullYear(), 0, 1); end = new Date(today.getFullYear() + 1, 0, 1); prevStart = new Date(today.getFullYear() - 1, 0, 1); }
  const elapsed = now - start;
  const prevEnd = new Date(Math.min(prevStart.getTime() + elapsed, start.getTime()));
  return { start, end, prevStart, prevEnd, now };
}

function _buckets(p, b) {
  const todayKey = localKey(b.now);
  if (p === 'semaine') {
    return ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((label, i) => {
      const d = addDays(b.start, i), k = localKey(d);
      return { label, title: d.toLocaleDateString('fr-FR', { weekday: 'long' }), from: k, to: k, current: k === todayKey, future: k > todayKey };
    });
  }
  if (p === 'mois') {
    // Semaines (du lundi au dimanche) qui touchent le mois.
    const out = [];
    let monday = mondayOf(b.start);
    const last = addDays(b.end, -1);
    while (monday <= last) {
      const from = monday < b.start ? b.start : monday;
      const sunday = addDays(monday, 6);
      const to = sunday > last ? last : sunday;
      out.push({
        label: `${from.getDate()}–${to.getDate()}`,
        title: `du ${from.getDate()} au ${to.getDate()}`,
        from: localKey(from), to: localKey(to),
        current: localKey(from) <= todayKey && todayKey <= localKey(to),
        future: localKey(from) > todayKey,
      });
      monday = addDays(monday, 7);
    }
    return out;
  }
  return MOIS_INITIALES.map((label, m) => {
    const from = new Date(b.start.getFullYear(), m, 1), to = new Date(b.start.getFullYear(), m + 1, 0);
    return { label, title: MOIS_COURTS[m], from: localKey(from), to: localKey(to), current: m === b.now.getMonth(), future: localKey(from) > todayKey };
  });
}

function _fmtTemps(min) {
  return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min}<span> min</span>`;
}

function _delta(cur, prev, p) {
  const ref = { semaine: 'la semaine dernière', mois: 'le mois dernier', annee: 'l’an dernier' }[p];
  if (!prev && !cur) return '';
  if (!prev) return '';
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return `<span class="stats-delta">Autant que ${ref} à date</span>`;
  const cls = pct > 0 ? 'is-up' : pct < 0 ? 'is-down' : '';
  return `<span class="stats-delta ${cls}">${pct > 0 ? '+' : ''}${pct} % vs ${ref} à date</span>`;
}

async function _renderResumes(section) {
  const content = section.querySelector('#stats-content');
  const p = _periode();
  content.innerHTML = `${_periodSwitch(p)}<div id="stats-period-body">${_skeleton()}</div>`;
  content.querySelector('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-periode]');
    if (!b || b.dataset.periode === _periode()) return;
    try { localStorage.setItem('forme_stats_periode', b.dataset.periode); } catch {}
    _renderResumes(section);
  });

  const body = content.querySelector('#stats-period-body');
  try {
    const b = _bornes(p);
    const uid = currentUser.id;
    const fourWeeks = localKey(addDays(mondayOf(), -21));
    const since = localKey(b.prevStart < new Date(fourWeeks) ? b.prevStart : new Date(fourWeeks));

    const [seances, series, { data: profil }, { count: totalCount }, recSeances] = await Promise.all([
      fetchAll(() => supabase.from('seances').select('id, date, duree_minutes, calories_estimees, muscles_travailles')
        .eq('user_id', uid).gte('date', since).order('date', { ascending: true })),
      fetchAll(() => supabase.from('series').select('poids_kg, repetitions, created_at, type_serie')
        .eq('user_id', uid).gte('created_at', b.prevStart.toISOString()).order('created_at', { ascending: true })),
      supabase.from('profils').select('frequence').eq('user_id', uid).maybeSingle(),
      supabase.from('seances').select('id', { count: 'exact', head: true }).eq('user_id', uid),
      // Colonne facultative seances.records : si elle manque, on s'en passe.
      Promise.resolve(supabase.from('seances').select('date, records').eq('user_id', uid).gte('date', fourWeeks))
        .then(r => r.data ?? []).catch(() => []),
    ]);

    const goal = goalOf(profil?.frequence);
    const startK = localKey(b.start), nowK = localKey(b.now);
    const prevEndT = b.prevEnd.getTime();

    const work = series.filter(s => s.type_serie !== 'echauffement');
    const vol = (x) => (Number(x.poids_kg) || 0) * (Number(x.repetitions) || 0);
    const inCur  = (s) => s.created_at >= b.start.toISOString();
    const inPrev = (s) => s.created_at >= b.prevStart.toISOString() && new Date(s.created_at).getTime() < prevEndT;
    const volume     = work.filter(inCur).reduce((t, x) => t + vol(x), 0);
    const volumePrev = work.filter(inPrev).reduce((t, x) => t + vol(x), 0);

    const cur  = seances.filter(s => s.date >= startK && s.date <= nowK);
    const minutes  = cur.reduce((t, s) => t + (s.duree_minutes ?? 0), 0);
    const calories = cur.reduce((t, s) => t + (s.calories_estimees ?? 0), 0);

    // Volume par jour / semaine / mois.
    const volByDay = new Map();
    for (const s of work.filter(inCur)) {
      const k = localKey(new Date(s.created_at));
      volByDay.set(k, (volByDay.get(k) ?? 0) + vol(s));
    }
    const buckets = _buckets(p, b).map(bk => {
      let v = 0, n = 0;
      for (const [k, x] of volByDay) if (k >= bk.from && k <= bk.to) v += x;
      for (const s of cur) if (s.date >= bk.from && s.date <= bk.to) n++;
      return { ...bk, value: Math.round(v), title: `${bk.title} — ${n} séance${n > 1 ? 's' : ''}` };
    });

    const counts = new Map();
    for (const s of cur) for (const m of s.muscles_travailles ?? []) counts.set(m, (counts.get(m) ?? 0) + 1);
    const shares = muscleShares([...counts.entries()]);

    const recordDays = new Set(recSeances.filter(x => Array.isArray(x.records) && x.records.length).map(x => x.date));
    const regSeances = seances.filter(s => s.date >= fourWeeks);

    const titre = { semaine: 'Cette semaine', mois: b.start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }), annee: String(b.start.getFullYear()) }[p];
    const seancesLabel = p === 'semaine'
      ? `${cur.length}<span> / ${goal}</span>`
      : `${cur.length}`;
    const barTitle = { semaine: 'Volume par jour', mois: 'Volume par semaine', annee: 'Volume par mois' }[p];

    body.innerHTML = `
      <div class="page-section stats-hero">
        <p class="stats-hero-label">Volume · ${escapeHtml(titre)}</p>
        <p class="stats-hero-value">${Math.round(volume).toLocaleString('fr-FR')}<span> kg</span></p>
        ${_delta(volume, volumePrev, p)}
      </div>

      <div class="page-section">
        <div class="grid-3">
          <div class="card"><p class="card-title">Séances</p><p class="card-value">${seancesLabel}</p></div>
          <div class="card"><p class="card-title">Temps</p><p class="card-value">${_fmtTemps(minutes)}</p></div>
          <div class="card"><p class="card-title">Calories</p><p class="card-value">${calories ? calories.toLocaleString('fr-FR') : '—'}${calories ? '<span> kcal</span>' : ''}</p></div>
        </div>
      </div>

      <div class="page-section">
        <h3 class="section-title" style="margin-bottom:var(--space-3)">${barTitle}</h3>
        <div class="card" style="padding:var(--space-4)">${barsHTML(buckets, { fmt: (v) => v >= 1000 ? `${fmtNum(v / 1000)} t` : `${v} kg` })}</div>
      </div>

      <div class="page-section">
        <h3 class="section-title" style="margin-bottom:var(--space-3)">Muscles travaillés</h3>
        ${shares.length ? `
          <div class="card" style="padding:var(--space-4)">
            ${bodyMapHTML('stats-periode')}
            <div style="margin-top:var(--space-4)">${muscleBarsHTML(shares)}</div>
          </div>` : `<div class="card"><p class="stats-empty">Aucune séance sur cette période pour l’instant.</p></div>`}
      </div>

      <div class="page-section">
        <h3 class="section-title" style="margin-bottom:var(--space-3)">Régularité · 4 dernières semaines</h3>
        <div class="card">${regularityHTML(regSeances, goal, recordDays)}</div>
      </div>

      <p class="stats-total">${totalCount ?? 0} séance${(totalCount ?? 0) > 1 ? 's' : ''} depuis le début</p>`;

    if (shares.length) highlightMuscles(body, shares.map(x => x.group), 'stats-periode', muscleWeights(shares));
  } catch (e) {
    console.warn('[stats]', e);
    body.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Erreur de chargement</p>`;
  }
}

function _periodSwitch(p) {
  return `
    <div class="seg" role="tablist" aria-label="Période">
      ${Object.entries(PERIODES).map(([k, l]) => `
        <button role="tab" class="seg-btn ${k === p ? 'is-on' : ''}" aria-selected="${k === p}" data-periode="${k}">${l}</button>`).join('')}
    </div>`;
}

// ── Onglet Records ────────────────────────────────────────────────────

let _recGroupe = 'Tous';

async function _loadPerExercise() {
  const series = await fetchAll(() => supabase.from('series')
    .select('exercice_nom, poids_kg, repetitions, duree_s, type_serie, created_at, seance_id')
    .eq('user_id', currentUser.id).order('created_at', { ascending: true }));
  const byExo = new Map();
  for (const s of series) {
    if (!byExo.has(s.exercice_nom)) byExo.set(s.exercice_nom, []);
    byExo.get(s.exercice_nom).push(s);
  }
  const out = [];
  for (const [nom, list] of byExo) {
    const sessions = sessionsOf(list);
    if (!sessions.length) continue;
    const sum = summarize(sessions);
    if (!sum.best.poids && !sum.best.duree) continue;
    out.push({ nom, sessions, ...sum });
  }
  return out;
}

async function _renderRecords(section) {
  const content = section.querySelector('#stats-content');
  content.innerHTML = _skeleton();
  try {
    const [rows, { getAllExercices, openExoDetail }] = await Promise.all([_loadPerExercise(), import('./exercices.js')]);
    const lib = await getAllExercices().catch(() => []);
    const meta = new Map(lib.map(e => [e.nom, e]));

    if (!rows.length) {
      content.innerHTML = `
        <div class="empty-state">
          <p class="empty-state-title">Aucun record pour l’instant</p>
          <p class="empty-state-desc">Tes meilleures charges et tes meilleurs temps apparaîtront ici après tes premières séances.</p>
        </div>`;
      return;
    }

    rows.forEach(r => {
      r.groupe = meta.get(r.nom)?.groupe ?? 'Autres';
      r.lastRecord = r.events.at(-1)?.date ?? r.best.poidsDate ?? r.best.dureeDate;
    });
    const events = rows.flatMap(r => r.events.map(e => ({ ...e, nom: r.nom })))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    const groupes = ['Tous', ...[...new Set(rows.map(r => r.groupe))].sort((a, b) => a.localeCompare(b, 'fr'))];
    if (!groupes.includes(_recGroupe)) _recGroupe = 'Tous';

    const fmtVal = (r) => r.kg ? `${fmtNum(r.best.poids)}<span> kg</span>` : fmtDuree(r.best.duree);
    const fresh = (d) => d && Date.now() - new Date(d).getTime() < 14 * 86400000;

    const draw = () => {
      const list = rows
        .filter(r => _recGroupe === 'Tous' || r.groupe === _recGroupe)
        .sort((a, b) => (b.lastRecord ?? '').localeCompare(a.lastRecord ?? ''));
      content.innerHTML = `
        ${events.length ? `
          <div class="page-section">
            <h3 class="section-title" style="margin-bottom:var(--space-3)">Derniers records battus</h3>
            <div class="rec-strip">
              ${events.map(e => `
                <button class="rec-event ${fresh(e.date) ? 'is-fresh' : ''}" data-exo="${escapeHtml(e.nom)}">
                  <span class="rec-event-date">${ago(e.date)}</span>
                  <span class="rec-event-name">${escapeHtml(e.nom)}</span>
                  <span class="rec-event-val">${e.kind === 'poids' ? `${fmtNum(e.valeur)} kg` : fmtDuree(e.valeur)}</span>
                  <span class="rec-event-gain">+${e.kind === 'poids' ? `${fmtNum(e.valeur - e.avant)} kg` : `${Math.round(e.valeur - e.avant)} s`}</span>
                </button>`).join('')}
            </div>
          </div>` : ''}

        <div class="page-section">
          <div class="chip-row" role="tablist" aria-label="Groupe musculaire">
            ${groupes.map(g => `<button class="chip ${g === _recGroupe ? 'active' : ''}" data-groupe="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join('')}
          </div>
          <div class="rec-list">
            ${list.map(r => `
              <button class="rec-card" data-exo="${escapeHtml(r.nom)}">
                <span class="rec-card-head">
                  <span class="rec-card-name">${escapeHtml(r.nom)}</span>
                  ${fresh(r.lastRecord) && r.events.length ? '<span class="rec-badge">Nouveau</span>' : ''}
                </span>
                <span class="rec-card-body">
                  <span class="rec-card-main">
                    <span class="rec-card-val">${fmtVal(r)}</span>
                    <span class="rec-card-sub">${r.kg
                      ? `1RM estimé ${fmtNum(r.best.e1rm)} kg${r.best.serie ? ` · meilleure série ${fmtNum(r.best.serie.poids)} × ${r.best.serie.reps}` : ''}`
                      : 'meilleur temps'}</span>
                    <span class="rec-card-date">${r.kg ? 'Charge max' : 'Record'} ${ago(r.kg ? r.best.poidsDate : r.best.dureeDate)} · ${r.count} séance${r.count > 1 ? 's' : ''}</span>
                  </span>
                  <span class="rec-spark">${_sparkSVG(r.sessions.map(g => r.kg ? g.maxPoids : g.maxDuree))}</span>
                </span>
              </button>`).join('')}
          </div>
        </div>`;

      content.querySelector('.chip-row')?.addEventListener('click', (e) => {
        const c = e.target.closest('[data-groupe]');
        if (!c) return;
        _recGroupe = c.dataset.groupe;
        draw();
      });
      content.querySelectorAll('[data-exo]').forEach(el => el.addEventListener('click', () => {
        const nom = el.dataset.exo;
        openExoDetail(meta.get(nom) ?? { nom, groupe: '', materiel: '', muscles: [] });
      }));
    };
    draw();
  } catch (e) {
    console.warn('[stats]', e);
    content.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Erreur de chargement</p>`;
  }
}

function _sparkSVG(values) {
  const v = values.slice(-12);
  if (v.length < 2) return '';
  const W = 72, H = 32, min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * (W - 4) + 2).toFixed(1)},${(H - 3 - ((y - min) / span) * (H - 6)).toFixed(1)}`);
  const [lx, ly] = pts.at(-1).split(',');
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lx}" cy="${ly}" r="3" fill="var(--color-primary)"/></svg>`;
}

// ── Onglet Progression ────────────────────────────────────────────────

async function _renderProgression(section) {
  const content = section.querySelector('#stats-content');
  content.innerHTML = _skeleton();

  try {
    const rows = (await _loadPerExercise()).filter(r => r.kg && r.sessions.length)
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

    if (!rows.length) {
      content.innerHTML = `
        <div class="empty-state">
          <p class="empty-state-title">Aucune donnée</p>
          <p class="empty-state-desc">Enregistre des séances pour voir tes courbes de progression.</p>
        </div>`;
      return;
    }

    // Exercice le plus récemment travaillé en premier choix.
    const recent = [...rows].sort((a, b) => b.lastDate.localeCompare(a.lastDate))[0];
    content.innerHTML = `
      <div class="form-group" style="margin-bottom:var(--space-4)">
        <label class="form-label" for="prog-exo-select">Exercice</label>
        <select class="form-select" id="prog-exo-select">
          ${rows.map(r => `<option value="${escapeHtml(r.nom)}" ${r === recent ? 'selected' : ''}>${escapeHtml(r.nom)}</option>`).join('')}
        </select>
      </div>
      <div id="prog-chart-container"></div>`;

    const select = content.querySelector('#prog-exo-select');
    const chartEl = content.querySelector('#prog-chart-container');
    const draw = (nom) => {
      const r = rows.find(x => x.nom === nom);
      if (!r) return;
      const first = r.sessions[0], last = r.sessions.at(-1);
      const gain = Math.round((last.maxPoids - first.maxPoids) * 10) / 10;
      chartEl.innerHTML = `
        <div class="grid-2" style="margin-bottom:var(--space-4)">
          <div class="card"><p class="card-title">Charge max</p><p class="card-value">${fmtNum(r.best.poids)}<span> kg</span></p></div>
          <div class="card"><p class="card-title">Depuis le début</p>
            <p class="card-value" style="color:${gain >= 0 ? 'var(--color-success)' : 'var(--color-error)'}">${gain >= 0 ? '+' : ''}${fmtNum(gain)}<span> kg</span></p></div>
        </div>
        <div class="card" style="padding:var(--space-4)">
          <p class="card-title" style="margin-bottom:var(--space-3)">Charge maximale par séance</p>
          ${lineChartHTML(r.sessions.map(g => ({ t: g.t, y: g.maxPoids })), { fmt: (y) => `${fmtNum(y)} kg` })}
          <p class="stats-foot">${r.count} séance${r.count > 1 ? 's' : ''} · ${fmtShortDate(first.date)} → ${fmtShortDate(last.date)}</p>
        </div>`;
    };
    select.addEventListener('change', () => draw(select.value));
    draw(select.value);
  } catch (e) {
    console.warn('[stats]', e);
    content.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-6)">Erreur de chargement</p>`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function _skeleton() {
  return `
    <div class="grid-2" style="margin-bottom:var(--space-4)">
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
    </div>
    <div class="skeleton skeleton-card" style="margin-bottom:var(--space-3);height:120px"></div>
    <div class="skeleton skeleton-card" style="height:60px"></div>`;
}
