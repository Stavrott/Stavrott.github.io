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
      { key: 'duree', header: 'DURÉE (S)', short: 's', step: 5, type: 'int' },
    ],
  },
  cardio_basique: {
    label: 'Cardio — Durée × Vitesse × Inclinaison',
    fields: [
      { key: 'duree',       header: 'DURÉE (S)',  short: 's',    step: 30,  type: 'int' },
      { key: 'vitesse',     header: 'VIT. KM/H',  short: 'km/h', step: 0.5, type: 'float' },
      { key: 'inclinaison', header: 'INCL. %',    short: '%',    step: 0.5, type: 'float' },
    ],
  },
  cardio_machine: {
    label: 'Cardio machine — Durée × Résistance',
    fields: [
      { key: 'duree',      header: 'DURÉE (S)', short: 's',   step: 30, type: 'int' },
      { key: 'resistance', header: 'RÉSIST.',   short: 'niv', step: 1,  type: 'float' },
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

export function parseFieldValue(field, raw) {
  if (raw === '' || raw == null) return null;
  const n = field.type === 'int' ? parseInt(raw) : parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

export function defaultFieldValue(field, ref) {
  if (ref?.[field.key] != null) return ref[field.key];
  return field.default ?? null;
}
