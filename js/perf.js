// ── Calculs de performance partagés (stats, records, détail exercice) ──

import { calc1RM } from './utils.js';
import { localKey } from './pulse-ui.js';

// Supabase renvoie au plus 1 000 lignes par requête : on pagine.
// makeQuery() doit renvoyer une requête neuve à chaque appel.
export async function fetchAll(makeQuery, pageSize = 1000) {
  const out = [];
  for (let from = 0; from < 100000; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

export const isWarmup = (s) => s?.type_serie === 'echauffement';

// Séries d'un exercice → séances, de la plus ancienne à la plus récente.
// Seules les séries de travail comptent.
export function sessionsOf(series) {
  const map = new Map();
  for (const s of series) {
    if (isWarmup(s)) continue;
    const k = s.seance_id ?? localKey(new Date(s.created_at));
    let g = map.get(k);
    if (!g) { g = { id: k, date: s.created_at, sets: [] }; map.set(k, g); }
    if (s.created_at < g.date) g.date = s.created_at;
    g.sets.push(s);
  }
  const out = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const g of out) {
    g.sets.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const kg = g.sets.filter(x => Number(x.poids_kg) > 0 && Number(x.repetitions) > 0);
    g.maxPoids = kg.length ? Math.max(...kg.map(x => Number(x.poids_kg))) : 0;
    g.best1RM  = kg.length ? Math.max(...kg.map(x => calc1RM(Number(x.poids_kg), Number(x.repetitions)))) : 0;
    g.volume   = kg.reduce((t, x) => t + Number(x.poids_kg) * Number(x.repetitions), 0);
    g.maxDuree = Math.max(0, ...g.sets.map(x => Number(x.duree_s) || 0));
    g.t = new Date(g.date).getTime();
  }
  return out;
}

// Résumé d'un exercice : records, meilleure série, records battus.
export function summarize(sessions) {
  const kg = sessions.some(g => g.maxPoids > 0);
  const best = { poids: 0, e1rm: 0, duree: 0, volume: 0, serie: null, poidsDate: null, dureeDate: null };
  const events = []; // records battus (hors première séance)
  let runPoids = 0, runDuree = 0;
  sessions.forEach((g, i) => {
    if (kg && g.maxPoids > runPoids) {
      if (i > 0) events.push({ date: g.date, valeur: g.maxPoids, avant: runPoids, kind: 'poids' });
      runPoids = g.maxPoids;
    }
    if (!kg && g.maxDuree > runDuree) {
      if (i > 0) events.push({ date: g.date, valeur: g.maxDuree, avant: runDuree, kind: 'duree' });
      runDuree = g.maxDuree;
    }
    if (g.maxPoids > best.poids) { best.poids = g.maxPoids; best.poidsDate = g.date; }
    if (g.maxDuree > best.duree) { best.duree = g.maxDuree; best.dureeDate = g.date; }
    if (g.volume > best.volume) best.volume = g.volume;
    for (const s of g.sets) {
      const p = Number(s.poids_kg), r = Number(s.repetitions);
      if (p > 0 && r > 0) {
        const e = calc1RM(p, r);
        if (e > best.e1rm) { best.e1rm = e; best.serie = { poids: p, reps: r, date: g.date }; }
      }
    }
  });
  return { kg, best, events, lastDate: sessions.at(-1)?.date ?? null, count: sessions.length };
}

export function fmtNum(n, dec = 1) {
  const v = Math.round(Number(n) * 10 ** dec) / 10 ** dec;
  return v.toLocaleString('fr-FR', { maximumFractionDigits: dec });
}

export function fmtDuree(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtShortDate(d, { weekday = false } = {}) {
  return new Date(d).toLocaleDateString('fr-FR', { ...(weekday ? { weekday: 'short' } : {}), day: 'numeric', month: 'short' });
}

export function ago(d) {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return 'aujourd’hui';
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} j`;
  if (days < 60) return `il y a ${Math.round(days / 7)} sem.`;
  if (days < 365) return `il y a ${Math.round(days / 30)} mois`;
  return `il y a ${Math.round(days / 365)} an${days >= 730 ? 's' : ''}`;
}

// ── Graphiques ────────────────────────────────────────────────────────

let _uid = 0;

// Courbe : points [{ t (ms), y }]. Aire douce, point final marqué,
// ligne pointillée sur le meilleur résultat, dates en dessous.
export function lineChartHTML(points, { height = 120, fmt = (y) => fmtNum(y), bestLabel = 'record' } = {}) {
  if (!points?.length) return '';
  const id = `pc${++_uid}`;
  const W = 340, H = height, T = 16, B = 8, X0 = 6, X1 = W - 6;
  const ys = points.map(p => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (max === min) { max += 1; min -= 1; }
  const pad = (max - min) * 0.18;
  min -= pad; max += pad * 0.4;
  const t0 = points[0].t, t1 = points.at(-1).t, span = Math.max(1, t1 - t0);
  const X = (t) => points.length === 1 ? W / 2 : X0 + ((t - t0) / span) * (X1 - X0);
  const Y = (y) => T + (1 - (y - min) / (max - min)) * (H - T - B);
  const xy = points.map(p => [X(p.t), Y(p.y)]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `M${xy[0][0].toFixed(1)},${H} L${line.replace(/ /g, ' L')} L${xy.at(-1)[0].toFixed(1)},${H} Z`;
  const bestY = Y(Math.max(...ys));
  const showDots = points.length <= 14;
  const [lx, ly] = xy.at(-1);

  const fmtAxis = (t) => {
    const long = span > 120 * 86400000;
    return new Date(t).toLocaleDateString('fr-FR', long ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' });
  };
  const ticks = points.length === 1 ? [t0] : [t0, t0 + span / 2, t1];

  return `
    <div class="pchart">
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" aria-hidden="true" class="pchart-svg">
        <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--color-primary)" stop-opacity="0.28"/>
          <stop offset="1" stop-color="var(--color-primary)" stop-opacity="0"/>
        </linearGradient></defs>
        <line x1="0" x2="${W}" y1="${bestY.toFixed(1)}" y2="${bestY.toFixed(1)}" class="pchart-best" vector-effect="non-scaling-stroke"/>
        ${points.length > 1 ? `<path d="${area}" fill="url(#${id})"/>
        <polyline points="${line}" fill="none" class="pchart-line" vector-effect="non-scaling-stroke"/>` : ''}
      </svg>
      <div class="pchart-dots" aria-hidden="true">
        ${showDots ? xy.slice(0, -1).map(([x, y]) => `<i style="left:${(x / W * 100).toFixed(2)}%;top:${y.toFixed(1)}px"></i>`).join('') : ''}
        <i class="is-last" style="left:${(lx / W * 100).toFixed(2)}%;top:${ly.toFixed(1)}px"></i>
        <span class="pchart-best-label" style="top:${Math.max(0, bestY - 15).toFixed(1)}px">${bestLabel} ${fmt(Math.max(...ys))}</span>
      </div>
      <div class="pchart-axis" aria-hidden="true">${ticks.map(t => `<span>${fmtAxis(t)}</span>`).join('')}</div>
    </div>`;
}

// Barres : [{ label, value, current, title }]
export function barsHTML(buckets, { fmt = (v) => fmtNum(v, 0), height = 110 } = {}) {
  const max = Math.max(1, ...buckets.map(b => b.value));
  const peak = buckets.reduce((m, b, i) => (b.value > (buckets[m]?.value ?? -1) ? i : m), 0);
  return `
    <div class="pbars" style="--h:${height}px" role="img" aria-label="${buckets.map(b => `${b.title ?? b.label} : ${fmt(b.value)}`).join(', ')}">
      ${buckets.map((b, i) => `
        <div class="pbar ${b.current ? 'is-current' : ''} ${b.future ? 'is-future' : ''}">
          <span class="pbar-val">${i === peak && b.value > 0 ? fmt(b.value) : ''}</span>
          <span class="pbar-col"><span class="pbar-fill" style="height:${b.value > 0 ? Math.max(4, Math.round((b.value / max) * 100)) : 0}%"></span></span>
          <span class="pbar-label">${b.label}</span>
        </div>`).join('')}
    </div>`;
}
