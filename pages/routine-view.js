import { supabase }             from '../js/supabase.js';
import { currentUser }          from '../js/auth.js';
import { EXERCICES }            from './exercices.js';
import { showToast }            from '../js/utils.js';
import { fetchExerciseImage }   from '../js/exercisedb.js';
import { openSeance }           from './seance.js';
import { metricFields, DEFAULT_METRIC_TYPE } from '../js/metrics.js';

// ── Mapping groupe → IDs SVG ───────────────────────────────────────────

const MUSCLE_MAP = {
  'Poitrine':   { ids: ['f-chest'],                                                           label: 'Pectoraux' },
  'Dos':        { ids: ['b-trap', 'b-upper-back', 'b-lower-back'],                            label: 'Trapèzes · Grand dorsal' },
  'Épaules':    { ids: ['f-front-deltoids', 'b-back-deltoids'],                               label: 'Deltoïdes' },
  'Biceps':     { ids: ['f-biceps'],                                                           label: 'Biceps' },
  'Triceps':    { ids: ['f-triceps', 'b-triceps'],                                            label: 'Triceps' },
  'Jambes':     { ids: ['f-quadriceps', 'b-gluteal', 'b-hamstring', 'f-calves', 'b-calves'], label: 'Quadriceps · Ischio-jambiers · Fessiers' },
  'Abdominaux': { ids: ['f-abs', 'f-obliques'],                                               label: 'Abdominaux' },
};

// ── SVG body map — polygons issus du package body-highlighter (MIT) ────
// viewBox 0 0 100 200 par vue, deux SVG imbriqués côte à côte.
// Les <g id="..."> héritent la couleur de remplissage : JS cible le groupe,
// tous les polygons enfants changent de couleur automatiquement.

const S = 'var(--surface-3)'; // couleur repos — ne pas modifier ici

