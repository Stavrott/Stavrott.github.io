// ── Images d'exercices — free-exercise-db (MIT, GitHub) ───────────────
// Source : github.com/yuhonas/free-exercise-db
// Aucune clé API requise. Images JPG statiques haute qualité.
// Cache 60 jours en localStorage.

const CDN   = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
const TTL   = 60 * 24 * 60 * 60 * 1000;

// Mapping nom français → dossier free-exercise-db
const IMG_MAP = {
  // ── Poitrine ──────────────────────────────────────────────────────
  'Développé couché':                         'Barbell_Bench_Press_-_Medium_Grip',
  'Développé couché haltères':                'Dumbbell_Bench_Press',
  'Développé incliné barre':                  'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'Développé incliné haltères':               'Incline_Dumbbell_Bench_Press',
  'Développé décliné':                        'Decline_Barbell_Bench_Press',
  'Écarté couché':                            'Dumbbell_Flyes',
  'Écarté incliné':                           'Incline_Dumbbell_Flyes',
  'Croisés câble':                            'Cable_Crossover',
  'Pompes':                                   'Close-Grip_Push-Up_off_of_a_Dumbbell',
  'Pompes diamant':                           'Close-Grip_Push-Up',
  'Pompes pieds surélevés':                   'Decline_Push-Up',
  'Dips':                                     'Dips_-_Chest_Version',
  'Pull-over':                                'Bent-Arm_Dumbbell_Pullover',
  // ── Dos ───────────────────────────────────────────────────────────
  'Soulevé de terre':                         'Barbell_Deadlift',
  'Tractions':                                'Pullups',
  'Tractions prise serrée':                   'Chin-Up',
  'Rowing barre':                             'Bent_Over_Barbell_Row',
  'Rowing haltère unilatéral':                'Dumbbell_One_Arm_Row',
  'Tirage vertical barre large':              'Wide-Grip_Lat_Pulldown',
  'Tirage vertical prise neutre':             'Close-Grip_Front_Lat_Pulldown',
  'Tirage horizontal câble':                  'Seated_Cable_Rows',
  'Rowing à la machine':                      'Lever_Seated_Row',
  'Shrugs barre':                             'Barbell_Shrug',
  'Shrugs haltères':                          'Dumbbell_Shrug',
  'Face pull':                                'Face_Pull',
  'Good morning':                             'Good_Morning',
  // ── Épaules ──────────────────────────────────────────────────────
  'Développé militaire':                      'Barbell_Shoulder_Press',
  'Développé épaules haltères':               'Dumbbell_Shoulder_Press',
  'Développé Arnold':                         'Arnold_Dumbbell_Press',
  'Élévations latérales':                     'Seated_Side_Lateral_Raise',
  'Élévations latérales câble':               'Bent_Over_Low-Pulley_Side_Lateral',
  'Élévations frontales':                     'Front_Dumbbell_Raise',
  'Oiseau':                                   'Dumbbell_Lying_Rear_Lateral_Raise',
  'Rowing menton':                            'Upright_Barbell_Row',
  // ── Biceps ────────────────────────────────────────────────────────
  'Curl biceps barre':                        'Barbell_Curl',
  'Curl biceps haltères':                     'Dumbbell_Alternate_Bicep_Curl',
  'Hammer curl':                              'Alternate_Hammer_Curl',
  'Curl barre EZ':                            'Close-Grip_EZ_Bar_Curl',
  'Curl incliné':                             'Alternate_Incline_Dumbbell_Curl',
  'Curl concentration':                       'Concentration_Curls',
  'Curl câble basse poulie':                  'Cable_Curl',
  'Curl marteau câble':                       'Cable_Hammer_Curl',
  // ── Triceps ──────────────────────────────────────────────────────
  'Triceps poulie haute':                     'Triceps_Pushdown',
  'Triceps corde poulie haute':               'Triceps_Pushdown_-_Rope_Attachment',
  'Skull crushers':                           'EZ-Bar_Skullcrusher',
  'Extensions triceps haltère':               'Dumbbell_Seated_Triceps_Extension',
  'Extensions triceps haltère couché':        'Lying_Triceps_Press',
  'Dips triceps':                             'Dips_-_Triceps_Version',
  'Développé couché prise serrée':            'Close-Grip_Barbell_Bench_Press',
  'Kickback triceps':                         'Tricep_Dumbbell_Kickback',
  // ── Jambes ───────────────────────────────────────────────────────
  'Squat':                                    'Barbell_Full_Squat',
  'Squat gobelet':                            'Goblet_Squat',
  'Squat bulgare':                            'Barbell_Step_Ups',
  'Hack squat':                               'Barbell_Hack_Squat',
  'Leg press':                                'Leg_Press',
  'Leg extension':                            'Leg_Extensions',
  'Leg curl couché':                          'Lying_Leg_Curls',
  'Leg curl assis':                           'Seated_Leg_Curl',
  'Fentes':                                   'Dumbbell_Lunges',
  'Fentes marchées':                          'Barbell_Walking_Lunge',
  'Soulevé de terre roumain':                 'Romanian_Deadlift',
  'Soulevé de terre jambes tendues haltères': 'Dumbbell_Romanian_Deadlift',
  'Hip thrust':                               'Barbell_Hip_Thrust',
  'Hip thrust machine':                       'Barbell_Hip_Thrust',
  'Abducteur machine':                        'Hip_Abduction',
  'Step up':                                  'Barbell_Step_Ups',
  'Mollets debout':                           'Calf_Press',
  'Mollets assis':                            'Barbell_Seated_Calf_Raise',
  'Mollets leg press':                        'Calf_Press_On_The_Leg_Press_Machine',
  // ── Abdominaux ────────────────────────────────────────────────────
  'Crunchs':                                  'Crunch',
  'Crunchs à la poulie':                      'Cable_Crunch',
  'Planche':                                  'Plank',
  'Planche latérale':                         'Side_Plank',
  'Relevés de jambes':                        'Hanging_Leg_Raise',
  'Russian twist':                            'Cable_Russian_Twists',
  'Mountain climbers':                        'Mountain_Climbers',
  'Roue abdominale':                          'Barbell_Ab_Rollout',
  'Relevés de buste machine':                 'Ab_Crunch_Machine',
  'Leg raises sol':                           'Flat_Bench_Lying_Leg_Raise',
};

