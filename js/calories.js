// ── Estimation des calories brûlées par séance ──────────────────────────
// Formule MET standard : kcal/min = MET × 3.5 × poids(kg) / 200.
// Le MET varie selon le type d'effort ; on pondère par le nombre de séries
// validées par exercice pour obtenir un MET moyen représentatif de la séance.

const MET_BY_TYPE = {
  kg_reps:        5,   // musculation classique, intensité modérée
  isometrique:    3,   // gainage / isométrie
  cardio_basique: 8,   // tapis, vélo en effort direct
  cardio_machine: 7,   // rameur, elliptique
};

export function estimateCaloriesSeance(exercices, dureeMinutes, poidsKg) {
  if (!dureeMinutes || !poidsKg) return null;

  const setsCount = exercices.reduce((n, e) => n + (e.sets?.filter(s => s.done).length ?? 0), 0);
  if (!setsCount) return null;

  const metWeighted = exercices.reduce((sum, e) => {
    const done = e.sets?.filter(s => s.done).length ?? 0;
    const met  = MET_BY_TYPE[e.type_metrique] ?? MET_BY_TYPE.kg_reps;
    return sum + met * done;
  }, 0);

  const met = metWeighted / setsCount;
  return Math.round(met * 3.5 * poidsKg / 200 * dureeMinutes);
}

// ── Muscles travaillés ───────────────────────────────────────────────────
// Agrège les muscles ciblés des exercices ayant au moins une série validée,
// triés par fréquence d'apparition décroissante.

export function musclesTravailles(exercices) {
  const counts = new Map();
  for (const e of exercices) {
    const done = e.sets?.some(s => s.done);
    if (!done) continue;
    for (const m of e.muscles ?? []) {
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
}