const BODY_SVG = `
<svg viewBox="0 0 212 208" fill="none" xmlns="http://www.w3.org/2000/svg"
  style="width:100%;max-width:380px;display:block;margin:0 auto">

  <!-- ── Labels ── -->
  <text x="56"  y="7" text-anchor="middle" font-size="7" fill="var(--text-muted)" font-weight="700" letter-spacing=".07em">AVANT</text>
  <text x="156" y="7" text-anchor="middle" font-size="7" fill="var(--text-muted)" font-weight="700" letter-spacing=".07em">ARRIÈRE</text>
  <line x1="106" y1="1" x2="106" y2="207" stroke="var(--border)" stroke-width=".8"/>

  <!-- ══ AVANT — viewBox 0 0 100 200 ══ -->
  <svg x="6" y="8" width="100" height="200" viewBox="0 0 100 200">
    <g id="f-head" fill="${S}">
      <polygon points="42.4489796 2.85714286 40 11.8367347 42.0408163 19.5918367 46.122449 23.2653061 49.7959184 25.3061224 54.6938776 22.4489796 57.5510204 19.1836735 59.1836735 10.2040816 57.1428571 2.44897959 49.7959184 0"/>
    </g>
    <g id="f-neck" fill="${S}">
      <polygon points="55.5102041 23.6734694 50.6122449 33.4693878 50.6122449 39.1836735 61.6326531 40 70.6122449 44.8979592 69.3877551 36.7346939 63.2653061 35.1020408 58.3673469 30.6122449"/>
      <polygon points="28.9795918 44.8979592 30.2040816 37.1428571 36.3265306 35.1020408 41.2244898 30.2040816 44.4897959 24.4897959 48.9795918 33.877551 48.5714286 39.1836735 37.9591837 39.5918367"/>
    </g>
    <g id="f-front-deltoids" fill="${S}">
      <polygon points="78.3673469 53.0612245 79.5918367 47.755102 79.1836735 41.2244898 75.9183673 37.9591837 71.0204082 36.3265306 72.244898 42.8571429 71.4285714 47.3469388"/>
      <polygon points="28.1632653 47.3469388 21.2244898 53.0612245 20 47.755102 20.4081633 40.8163265 24.4897959 37.1428571 28.5714286 37.1428571 26.9387755 43.2653061"/>
    </g>
    <g id="f-chest" fill="${S}">
      <polygon points="51.8367347 41.6326531 51.0204082 55.1020408 57.9591837 57.9591837 67.755102 55.5102041 70.6122449 47.3469388 62.0408163 41.6326531"/>
      <polygon points="29.7959184 46.5306122 31.4285714 55.5102041 40.8163265 57.9591837 48.1632653 55.1020408 47.755102 42.0408163 37.5510204 42.0408163"/>
    </g>
    <g id="f-biceps" fill="${S}">
      <polygon points="16.7346939 68.1632653 17.9591837 71.4285714 22.8571429 66.122449 28.9795918 53.877551 27.755102 49.3877551 20.4081633 55.9183673"/>
      <polygon points="71.4285714 49.3877551 70.2040816 54.6938776 76.3265306 66.122449 81.6326531 71.8367347 82.8571429 68.9795918 78.7755102 55.5102041"/>
    </g>
    <g id="f-triceps" fill="${S}">
      <polygon points="69.3877551 55.5102041 69.3877551 61.6326531 75.9183673 72.6530612 77.5510204 70.2040816 75.5102041 67.3469388"/>
      <polygon points="22.4489796 69.3877551 29.7959184 55.5102041 29.7959184 60.8163265 22.8571429 73.0612245"/>
    </g>
    <g id="f-abs" fill="${S}">
      <polygon points="56.3265306 59.1836735 57.9591837 64.0816327 58.3673469 77.9591837 58.3673469 92.6530612 56.3265306 98.3673469 55.1020408 104.081633 51.4285714 107.755102 51.0204082 84.4897959 50.6122449 67.3469388 51.0204082 57.1428571"/>
      <polygon points="43.6734694 58.7755102 48.5714286 57.1428571 48.9795918 67.3469388 48.5714286 84.4897959 48.1632653 107.346939 44.4897959 103.673469 40.8163265 91.4285714 40.8163265 78.3673469 41.2244898 64.4897959"/>
    </g>
    <g id="f-obliques" fill="${S}">
      <polygon points="68.5714286 63.2653061 67.3469388 57.1428571 58.7755102 59.5918367 60 64.0816327 60.4081633 83.2653061 65.7142857 78.7755102 66.5306122 69.7959184"/>
      <polygon points="33.877551 78.3673469 33.0612245 71.8367347 31.0204082 63.2653061 32.244898 57.1428571 40.8163265 59.1836735 39.1836735 63.2653061 39.1836735 83.6734694"/>
    </g>
    <g id="f-forearm" fill="${S}">
      <polygon points="6.12244898 88.5714286 10.2040816 75.1020408 14.6938776 70.2040816 16.3265306 74.2857143 19.1836735 73.4693878 4.48979592 97.5510204 0 100"/>
      <polygon points="84.4897959 69.7959184 83.2653061 73.4693878 80 73.0612245 95.1020408 98.3673469 100 100.408163 93.4693878 89.3877551 89.7959184 76.3265306"/>
      <polygon points="77.5510204 72.244898 77.5510204 77.5510204 80.4081633 84.0816327 85.3061224 89.7959184 92.244898 101.22449 94.6938776 99.5918367"/>
      <polygon points="6.93877551 101.22449 13.4693878 90.6122449 18.7755102 84.0816327 21.6326531 77.1428571 21.2244898 71.8367347 4.89795918 98.7755102"/>
    </g>
    <g id="f-abductors" fill="${S}">
      <polygon points="52.6530612 110.204082 54.2857143 124.897959 60 110.204082 62.0408163 100 64.8979592 94.2857143 60 92.6530612 56.7346939 104.489796"/>
      <polygon points="47.755102 110.612245 44.8979592 125.306122 42.0408163 115.918367 40.4081633 113.061224 39.5918367 107.346939 37.9591837 102.44898 34.6938776 93.877551 39.5918367 92.244898 41.6326531 99.1836735 43.6734694 105.306122"/>
    </g>
    <g id="f-quadriceps" fill="${S}">
      <polygon points="34.6938776 98.7755102 37.1428571 108.163265 37.1428571 127.755102 34.2857143 137.142857 31.0204082 132.653061 29.3877551 120 28.1632653 111.428571 29.3877551 100.816327 32.244898 94.6938776"/>
      <polygon points="63.2653061 105.714286 64.4897959 100 66.9387755 94.6938776 70.2040816 101.22449 71.0204082 111.836735 68.1632653 133.061224 65.3061224 137.55102 62.4489796 128.571429 62.0408163 111.428571"/>
      <polygon points="38.7755102 129.387755 38.3673469 112.244898 41.2244898 118.367347 44.4897959 129.387755 42.8571429 135.102041 40 146.122449 36.3265306 146.530612 35.5102041 140"/>
      <polygon points="59.5918367 145.714286 55.5102041 128.979592 60.8163265 113.877551 61.2244898 130.204082 64.0816327 139.591837 62.8571429 146.530612"/>
      <polygon points="32.6530612 138.367347 26.5306122 145.714286 25.7142857 136.734694 25.7142857 127.346939 26.9387755 114.285714 29.3877551 133.469388"/>
      <polygon points="71.8367347 113.061224 73.877551 124.081633 73.877551 140.408163 72.6530612 145.714286 66.5306122 138.367347 70.2040816 133.469388"/>
    </g>
    <g id="f-knees" fill="${S}">
      <polygon points="33.877551 140 34.6938776 143.265306 35.5102041 147.346939 36.3265306 151.020408 35.1020408 156.734694 29.7959184 156.734694 27.3469388 152.653061 27.3469388 147.346939 30.2040816 144.081633"/>
      <polygon points="65.7142857 140 72.244898 147.755102 72.244898 152.244898 69.7959184 157.142857 64.8979592 156.734694 62.8571429 151.020408"/>
    </g>
    <g id="f-calves" fill="${S}">
      <polygon points="71.4285714 160.408163 73.4693878 153.469388 76.7346939 161.22449 79.5918367 167.755102 78.3673469 187.755102 79.5918367 195.510204 74.6938776 195.510204"/>
      <polygon points="24.8979592 194.693878 27.755102 164.897959 28.1632653 160.408163 26.122449 154.285714 24.8979592 157.55102 22.4489796 161.632653 20.8163265 167.755102 22.0408163 188.163265 20.8163265 195.510204"/>
      <polygon points="72.6530612 195.102041 69.7959184 159.183673 65.3061224 158.367347 64.0816327 162.44898 64.0816327 165.306122 65.7142857 177.142857"/>
      <polygon points="35.5102041 158.367347 35.9183673 162.44898 35.9183673 166.938776 35.1020408 172.244898 35.1020408 176.734694 32.244898 182.040816 30.6122449 187.346939 26.9387755 194.693878 27.3469388 187.755102 28.1632653 180.408163 28.5714286 175.510204 28.9795918 169.795918 29.7959184 164.081633 30.2040816 158.77551"/>
    </g>
  </svg>

  <!-- ══ ARRIÈRE — viewBox 0 0 100 200 ══ -->
  <svg x="112" y="8" width="100" height="200" viewBox="0 0 100 200">
    <g id="b-head" fill="${S}">
      <polygon points="50.6382979 0 45.9574468 0.85106383 40.8510638 5.53191489 40.4255319 12.7659574 45.106383 20 55.7446809 20 59.1489362 13.6170213 59.5744681 4.68085106 55.7446809 1.27659574"/>
    </g>
    <g id="b-trap" fill="${S}">
      <polygon points="44.6808511 21.7021277 47.6595745 21.7021277 47.2340426 38.2978723 47.6595745 64.6808511 38.2978723 53.1914894 35.3191489 40.8510638 31.0638298 36.5957447 39.1489362 33.1914894 43.8297872 27.2340426"/>
      <polygon points="52.3404255 21.7021277 55.7446809 21.7021277 56.5957447 27.2340426 60.8510638 32.7659574 68.9361702 36.5957447 64.6808511 40.4255319 61.7021277 53.1914894 52.3404255 64.6808511 53.1914894 38.2978723"/>
    </g>
    <g id="b-back-deltoids" fill="${S}">
      <polygon points="29.3617021 37.0212766 22.9787234 39.1489362 17.4468085 44.2553191 18.2978723 53.6170213 24.2553191 49.3617021 27.2340426 46.3829787"/>
      <polygon points="71.0638298 37.0212766 78.2978723 39.5744681 82.5531915 44.6808511 81.7021277 53.6170213 74.893617 48.9361702 72.3404255 45.106383"/>
    </g>
    <g id="b-upper-back" fill="${S}">
      <polygon points="31.0638298 38.7234043 28.0851064 48.9361702 28.5106383 55.3191489 34.0425532 75.3191489 47.2340426 71.0638298 47.2340426 66.3829787 36.5957447 54.0425532 33.6170213 41.2765957"/>
      <polygon points="68.9361702 38.7234043 71.9148936 49.3617021 71.4893617 56.1702128 65.9574468 75.3191489 52.7659574 71.0638298 52.7659574 66.3829787 63.4042553 54.4680851 66.3829787 41.7021277"/>
    </g>
    <g id="b-triceps" fill="${S}">
      <polygon points="26.8085106 49.787234 17.8723404 55.7446809 14.4680851 72.3404255 16.5957447 81.7021277 21.7021277 63.8297872 26.8085106 55.7446809"/>
      <polygon points="73.6170213 50.212766 82.1276596 55.7446809 85.9574468 73.1914894 83.4042553 82.1276596 77.8723404 62.9787234 73.1914894 55.7446809"/>
      <polygon points="26.8085106 58.2978723 26.8085106 68.5106383 22.9787234 75.3191489 19.1489362 77.4468085 22.5531915 65.5319149"/>
      <polygon points="72.7659574 58.2978723 77.0212766 64.6808511 80.4255319 77.4468085 76.5957447 75.3191489 72.7659574 68.9361702"/>
    </g>
    <g id="b-lower-back" fill="${S}">
      <polygon points="47.6595745 72.7659574 34.4680851 77.0212766 35.3191489 83.4042553 49.3617021 102.12766 46.8085106 82.9787234"/>
      <polygon points="52.3404255 72.7659574 65.5319149 77.0212766 64.6808511 83.4042553 50.6382979 102.12766 53.1914894 83.8297872"/>
    </g>
    <g id="b-forearm" fill="${S}">
      <polygon points="86.3829787 75.7446809 91.0638298 83.4042553 93.1914894 94.0425532 100 106.382979 96.1702128 104.255319 88.0851064 89.3617021 84.2553191 83.8297872"/>
      <polygon points="13.6170213 75.7446809 8.93617021 83.8297872 6.80851064 93.6170213 0 106.382979 3.82978723 104.255319 12.3404255 88.5106383 15.7446809 82.9787234"/>
      <polygon points="81.2765957 79.5744681 77.4468085 77.8723404 79.1489362 84.6808511 91.0638298 103.829787 93.1914894 108.93617 94.4680851 104.680851"/>
      <polygon points="18.7234043 79.5744681 22.1276596 77.8723404 20.8510638 84.2553191 9.36170213 102.978723 6.80851064 108.510638 5.10638298 104.680851"/>
    </g>
    <g id="b-gluteal" fill="${S}">
      <polygon points="44.6808511 99.5744681 30.212766 108.510638 29.787234 118.723404 31.4893617 125.957447 47.2340426 121.276596 49.3617021 114.893617"/>
      <polygon points="55.3191489 99.1489362 51.0638298 114.468085 52.3404255 120.851064 68.0851064 125.957447 69.787234 119.148936 69.3617021 108.510638"/>
    </g>
    <g id="b-abductor" fill="${S}">
      <polygon points="48.0851064 122.978723 44.6808511 122.978723 41.2765957 125.531915 45.106383 144.255319 48.5106383 135.744681 48.9361702 129.361702"/>
      <polygon points="51.9148936 122.553191 55.7446809 123.404255 59.1489362 125.957447 54.893617 144.255319 51.9148936 136.170213 51.0638298 129.361702"/>
    </g>
    <g id="b-hamstring" fill="${S}">
      <polygon points="28.9361702 122.12766 31.0638298 129.361702 36.5957447 125.957447 35.3191489 135.319149 34.4680851 150.212766 29.3617021 158.297872 28.9361702 146.808511 27.6595745 141.276596 27.2340426 131.489362"/>
      <polygon points="71.4893617 121.702128 69.3617021 128.93617 63.8297872 125.957447 65.5319149 136.595745 66.3829787 150.212766 71.0638298 158.297872 71.4893617 147.659574 72.7659574 142.12766 73.6170213 131.914894"/>
      <polygon points="38.7234043 125.531915 44.2553191 145.957447 40.4255319 166.808511 36.1702128 152.765957 37.0212766 135.319149"/>
      <polygon points="61.7021277 125.531915 63.4042553 136.170213 64.2553191 153.191489 60 166.808511 56.1702128 146.382979"/>
    </g>
    <g id="b-knees" fill="${S}">
      <polygon points="34.4680851 153.191489 31.0638298 159.148936 33.6170213 166.382979 37.4468085 162.553191"/>
      <polygon points="66.3829787 153.617021 62.9787234 162.978723 66.8085106 166.382979 69.3617021 159.148936"/>
    </g>
    <g id="b-calves" fill="${S}">
      <polygon points="29.3617021 160.425532 28.5106383 167.234043 24.6808511 179.574468 23.8297872 192.765957 25.5319149 197.021277 28.5106383 193.191489 29.787234 180 31.9148936 171.06383 31.9148936 166.808511"/>
      <polygon points="37.4468085 165.106383 35.3191489 167.659574 33.1914894 171.914894 31.0638298 180.425532 30.212766 191.914894 34.0425532 200 38.7234043 190.638298 39.1489362 168.93617"/>
      <polygon points="62.9787234 165.106383 61.2765957 168.510638 61.7021277 190.638298 66.3829787 199.574468 70.6382979 191.914894 68.9361702 179.574468 66.8085106 170.212766"/>
      <polygon points="70.6382979 160.425532 72.3404255 168.510638 75.7446809 179.148936 76.5957447 192.765957 74.4680851 196.595745 72.3404255 193.617021 70.6382979 179.574468 68.0851064 168.085106"/>
    </g>
    <g id="b-left-soleus" fill="${S}">
      <polygon points="28.5106383 195.744681 30.212766 195.744681 33.6170213 201.702128 30.6382979 220 28.5106383 213.617021 26.8085106 198.297872"/>
    </g>
    <g id="b-right-soleus" fill="${S}">
      <polygon points="69.787234 195.744681 71.9148936 195.744681 73.6170213 198.297872 71.9148936 213.191489 70.212766 219.574468 67.2340426 202.12766"/>
    </g>
  </svg>
</svg>`;