// ── Cache ─────────────────────────────────────────────────────────────

function _cacheRead(nom) {
  try {
    const raw = localStorage.getItem(`eximg_${nom}`);
    if (!raw) return undefined;
    const { url, ts } = JSON.parse(raw);
    if (Date.now() - ts > TTL) { localStorage.removeItem(`eximg_${nom}`); return undefined; }
    return url; // peut être '' si l'image n'existe pas
  } catch { return undefined; }
}

function _cacheWrite(nom, url) {
  try { localStorage.setItem(`eximg_${nom}`, JSON.stringify({ url, ts: Date.now() })); } catch {}
}

// ── Fetch image ───────────────────────────────────────────────────────

export async function fetchExerciseImage(nomFr) {
  const cached = _cacheRead(nomFr);
  if (cached !== undefined) return cached || null;

  const folder = IMG_MAP[nomFr];
  if (!folder) { _cacheWrite(nomFr, ''); return null; }

  // Essaie l'image 0 puis 1 si la 0 n'existe pas
  for (const idx of [0, 1]) {
    const url = `${CDN}/${folder}/${idx}.jpg`;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) { _cacheWrite(nomFr, url); return url; }
    } catch {}
  }
  _cacheWrite(nomFr, '');
  return null;
}

// ── Compat (ancienne API — plus utilisée) ─────────────────────────────
export const hasApiKey  = () => false;
export const setApiKey  = () => {};
export const fetchGif   = fetchExerciseImage;
