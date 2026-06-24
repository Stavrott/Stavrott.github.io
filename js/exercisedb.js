// ── Images d'exercices — deux sources libres et gratuites ────────────────
// Source 1 : github.com/yuhonas/free-exercise-db (MIT) — JPG statiques
// Source 2 : wger.de (GNU AGPL) — parfois GIF animés, ~900 exercices EN/FR
// Cache localStorage 60 jours pour éviter les requêtes répétées.

const CDN = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
const TTL = 60 * 24 * 60 * 60 * 1000;

// Mapping nom français → dossier free-exercise-db (yuhonas)
const IMG_MAP = {
  // ── Échauffement ──────────────────────────────────────────────────────
  'Rotation externe d\'épaule à la poulie (coude au corps)': 'Cable_External_Rotation',
  'Rotation interne d\'épaule à la poulie (coude au corps)': 'Cable_Internal_Rotation',
  'Rotation externe d\'épaule à la poulie (bras à 90°)':     'Cable_External_Rotation',
  'Rotation interne d\'épaule à la poulie (bras à 90°)':     'Cable_Internal_Rotation',
  'Élévation des bras tendus haltères':                       'Front_Dumbbell_Raise',
  // ── Poitrine ──────────────────────────────────────────────────────────
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
  // ── Dos ───────────────────────────────────────────────────────────────
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
  // ── Épaules ───────────────────────────────────────────────────────────
  'Développé militaire':                      'Barbell_Shoulder_Press',
  'Développé épaules haltères':               'Dumbbell_Shoulder_Press',
  'Développé Arnold':                         'Arnold_Dumbbell_Press',
  'Élévations latérales':                     'Seated_Side_Lateral_Raise',
  'Élévations latérales câble':               'Bent_Over_Low-Pulley_Side_Lateral',
  'Élévations frontales':                     'Front_Dumbbell_Raise',
  'Oiseau':                                   'Dumbbell_Lying_Rear_Lateral_Raise',
  'Rowing menton':                            'Upright_Barbell_Row',
  // ── Biceps ────────────────────────────────────────────────────────────
  'Curl biceps barre':                        'Barbell_Curl',
  'Curl biceps haltères':                     'Dumbbell_Alternate_Bicep_Curl',
  'Hammer curl':                              'Alternate_Hammer_Curl',
  'Curl barre EZ':                            'Close-Grip_EZ_Bar_Curl',
  'Curl incliné':                             'Alternate_Incline_Dumbbell_Curl',
  'Curl concentration':                       'Concentration_Curls',
  'Curl câble basse poulie':                  'Cable_Curl',
  'Curl marteau câble':                       'Cable_Hammer_Curl',
  // ── Triceps ───────────────────────────────────────────────────────────
  'Triceps poulie haute':                     'Triceps_Pushdown',
  'Triceps corde poulie haute':               'Triceps_Pushdown_-_Rope_Attachment',
  'Skull crushers':                           'EZ-Bar_Skullcrusher',
  'Extensions triceps haltère':               'Dumbbell_Seated_Triceps_Extension',
  'Extensions triceps haltère couché':        'Lying_Triceps_Press',
  'Dips triceps':                             'Dips_-_Triceps_Version',
  'Développé couché prise serrée':            'Close-Grip_Barbell_Bench_Press',
  'Kickback triceps':                         'Tricep_Dumbbell_Kickback',
  // ── Jambes ────────────────────────────────────────────────────────────
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
  // ── Abdominaux ────────────────────────────────────────────────────────
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
  // ── Cardio ────────────────────────────────────────────────────────────
  'Course à pied':                            'Jogging,_Treadmill',
  'Vélo stationnaire':                        'Stationary_Bike_Run,_or_Pedaling',
  'Rameur':                                   'Rowing,_Stationary',
  'Corde à sauter':                           'Jump_Rope',
};

// ── Cache helpers ──────────────────────────────────────────────────────

function _cacheRead(nom) {
  try {
    const raw = localStorage.getItem(`eximg_${nom}`);
    if (!raw) return undefined;
    const { url, ts } = JSON.parse(raw);
    if (Date.now() - ts > TTL) { localStorage.removeItem(`eximg_${nom}`); return undefined; }
    return url;
  } catch { return undefined; }
}
function _cacheWrite(nom, url) {
  try { localStorage.setItem(`eximg_${nom}`, JSON.stringify({ url, ts: Date.now() })); } catch {}
}

// Cache clé arbitraire → string (URL ou '')
function _cacheReadK(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const { url, ts } = JSON.parse(raw);
    if (Date.now() - ts > TTL) { localStorage.removeItem(key); return undefined; }
    return url;
  } catch { return undefined; }
}
function _cacheWriteK(key, url) {
  try { localStorage.setItem(key, JSON.stringify({ url, ts: Date.now() })); } catch {}
}

