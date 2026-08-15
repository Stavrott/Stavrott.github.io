// ── Types de série ─────────────────────────────────────────────────────
// Une série d'échauffement n'est pas une série de travail : elle ne doit
// compter ni dans le tonnage, ni dans les records, ni dans la courbe de
// progression, ni dans la colonne "dernière fois". Les trois autres types
// sont bien du travail effectif et comptent normalement — ils servent à
// relire son historique, pas à filtrer les statistiques.
//
// Stocké dans la colonne `series.type_serie` (voir supabase-schema.sql).
// `court` est le libellé affiché dans la pastille de la ligne de série ;
// vide pour une série normale, qui garde son numéro d'ordre.

export const SET_TYPES = {
  normale: {
    label: 'Série normale',
    court: '',
    aide:  'Compte dans les statistiques',
  },
  echauffement: {
    label: 'Échauffement',
    court: 'É',
    aide:  'Exclue des statistiques et des records',
  },
  degressive: {
    label: 'Série dégressive',
    court: 'D',
    aide:  'Compte comme une série de travail',
  },
  echec: {
    label: "Jusqu'à l'échec",
    court: 'E',
    aide:  'Compte comme une série de travail',
  },
};

export const DEFAULT_SET_TYPE = 'normale';

// Une valeur absente vaut 'normale' : les séries enregistrées avant
// l'ajout de la colonne, et celles d'une routine qui ne la précise pas,
// restent donc du travail effectif.
export function setTypeOf(v) {
  const t = v ?? DEFAULT_SET_TYPE;
  return SET_TYPES[t] ? t : DEFAULT_SET_TYPE;
}

// Le seul filtre qui compte pour les statistiques.
export function isWorkingSet(v) {
  return setTypeOf(v) !== 'echauffement';
}

// Accepte aussi bien une série côté séance active (`{ type }`) qu'une
// ligne de la table `series` (`{ type_serie }`).
export function isWorkingRow(row) {
  return isWorkingSet(row?.type_serie ?? row?.type);
}

export function setTypeLabel(v) {
  return SET_TYPES[setTypeOf(v)].label;
}

// Classe CSS de la pastille — vide pour une série normale, qui garde
// l'apparence par défaut (voir css/components.css).
export function setTypeClass(v) {
  const t = setTypeOf(v);
  return t === DEFAULT_SET_TYPE ? '' : `set-type-${t}`;
}