// ── Helpers ─────────────────────────────────────────────────────────────

// Résolution d'un nom de muscle (secondaire) → clé MUSCLE_MAP
const MUSCLES_TO_GROUP = {
  'Pectoraux': 'Poitrine', 'Pectoraux supérieurs': 'Poitrine', 'Pectoraux inférieurs': 'Poitrine',
  'Grand dorsal': 'Dos', 'Dorsaux': 'Dos', 'Trapèzes': 'Dos',
  'Rhomboïdes': 'Dos', 'Érecteurs spinaux': 'Dos',
  'Deltoïdes': 'Épaules', 'Deltoïdes antérieurs': 'Épaules',
  'Deltoïdes latéraux': 'Épaules', 'Deltoïdes postérieurs': 'Épaules',
  'Biceps': 'Biceps', 'Biceps brachial': 'Biceps', 'Brachial': 'Biceps', 'Brachioradial': 'Biceps',
  'Triceps': 'Triceps', 'Triceps long': 'Triceps',
  'Quadriceps': 'Jambes', 'Fessiers': 'Jambes', 'Ischio-jambiers': 'Jambes',
  'Gastrocnémiens': 'Jambes', 'Soléaire': 'Jambes', 'Fléchisseurs de hanche': 'Jambes',
  'Abducteurs': 'Jambes', 'Adducteurs': 'Jambes',
  'Grand droit de l\'abdomen': 'Abdominaux', 'Grand droit': 'Abdominaux',
  'Transverse': 'Abdominaux', 'Abdominaux inférieurs': 'Abdominaux', 'Obliques': 'Abdominaux',
};