// Cache clé arbitraire → tableau de strings
function _cacheReadArr(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const { arr, ts } = JSON.parse(raw);
    if (Date.now() - ts > TTL) { localStorage.removeItem(key); return undefined; }
    return arr;
  } catch { return undefined; }
}
function _cacheWriteArr(key, arr) {
  try { localStorage.setItem(key, JSON.stringify({ arr, ts: Date.now() })); } catch {}
}

// ── Fetch avec timeout ─────────────────────────────────────────────────

async function _fetchWithTimeout(url, opts = {}, ms = 5000) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    return res;
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

// ── API publique ───────────────────────────────────────────────────────

// Retourne la première image disponible (thumbnail, usage liste d'exercices).
export async function fetchExerciseImage(nomFr) {
  const cached = _cacheRead(nomFr);
  if (cached !== undefined) return cached || null;

  const folder = IMG_MAP[nomFr];
  if (!folder) {
    // Pas dans le mapping statique : essaie wger pour ne pas retourner null inutilement
    const wger = await _fetchWgerImages(nomFr);
    _cacheWrite(nomFr, wger[0] ?? '');
    return wger[0] ?? null;
  }

  for (const idx of [0, 1]) {
    const url = `${CDN}/${folder}/${idx}.jpg`;
    try {
      const res = await _fetchWithTimeout(url, { method: 'HEAD' }, 4000);
      if (res.ok) { _cacheWrite(nomFr, url); return url; }
    } catch {}
  }
  _cacheWrite(nomFr, '');
  return null;
}

// Retourne jusqu'à 2 URLs pour le diaporama (yuhonas en priorité, wger en fallback).
export async function fetchExerciseImages(nomFr) {
  const folder = IMG_MAP[nomFr];

  if (folder) {
    const urls = [];
    for (const idx of [0, 1]) {
      const key    = `eximgm_${nomFr}_${idx}`;
      const cached = _cacheReadK(key);
      if (cached !== undefined) { if (cached) urls.push(cached); continue; }
      const url = `${CDN}/${folder}/${idx}.jpg`;
      try {
        const res = await _fetchWithTimeout(url, { method: 'HEAD' }, 4000);
        if (res.ok) { _cacheWriteK(key, url); urls.push(url); }
        else          _cacheWriteK(key, '');
      } catch { _cacheWriteK(key, ''); }
    }
    if (urls.length) return urls;
  }

  // Pas dans yuhonas (ou 0 image trouvée) → fallback wger.de
  return _fetchWgerImages(nomFr);
}

// ── Fallback wger.de ───────────────────────────────────────────────────
// wger est un projet open-source (GNU AGPL) avec une API REST publique.
// Ses images incluent parfois des GIF animés, et la base couvre ~900 exercices
// avec traductions en français — idéal pour les exercices custom.

async function _fetchWgerImages(nomFr) {
  const cacheKey = `exwger2_${nomFr}`;
  const cached   = _cacheReadArr(cacheKey);
  if (cached !== undefined) return cached;

  try {
    // 1. Recherche de l'exercice par terme français
    const searchRes = await _fetchWithTimeout(
      `https://wger.de/api/v2/exercisesearch/?term=${encodeURIComponent(nomFr)}&language=french&format=json`
    );
    if (!searchRes.ok) { _cacheWriteArr(cacheKey, []); return []; }

    const { suggestions } = await searchRes.json();
    if (!suggestions?.length) { _cacheWriteArr(cacheKey, []); return []; }

    const baseId = suggestions[0].data?.base_id;
    if (!baseId) { _cacheWriteArr(cacheKey, []); return []; }

    // 2. Récupère les images associées à cet exercice
    const imgRes = await _fetchWithTimeout(
      `https://wger.de/api/v2/exerciseimage/?exercise_base=${baseId}&format=json`
    );
    if (!imgRes.ok) { _cacheWriteArr(cacheKey, []); return []; }

    const { results } = await imgRes.json();
    const urls = (results ?? [])
      .filter(img => img.image)
      .map(img => img.image.startsWith('http') ? img.image : `https://wger.de${img.image}`)
      .slice(0, 2);

    _cacheWriteArr(cacheKey, urls);
    return urls;
  } catch {
    _cacheWriteArr(cacheKey, []);
    return [];
  }
}

// ── Compat (ancienne API — plus utilisée) ─────────────────────────────
export const hasApiKey = () => false;
export const setApiKey = () => {};
export const fetchGif  = fetchExerciseImage;
