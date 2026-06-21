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

// ── IMC / métabolisme ────────────────────────────────────────────────────
// Formule de Mifflin-St Jeor pour le métabolisme de base (plus fiable que
// Harris-Benedict sur la population générale), puis facteur d'activité
// physique appliqué à partir de la fréquence d'entraînement renseignée
// dans le profil (à défaut d'un vrai suivi de l'activité quotidienne).

export function calcIMC(poidsKg, tailleCm) {
  if (!poidsKg || !tailleCm) return null;
  const tailleM = tailleCm / 100;
  return poidsKg / (tailleM * tailleM);
}

export function imcCategorie(imc) {
  if (imc == null) return null;
  if (imc < 18.5) return 'Maigreur';
  if (imc < 25)   return 'Poids normal';
  if (imc < 30)   return 'Surpoids';
  return 'Obésité';
}

export function calcMetabolismeBase(poidsKg, tailleCm, age, sexe) {
  if (!poidsKg || !tailleCm || !age) return null;
  const base = 10 * poidsKg + 6.25 * tailleCm - 5 * age;
  if (sexe === 'homme') return Math.round(base + 5);
  if (sexe === 'femme') return Math.round(base - 161);
  return Math.round(base - 78); // moyenne homme/femme si sexe non précisé
}

const FACTEUR_ACTIVITE_PAR_FREQUENCE = { 2: 1.375, 3: 1.55, 4: 1.55, 5: 1.725 };

export function calcDepenseTotale(metabolismeBase, frequenceEntrainement) {
  if (!metabolismeBase) return null;
  const facteur = FACTEUR_ACTIVITE_PAR_FREQUENCE[frequenceEntrainement] ?? 1.375;
  return Math.round(metabolismeBase * facteur);
}

const AJUSTEMENT_KCAL_PAR_OBJECTIF = {
  hypertrophie: 300,   // léger surplus pour la prise de masse
  force:        150,
  seche:       -450,   // déficit modéré, ~0.4-0.5 kg/semaine
  endurance:    0,
  maintenance:  0,
};

export function calcCaloriesRecommandees(depenseTotale, objectif) {
  if (!depenseTotale) return null;
  return Math.round(depenseTotale + (AJUSTEMENT_KCAL_PAR_OBJECTIF[objectif] ?? 0));
}

// Protéines indexées sur le poids de corps (plus fiable qu'un % des
// calories), lipides à ~25% des calories, glucides en complément du reste —
// répartition standard en nutrition sportive.
const PROTEINES_G_PAR_KG_PAR_OBJECTIF = {
  hypertrophie: 2.0,
  force:        2.0,
  seche:        2.2,  // plus élevé en déficit pour préserver la masse musculaire
  endurance:    1.6,
  maintenance:  1.8,
};
const RATIO_LIPIDES_CALORIES = 0.25;

export function calcMacrosRecommandees(caloriesRecommandees, poidsKg, objectif) {
  if (!caloriesRecommandees || !poidsKg) return null;
  const proteines = Math.round(poidsKg * (PROTEINES_G_PAR_KG_PAR_OBJECTIF[objectif] ?? 1.8));
  const lipides   = Math.round(caloriesRecommandees * RATIO_LIPIDES_CALORIES / 9);
  const glucides  = Math.max(0, Math.round((caloriesRecommandees - proteines * 4 - lipides * 9) / 4));
  return { proteines, glucides, lipides };
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