function _getGroupe(nom) {
  return EXERCICES.find(e => e.nom === nom)?.groupe ?? null;
}

function _getMuscles(nom) {
  return EXERCICES.find(e => e.nom === nom)?.muscles ?? [];
}

// Tous les groupes SVG sollicités par un exercice (primaire + secondaires)
function _getAllGroupes(nom) {
  const primary = _getGroupe(nom);
  const secondary = _getMuscles(nom).map(m => MUSCLES_TO_GROUP[m]).filter(Boolean);
  return [primary, ...secondary].filter(Boolean);
}

function _calcVolume(exercices) {
  return (exercices ?? []).reduce((sum, ex) =>
    sum + (ex.series ?? []).reduce((s, serie) =>
      s + (serie.poids ?? 0) * (serie.reps ?? 0), 0), 0);
}

function _fmtVol(v) {
  return v >= 1000 ? `${(v / 1000).toFixed(1)} t` : `${v} kg`;
}

// ── Public ───────────────────────────────────────────────────────────────

let _el     = null;
let _chartFilter = '1m';

export function openRoutineView(routine, { onEdit, onStart } = {}) {
  _el?.remove();
  _chartFilter = '1m';

  const groups  = [...new Set((routine.exercices ?? []).flatMap(ex => _getAllGroupes(ex.nom)))];
  const muscles = [...new Set((routine.exercices ?? []).flatMap(ex => _getMuscles(ex.nom)))];
  const volume  = _calcVolume(routine.exercices);
  const nbSeries = (routine.exercices ?? []).reduce((a, ex) => a + (ex.series?.length ?? 0), 0);

  _el = document.createElement('div');
  _el.id = 'rv-overlay';
  _el.style.cssText = 'position:fixed;inset:0;background:var(--background);z-index:1000;display:flex;flex-direction:column;overflow:hidden';

  _el.innerHTML = `
    <header style="display:flex;align-items:center;gap:10px;padding:12px 16px;
      border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0">
      <button id="rv-back" class="icon-btn" aria-label="Retour">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
      </button>
      <h2 style="flex:1;font-size:1.1rem;font-weight:800;min-width:0;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(routine.nom)}</h2>
    </header>

    <div style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:20px;
      padding-bottom:calc(16px + env(safe-area-inset-bottom, 0px))">

      <!-- CTA buttons -->
      <div style="display:flex;gap:10px">
        <button id="rv-start" class="btn btn-primary" style="flex:1">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;flex-shrink:0">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Commencer la séance
        </button>
        <button id="rv-edit" class="btn btn-secondary" style="flex-shrink:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            style="width:16px;height:16px">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Modifier
        </button>
      </div>

      <!-- Résumé -->
      <div class="card" style="display:flex;gap:0;padding:0;overflow:hidden">
        ${_statCell(routine.exercices?.length ?? 0, 'Exercices')}
        <div style="width:1px;background:var(--border)"></div>
        ${_statCell(nbSeries, 'Séries')}
        <div style="width:1px;background:var(--border)"></div>
        ${_statCell(volume ? _fmtVol(volume) : '—', 'Volume théo.')}
      </div>

      <!-- Exercices -->
      <div>
        <h3 style="font-size:.8rem;font-weight:700;color:var(--text-muted);letter-spacing:.06em;
          text-transform:uppercase;margin-bottom:10px">Exercices</h3>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${_renderExoList(routine.exercices ?? [])}
        </div>
      </div>

      <!-- Body map -->
      <div class="card" style="padding:16px">
        <h3 style="font-size:.8rem;font-weight:700;color:var(--text-muted);letter-spacing:.06em;
          text-transform:uppercase;margin-bottom:14px">Muscles sollicités</h3>
        ${BODY_SVG}
        ${groups.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:14px">
          ${groups.map(g => `
            <span class="chip active" style="font-size:11px">
              ${MUSCLE_MAP[g]?.label ?? g}
            </span>`).join('')}
        </div>
        ${muscles.length ? `
        <p style="font-size:.78rem;color:var(--text-muted);margin-top:8px;line-height:1.6">
          ${muscles.join(' · ')}
        </p>` : ''}` : `
        <p style="text-align:center;color:var(--text-muted);font-size:.85rem;padding:8px 0">
          Ajoutez des exercices pour voir la cartographie
        </p>`}
      </div>

      <!-- Graphique de progression -->
      <div class="card" style="padding:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;flex-wrap:wrap">
          <h3 style="font-size:.8rem;font-weight:700;color:var(--text-muted);letter-spacing:.06em;text-transform:uppercase">
            Progression
          </h3>
          <div style="display:flex;gap:4px" id="rv-chart-filters">
            ${['7j','1m','3m','6m','1a'].map(f => `
              <button class="chip rv-filter ${f === _chartFilter ? 'active' : ''}"
                data-filter="${f}" style="font-size:10px;padding:3px 8px">${f}</button>`).join('')}
          </div>
        </div>
        <div id="rv-chart-area" style="min-height:120px;display:flex;align-items:center;justify-content:center">
          <div style="text-align:center;color:var(--text-muted)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
              style="width:32px;height:32px;margin:0 auto 8px;display:block;opacity:.3">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <p style="font-size:.75rem">Chargement…</p>
          </div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(_el);
  _highlightMuscles(groups);
  _loadChart(routine.nom);
  _loadExoImages(_el);

  _el.querySelector('#rv-back')?.addEventListener('click', _close);
  _el.querySelector('#rv-edit')?.addEventListener('click', () => { _close(); onEdit?.(); });
  _el.querySelector('#rv-start')?.addEventListener('click', () => { _close(); openSeance(routine); });
  _el.querySelector('#rv-chart-filters')?.addEventListener('click', e => {
    const btn = e.target.closest('.rv-filter');
    if (!btn) return;
    _chartFilter = btn.dataset.filter;
    _el.querySelectorAll('.rv-filter').forEach(b => b.classList.toggle('active', b === btn));
    _loadChart(routine.nom);
  });
}

