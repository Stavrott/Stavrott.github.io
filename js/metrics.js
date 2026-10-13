// ── Types de métriques par exercice ────────────────────────────────────
// Chaque exercice a un `type_metrique` qui détermine les champs de saisie
// par série. 'kg_reps' est le défaut historique (poids × répétitions).

export const METRIC_TYPES = {
  kg_reps: {
    label: 'Poids × Répétitions',
    fields: [
      { key: 'poids', header: 'KG',   short: 'kg',   step: 0.5, type: 'float' },
      { key: 'reps',  header: 'REPS', short: 'reps', step: 1,   type: 'int', default: 8 },
    ],
  },
  isometrique: {
    label: 'Isométrique (Durée)',
    fields: [
      { key: 'duree', header: 'DURÉE', short: 's', step: 5, type: 'int' },
    ],
  },
  cardio_basique: {
    label: 'Cardio — Durée × Vitesse × Inclinaison',
    fields: [
      { key: 'duree',       header: 'DURÉE',      short: 's',    step: 30,  type: 'int' },
      { key: 'vitesse',     header: 'VIT. KM/H',  short: 'km/h', step: 0.5, type: 'float' },
      { key: 'inclinaison', header: 'INCL. %',    short: '%',    step: 0.5, type: 'float' },
    ],
  },
  cardio_machine: {
    label: 'Cardio machine — Durée × Résistance',
    fields: [
      { key: 'duree',      header: 'DURÉE',     short: 's',   step: 30, type: 'int' },
      { key: 'resistance', header: 'RÉSIST.',   short: 'niv', step: 1,  type: 'float' },
    ],
  },
  // Sport pratiqué (tennis, natation…) : une durée de jeu ou de pratique,
  // réglable par pas de 5 minutes, 1 h par défaut ; un nombre seul tapé
  // dans le champ compte en minutes (« 90 » = 1h30).
  sport: {
    label: 'Sport — Durée',
    fields: [
      { key: 'duree', header: 'DURÉE', short: 's', step: 300, type: 'int', default: 3600, plainUnit: 'min' },
    ],
  },
};

export const DEFAULT_METRIC_TYPE = 'kg_reps';

export function metricFields(type) {
  return METRIC_TYPES[type]?.fields ?? METRIC_TYPES[DEFAULT_METRIC_TYPE].fields;
}

const _FIELD_BY_KEY = Object.fromEntries(
  Object.values(METRIC_TYPES).flatMap(t => t.fields).map(f => [f.key, f])
);

export function fieldByKey(key) {
  return _FIELD_BY_KEY[key];
}

// Colonnes de la table `series` (Supabase) — voir supabase-schema.sql
export const FIELD_DB_COLUMN = {
  poids:       'poids_kg',
  reps:        'repetitions',
  duree:       'duree_s',
  vitesse:     'vitesse_kmh',
  inclinaison: 'inclinaison_pct',
  resistance:  'resistance',
};

// ── Durées ────────────────────────────────────────────────────────────
// Stockées en secondes (series.duree_s), saisies et affichées en h / min / s :
// « 1h30 », « 45min », « 2min30s », « 30s ». La saisie accepte aussi
// « 1h30m », « 90min », « 1:30:00 », « 1 h 30 »… Un nombre seul prend
// l'unité du champ (`plainUnit` : secondes par défaut, minutes pour un
// sport) ; après « h » il compte en minutes, après « min » en secondes.

export function isDureeField(field) {
  return field?.key === 'duree';
}

export function formatDuree(sec) {
  if (sec == null || sec === '') return '';
  const t = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const p = n => String(n).padStart(2, '0');
  if (h) return s ? `${h}h${p(m)}m${p(s)}s` : m ? `${h}h${p(m)}` : `${h}h`;
  if (m) return s ? `${m}min${p(s)}s` : `${m}min`;
  return `${s}s`;
}

const _UNIT_SEC = { h: 3600, min: 60, s: 1 };
const _UNIT_ALIAS = { h: 'h', min: 'min', mn: 'min', m: 'min', s: 's', sec: 's' };
const _NEXT_UNIT = { h: 'min', min: 's' };

export function parseDuree(raw, plainUnit = 's') {
  const str = String(raw ?? '').toLowerCase().replace(/\s+/g, '').replace(',', '.');
  if (!str) return null;

  // « 1:30:00 », « 45:30 » (h:min pour un sport, min:s sinon)
  if (/^\d+(:\d{1,2}){1,2}$/.test(str)) {
    const parts = str.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return plainUnit === 'min' ? parts[0] * 3600 + parts[1] * 60 : parts[0] * 60 + parts[1];
  }

  const re = /(\d+(?:\.\d+)?)(h|min|mn|sec|m|s)?/y;
  let total = 0, prev = null, n = 0, pos = 0;
  while (pos < str.length) {
    re.lastIndex = pos;
    const m = re.exec(str);
    if (!m) return null;
    pos = re.lastIndex;
    const unit = m[2] ? _UNIT_ALIAS[m[2]] : (prev ? _NEXT_UNIT[prev] : null) ?? (n ? null : plainUnit);
    if (!unit) return null;
    total += parseFloat(m[1]) * _UNIT_SEC[unit];
    prev = unit; n++;
  }
  return Math.round(total);
}

// Valeur à mettre dans un champ de saisie, et texte d'affichage.
export function formatFieldValue(field, value) {
  if (value == null || value === '') return '';
  return isDureeField(field) ? formatDuree(value) : value;
}

export function formatFieldDisplay(field, value) {
  if (value == null || value === '') return '?';
  return isDureeField(field) ? formatDuree(value) : `${value} ${field.short}`;
}

// Attributs du champ de saisie : clavier numérique, ou texte pour une
// durée (« 1h30 » a besoin des lettres).
export function fieldInputAttrs(field) {
  if (isDureeField(field)) return `type="text" inputmode="text" autocomplete="off" spellcheck="false"`;
  return `type="number" inputmode="${field.type === 'int' ? 'numeric' : 'decimal'}" step="${field.step}" min="0"`;
}

export function parseFieldValue(field, raw) {
  if (raw === '' || raw == null) return null;
  if (isDureeField(field)) return parseDuree(raw, field.plainUnit);
  const n = field.type === 'int' ? parseInt(raw) : parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

export function defaultFieldValue(field, ref) {
  if (ref?.[field.key] != null) return ref[field.key];
  return field.default ?? null;
}