function _close() { _el?.remove(); _el = null; }

// ── Rendu exercices ─────────────────────────────────────────────────────

function _renderExoList(exercices) {
  if (!exercices.length) return `<p style="color:var(--text-muted);font-size:.85rem">Aucun exercice</p>`;

  return exercices.map((ex, i) => {
    const sup  = i < exercices.length - 1 && exercices[i].repos_inter === null;
    const nbS  = ex.series?.length ?? 0;
    const vol  = _calcVolume([ex]);
    const groupe = _getGroupe(ex.nom);

    return `
      <div class="card" style="padding:12px 14px">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="exo-thumb" data-img-nom="${_esc(ex.nom)}"
            style="width:52px;height:52px;min-width:52px;border-radius:10px;overflow:hidden;
              background:var(--surface-3);display:flex;align-items:center;justify-content:center;
              flex-shrink:0;font-size:.75rem;font-weight:800;color:var(--text-muted)">${i + 1}</div>
          <div style="flex:1;min-width:0">
            <p style="font-weight:700;font-size:.9rem;
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(ex.nom)}</p>
            <p style="font-size:.75rem;color:var(--text-muted);margin-top:1px">
              ${nbS} série${nbS !== 1 ? 's' : ''}
              ${vol ? ` · ${_fmtVol(vol)} théoriques` : ''}
              ${groupe ? ` · ${groupe}` : ''}
            </p>
          </div>
        </div>
        ${nbS ? `
        <div style="display:grid;grid-template-columns:repeat(${metricFields(ex.type_metrique).length},1fr) 60px;gap:4px;margin-top:10px;
          padding-top:10px;border-top:1px solid var(--border)">
          ${metricFields(ex.type_metrique).map(f => `
            <p style="font-size:10px;font-weight:700;color:var(--text-muted);text-align:center;letter-spacing:.05em">${f.header}</p>`).join('')}
          <p style="font-size:10px;font-weight:700;color:var(--text-muted);text-align:center;letter-spacing:.05em">REPOS</p>
          ${(ex.series ?? []).map(s => `
            ${metricFields(ex.type_metrique).map(f => `
            <p style="text-align:center;font-size:.82rem;font-weight:600;padding:2px 0">
              ${s[f.key] ?? '—'}
            </p>`).join('')}
            <p style="text-align:center;font-size:.82rem;font-weight:600;padding:2px 0;color:var(--text-muted)">
              ${s.repos ?? 90}s
            </p>`).join('')}
        </div>` : ''}
      </div>
      ${sup ? `
      <div style="text-align:center;font-size:11px;font-weight:800;color:var(--color-primary);
        margin:-2px 0;letter-spacing:.04em">⚡ SUPERSET</div>` : ''}`;
  }).join('');
}

function _statCell(val, label) {
  return `
    <div style="flex:1;text-align:center;padding:14px 8px">
      <p style="font-size:1.2rem;font-weight:900;color:var(--text-primary)">${val}</p>
      <p style="font-size:.72rem;color:var(--text-muted);font-weight:600;margin-top:2px">${label}</p>
    </div>`;
}

// ── Body map highlighting ───────────────────────────────────────────────

function _highlightMuscles(groups) {
  if (!_el) return;
  const ACTIVE_FILL   = 'var(--color-primary)';
  const ACTIVE_OPACITY = '0.75';

  groups.forEach(g => {
    (MUSCLE_MAP[g]?.ids ?? []).forEach(id => {
      const el = _el.querySelector(`#${id}`);
      if (!el) return;
      el.style.fill    = ACTIVE_FILL;
      el.style.opacity = ACTIVE_OPACITY;
      el.style.filter  = 'drop-shadow(0 0 4px var(--color-primary-glow-s))';
    });
  });
}

// ── Graphique de progression ────────────────────────────────────────────

async function _loadChart(routineNom) {
  const area = _el?.querySelector('#rv-chart-area');
  if (!area) return;

  area.innerHTML = `
    <div style="text-align:center;color:var(--text-muted)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
        style="width:32px;height:32px;margin:0 auto 8px;display:block;opacity:.3">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
      <p style="font-size:.75rem">Chargement…</p>
    </div>`;

  try {
    const days     = { '7j': 7, '1m': 30, '3m': 90, '6m': 180, '1a': 365 }[_chartFilter] ?? 30;
    const since    = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const { data: seances, error: e1 } = await supabase
      .from('seances')
      .select('id, date')
      .eq('user_id', currentUser.id)
      .eq('nom', routineNom)
      .gte('date', sinceStr)
      .order('date', { ascending: true });

    if (e1 || !seances?.length) { _renderEmptyChart(area); return; }

    const { data: seriesData, error: e2 } = await supabase
      .from('series')
      .select('seance_id, poids_kg, repetitions')
      .in('seance_id', seances.map(s => s.id));

    if (e2) { _renderEmptyChart(area); return; }

    const volBySeance = {};
    for (const r of seriesData ?? []) {
      volBySeance[r.seance_id] = (volBySeance[r.seance_id] ?? 0) + (r.poids_kg ?? 0) * (r.repetitions ?? 0);
    }

    const points = seances
      .map(s => ({ date: new Date(s.date), volume: volBySeance[s.id] ?? 0 }))
      .filter(p => p.volume > 0);

    if (!points.length) { _renderEmptyChart(area); return; }
    _renderChart(area, points);
  } catch {
    _renderEmptyChart(area);
  }
}

function _renderEmptyChart(area) {
  area.innerHTML = `
    <div style="text-align:center;padding:16px 0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
        style="width:40px;height:40px;margin:0 auto 10px;display:block;opacity:.25">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
      <p style="font-size:.82rem;font-weight:700;color:var(--text-secondary);margin-bottom:4px">
        Aucune donnée disponible
      </p>
      <p style="font-size:.74rem;color:var(--text-muted);line-height:1.5">
        Lancez votre première séance pour<br>suivre votre progression ici.
      </p>
    </div>`;
}

function _renderChart(area, points) {
  const W = 280, H = 120, PAD = { t: 8, r: 8, b: 28, l: 44 };
  const cw = W - PAD.l - PAD.r;
  const ch = H - PAD.t - PAD.b;

  const vols  = points.map(p => p.volume);
  const minV  = Math.min(...vols);
  const maxV  = Math.max(...vols);
  const range = maxV - minV || 1;

  const xOf = i => PAD.l + (i / (points.length - 1 || 1)) * cw;
  const yOf = v => PAD.t + ch - ((v - minV) / range) * ch;

  const linePts = points.map((p, i) => `${xOf(i)},${yOf(p.volume)}`).join(' ');

  const gridY = [minV, (minV + maxV) / 2, maxV];
  const gridLines = gridY.map(v => {
    const y = yOf(v);
    return `
      <line x1="${PAD.l}" y1="${y}" x2="${W - PAD.r}" y2="${y}"
        stroke="var(--chart-grid)" stroke-dasharray="3,3"/>
      <text x="${PAD.l - 4}" y="${y + 4}" font-size="8" fill="var(--text-muted)"
        text-anchor="end">${v >= 1000 ? (v/1000).toFixed(1)+'t' : Math.round(v)}</text>`;
  }).join('');

  const dateLabels = [0, Math.floor(points.length / 2), points.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i && points[v])
    .map(i => {
      const d = points[i].date;
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      return `<text x="${xOf(i)}" y="${H - 6}" font-size="8" fill="var(--text-muted)" text-anchor="middle">${label}</text>`;
    }).join('');

  area.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">
      ${gridLines}
      <polyline points="${linePts}" fill="none"
        stroke="var(--color-primary)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <linearGradient id="rv-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--color-primary)" stop-opacity=".18"/>
        <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0"/>
      </linearGradient>
      <polygon points="${linePts} ${xOf(points.length-1)},${H-PAD.b} ${PAD.l},${H-PAD.b}"
        fill="url(#rv-grad)"/>
      ${points.map((p, i) => `
        <circle cx="${xOf(i)}" cy="${yOf(p.volume)}" r="3"
          fill="var(--color-primary)" stroke="var(--background)" stroke-width="1.5"/>`).join('')}
      ${dateLabels}
    </svg>`;
}

// ── Chargement miniatures ────────────────────────────────────────────────

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

// ── Util ─────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}
