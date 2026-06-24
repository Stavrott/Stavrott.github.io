import { currentUser }  from '../js/auth.js';
import { supabase }      from '../js/supabase.js';
import { debounce, openModal, closeModal, showToast, showLoading, hideLoading, emptyState,
         calc1RM, formatDate, todayStr, lsGet, lsSet, svgLineChart, confirmDialog } from '../js/utils.js';
import { fetchExerciseImage } from '../js/exercisedb.js';
import { METRIC_TYPES, DEFAULT_METRIC_TYPE } from '../js/metrics.js';

// ── Bibliothèque intégrée ─────────────────────────────────────────────

export const EXERCICES = [
  // ── Échauffement ──────────────────────────────────────────────────────
  { nom: 'Rotation externe d\'épaule à la poulie (coude au corps)', groupe: 'Échauffement', materiel: 'Câble', niveau: 'Débutant',
    muscles: ['Coiffe des rotateurs', 'Deltoïdes postérieurs'],
    description: 'Poulie basse, coude plié à 90° et collé au corps. Éloignez l\'avant-bras du corps en gardant le coude fixe, puis revenez lentement. Échauffement classique de la coiffe des rotateurs.' },
  { nom: 'Rotation interne d\'épaule à la poulie (coude au corps)', groupe: 'Échauffement', materiel: 'Câble', niveau: 'Débutant',
    muscles: ['Coiffe des rotateurs', 'Pectoraux'],
    description: 'Poulie réglée à l\'opposé, coude plié à 90° et collé au corps. Ramenez l\'avant-bras vers le ventre en gardant le coude fixe, puis revenez lentement.' },
  { nom: 'Rotation interne d\'épaule à la poulie (bras à 90°)', groupe: 'Échauffement', materiel: 'Câble', niveau: 'Débutant',
    muscles: ['Coiffe des rotateurs', 'Deltoïdes'],
    description: 'Coude levé à hauteur d\'épaule, avant-bras perpendiculaire au sol (poing vers le haut). Abaissez l\'avant-bras jusqu\'à l\'horizontale en pivotant à l\'épaule, puis remontez.' },
  { nom: 'Rotation externe d\'épaule à la poulie (bras à 90°)', groupe: 'Échauffement', materiel: 'Câble', niveau: 'Débutant',
    muscles: ['Coiffe des rotateurs', 'Deltoïdes postérieurs'],
    description: 'Coude levé à hauteur d\'épaule, avant-bras à l\'horizontale. Montez l\'avant-bras à la verticale en pivotant à l\'épaule, puis redescendez lentement.' },
  { nom: 'Élévation des bras tendus haltères', groupe: 'Échauffement', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Deltoïdes', 'Trapèzes'],
    description: 'Bras tendus le long du corps, haltères légers en main. Montez les bras tendus jusqu\'au-dessus de la tête, puis redescendez avec contrôle. Échauffement global de l\'épaule.' },

  // ── Poitrine ──────────────────────────────────────────────────────────
  { nom: 'Développé couché', groupe: 'Poitrine', materiel: 'Barre', niveau: 'Intermédiaire',
    muscles: ['Pectoraux', 'Triceps', 'Deltoïdes antérieurs'],
    description: 'Exercice de base pour la poitrine. Allongé sur le banc, descendez la barre jusqu\'à la poitrine en contrôlant le mouvement, puis poussez explositement.' },
  { nom: 'Développé couché haltères', groupe: 'Poitrine', materiel: 'Haltères', niveau: 'Intermédiaire',
    muscles: ['Pectoraux', 'Triceps', 'Deltoïdes antérieurs'],
    description: 'Variante aux haltères offrant une meilleure amplitude et un travail de stabilisation. Descente jusqu\'à l\'étirement des pectoraux.' },
  { nom: 'Développé incliné barre', groupe: 'Poitrine', materiel: 'Barre', niveau: 'Intermédiaire',
    muscles: ['Pectoraux supérieurs', 'Triceps', 'Deltoïdes antérieurs'],
    description: 'Banc incliné à 30-45°. Cible le faisceau claviculaire des pectoraux. Gardez les coudes légèrement rentrés.' },
  { nom: 'Développé incliné haltères', groupe: 'Poitrine', materiel: 'Haltères', niveau: 'Intermédiaire',
    muscles: ['Pectoraux supérieurs', 'Triceps'],
    description: 'Même mouvement que le développé couché mais sur un banc incliné à 30-45°. Cible davantage la partie supérieure de la poitrine.' },
  { nom: 'Développé décliné', groupe: 'Poitrine', materiel: 'Barre', niveau: 'Intermédiaire',
    muscles: ['Pectoraux inférieurs', 'Triceps'],
    description: 'Banc décliné, tête vers le bas. Cible le bas de la poitrine. Amplitude légèrement réduite mais forte activation des pectoraux inférieurs.' },
  { nom: 'Écarté couché', groupe: 'Poitrine', materiel: 'Haltères', niveau: 'Intermédiaire',
    muscles: ['Pectoraux', 'Deltoïdes antérieurs'],
    description: 'Isole les pectoraux. Bras légèrement fléchis, descendez les haltères en arc de cercle jusqu\'à sentir l\'étirement.' },
  { nom: 'Écarté incliné', groupe: 'Poitrine', materiel: 'Haltères', niveau: 'Intermédiaire',
    muscles: ['Pectoraux supérieurs', 'Deltoïdes antérieurs'],
    description: 'Même mouvement que l\'écarté couché sur banc incliné. Cible la partie haute et interne des pectoraux.' },
  { nom: 'Croisés câble', groupe: 'Poitrine', materiel: 'Câble', niveau: 'Intermédiaire',
    muscles: ['Pectoraux', 'Deltoïdes antérieurs'],
    description: 'Deux poulies hautes, croisez les bras devant vous en arc de cercle. Excellent pour l\'adduction et la contraction maximale des pectoraux.' },
  { nom: 'Pompes', groupe: 'Poitrine', materiel: 'Aucun', niveau: 'Débutant',
    muscles: ['Pectoraux', 'Triceps', 'Stabilisateurs'],
    description: 'Exercice au poids du corps. Mains légèrement plus larges que les épaules, corps gainé, descendez la poitrine jusqu\'au sol.' },
  { nom: 'Pompes diamant', groupe: 'Poitrine', materiel: 'Aucun', niveau: 'Intermédiaire',
    muscles: ['Pectoraux inférieurs', 'Triceps'],
    description: 'Mains en losange sous le sternum. Cible davantage les triceps et la partie interne de la poitrine.' },
  { nom: 'Pompes pieds surélevés', groupe: 'Poitrine', materiel: 'Aucun', niveau: 'Intermédiaire',
    muscles: ['Pectoraux supérieurs', 'Deltoïdes antérieurs', 'Triceps'],
    description: 'Pieds posés sur un banc ou une chaise. Incline le corps et cible le haut de la poitrine, similaire au développé incliné.' },
  { nom: 'Dips', groupe: 'Poitrine', materiel: 'Barre parallèle', niveau: 'Intermédiaire',
    muscles: ['Pectoraux inférieurs', 'Triceps'],
    description: 'Penchez le buste légèrement en avant pour cibler la poitrine. Descendez jusqu\'à ce que les épaules soient en dessous des coudes.' },
  { nom: 'Pull-over', groupe: 'Poitrine', materiel: 'Haltères', niveau: 'Intermédiaire',
    muscles: ['Pectoraux', 'Grand dorsal', 'Triceps'],
    description: 'Allongé perpendiculairement au banc, un haltère à deux mains. Descendez derrière la tête bras tendus, puis remontez. Travaille pectoraux et dorsaux.' },

  // ── Dos ───────────────────────────────────────────────────────────────
  { nom: 'Soulevé de terre', groupe: 'Dos', materiel: 'Barre', niveau: 'Avancé',
    muscles: ['Érecteurs spinaux', 'Trapèzes', 'Ischio-jambiers', 'Fessiers'],
    description: 'Roi des exercices de dos. Pieds écartés hanches, barre près des tibias, dos droit, poussez le sol pour monter.' },
  { nom: 'Tractions', groupe: 'Dos', materiel: 'Barre de traction', niveau: 'Intermédiaire',
    muscles: ['Grand dorsal', 'Biceps', 'Rhomboïdes'],
    description: 'Tirez votre corps vers la barre en contractant les dorsaux. Évitez de balancer. Descente lente et contrôlée.' },
  { nom: 'Tractions prise serrée', groupe: 'Dos', materiel: 'Barre de traction', niveau: 'Intermédiaire',
    muscles: ['Grand dorsal', 'Biceps'],
    description: 'Prise supination (paumes vers soi), mains à largeur d\'épaules. Cible davantage les biceps et la partie basse des dorsaux.' },
  { nom: 'Rowing barre', groupe: 'Dos', materiel: 'Barre', niveau: 'Intermédiaire',
    muscles: ['Dorsaux', 'Trapèzes', 'Rhomboïdes', 'Biceps'],
    description: 'Buste penché à 45°, tirez la barre vers le bas du ventre en serrant les omoplates.' },
  { nom: 'Rowing haltère unilatéral', groupe: 'Dos', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Grand dorsal', 'Rhomboïdes', 'Biceps'],
    description: 'Un genou et une main sur le banc, tirez l\'haltère vers la hanche. Excellent pour corriger les déséquilibres gauche/droite.' },
  { nom: 'Tirage vertical barre large', groupe: 'Dos', materiel: 'Câble', niveau: 'Débutant',
    muscles: ['Grand dorsal', 'Biceps', 'Rhomboïdes'],
    description: 'Assis à la machine de tirage, prise large pronation. Tirez la barre vers le haut de la poitrine en écartant les coudes.' },
  { nom: 'Tirage vertical prise neutre', groupe: 'Dos', materiel: 'Câble', niveau: 'Débutant',
    muscles: ['Grand dorsal', 'Biceps'],
    description: 'Prise neutre (paumes face à face), mains à largeur d\'épaules. Amplitude plus importante et meilleure activation des dorsaux.' },
  { nom: 'Tirage horizontal câble', groupe: 'Dos', materiel: 'Câble', niveau: 'Débutant',
    muscles: ['Dorsaux', 'Biceps', 'Rhomboïdes'],
    description: 'Assis face à la poulie basse, tirez la poignée vers le bas du ventre en gardant le dos droit.' },
  { nom: 'Rowing à la machine', groupe: 'Dos', materiel: 'Machine', niveau: 'Débutant',
    muscles: ['Dorsaux', 'Rhomboïdes', 'Biceps'],
    description: 'Machine de rowing guidée. Idéal pour les débutants. Tirez les poignées vers vous en serrant les omoplates.' },
  { nom: 'Shrugs barre', groupe: 'Dos', materiel: 'Barre', niveau: 'Débutant',
    muscles: ['Trapèzes'],
    description: 'Debout, barre en mains. Haussez les épaules le plus haut possible en contractant les trapèzes. Maintenez 1 seconde en haut.' },
  { nom: 'Shrugs haltères', groupe: 'Dos', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Trapèzes'],
    description: 'Même mouvement qu\'avec la barre, haltères sur les côtés. Permet une meilleure amplitude de mouvement.' },
  { nom: 'Face pull', groupe: 'Dos', materiel: 'Câble', niveau: 'Débutant',
    muscles: ['Deltoïdes postérieurs', 'Rhomboïdes', 'Trapèzes'],
    description: 'Poulie haute avec corde, tirez vers le visage en écartant les mains. Excellent pour la santé des épaules et les trapèzes moyens.' },
  { nom: 'Good morning', groupe: 'Dos', materiel: 'Barre', niveau: 'Intermédiaire',
    muscles: ['Érecteurs spinaux', 'Ischio-jambiers', 'Fessiers'],
    description: 'Barre sur les épaules, genoux légèrement fléchis. Penchez le buste en avant en maintenant le dos droit, remontez en contractant le bas du dos.' },

  // ── Épaules ──────────────────────────────────────────────────────────
  { nom: 'Développé militaire', groupe: 'Épaules', materiel: 'Barre', niveau: 'Intermédiaire',
    muscles: ['Deltoïdes', 'Triceps', 'Trapèzes'],
    description: 'Debout ou assis, poussez la barre au-dessus de la tête en gardant le gainage actif.' },
  { nom: 'Développé épaules haltères', groupe: 'Épaules', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Deltoïdes', 'Triceps'],
    description: 'Assis ou debout, poussez les haltères au-dessus de la tête. Plus grande liberté de mouvement qu\'avec la barre.' },
  { nom: 'Développé Arnold', groupe: 'Épaules', materiel: 'Haltères', niveau: 'Intermédiaire',
    muscles: ['Deltoïdes antérieurs', 'Deltoïdes latéraux', 'Triceps'],
    description: 'Démarrez avec les paumes vers vous, faites une rotation des avant-bras en montant. Cible les trois faisceaux du deltoïde.' },
  { nom: 'Élévations latérales', groupe: 'Épaules', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Deltoïdes latéraux'],
    description: 'Bras légèrement fléchis, montez les haltères sur les côtés jusqu\'à hauteur des épaules. Mouvement lent et contrôlé.' },
  { nom: 'Élévations latérales câble', groupe: 'Épaules', materiel: 'Câble', niveau: 'Débutant',
    muscles: ['Deltoïdes latéraux'],
    description: 'Même mouvement qu\'avec les haltères mais avec une tension constante grâce au câble. Supérieur pour la tension en bas du mouvement.' },
  { nom: 'Élévations frontales', groupe: 'Épaules', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Deltoïdes antérieurs'],
    description: 'Montez les haltères devant vous jusqu\'à hauteur des épaules. Évitez de balancer le dos.' },
  { nom: 'Oiseau', groupe: 'Épaules', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Deltoïdes postérieurs', 'Rhomboïdes'],
    description: 'Buste penché à 90°, bras légèrement fléchis, montez les haltères sur les côtés. Cible les deltoïdes postérieurs souvent négligés.' },
  { nom: 'Rowing menton', groupe: 'Épaules', materiel: 'Barre', niveau: 'Intermédiaire',
    muscles: ['Deltoïdes latéraux', 'Trapèzes', 'Biceps'],
    description: 'Prise étroite, tirez la barre vers le menton en élevant les coudes. Cible l\'ensemble des épaules et les trapèzes.' },

  // ── Biceps ────────────────────────────────────────────────────────────
  { nom: 'Curl biceps barre', groupe: 'Biceps', materiel: 'Barre', niveau: 'Débutant',
    muscles: ['Biceps brachial', 'Brachial'],
    description: 'Coudes fixes contre le corps, fléchissez les coudes pour monter la barre. Descente lente.' },
  { nom: 'Curl biceps haltères', groupe: 'Biceps', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Biceps brachial', 'Brachial'],
    description: 'Alternez ou simultané, fléchissez les coudes en supinant le poignet en haut du mouvement. Amplitude maximale.' },
  { nom: 'Hammer curl', groupe: 'Biceps', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Biceps', 'Brachioradial'],
    description: 'Prise neutre (pouces vers le haut), même mouvement que le curl. Travaille davantage le brachioradial.' },
  { nom: 'Curl barre EZ', groupe: 'Biceps', materiel: 'Barre EZ', niveau: 'Débutant',
    muscles: ['Biceps brachial', 'Brachioradial'],
    description: 'La prise angled de la barre EZ réduit la contrainte sur les poignets. Mouvement identique au curl barre.' },
  { nom: 'Curl incliné', groupe: 'Biceps', materiel: 'Haltères', niveau: 'Intermédiaire',
    muscles: ['Biceps brachial'],
    description: 'Assis sur un banc incliné, les bras pendent librement. Étire le biceps en bas et maximise l\'activation sur toute l\'amplitude.' },
  { nom: 'Curl concentration', groupe: 'Biceps', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Biceps brachial'],
    description: 'Assis, coude contre la cuisse interne. Curl lent et complet. Excellent isolateur pour le pic du biceps.' },
  { nom: 'Curl câble basse poulie', groupe: 'Biceps', materiel: 'Câble', niveau: 'Débutant',
    muscles: ['Biceps brachial', 'Brachial'],
    description: 'Tension constante sur toute l\'amplitude grâce au câble. Peut être réalisé unilatéralement pour plus d\'isolation.' },
  { nom: 'Curl marteau câble', groupe: 'Biceps', materiel: 'Câble', niveau: 'Débutant',
    muscles: ['Biceps', 'Brachioradial'],
    description: 'Même mouvement que le hammer curl avec tension constante. Utilisez la corde pour une prise neutre.' },

  // ── Triceps ──────────────────────────────────────────────────────────
  { nom: 'Triceps poulie haute', groupe: 'Triceps', materiel: 'Câble', niveau: 'Débutant',
    muscles: ['Triceps'],
    description: 'Coudes fixes, poussez la corde ou la barre vers le bas en contractant les triceps.' },
  { nom: 'Triceps corde poulie haute', groupe: 'Triceps', materiel: 'Câble', niveau: 'Débutant',
    muscles: ['Triceps'],
    description: 'Avec la corde, écartez les mains en bas du mouvement pour une contraction maximale. Les coudes restent fixes.' },
  { nom: 'Skull crushers', groupe: 'Triceps', materiel: 'Barre EZ', niveau: 'Intermédiaire',
    muscles: ['Triceps long'],
    description: 'Allongé sur le banc, barre EZ en mains, fléchissez les coudes pour descendre la barre vers le front.' },
  { nom: 'Extensions triceps haltère', groupe: 'Triceps', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Triceps long'],
    description: 'Debout ou assis, un haltère à deux mains au-dessus de la tête. Fléchissez les coudes derrière la tête puis étendez. Travaille le chef long.' },
  { nom: 'Extensions triceps haltère couché', groupe: 'Triceps', materiel: 'Haltères', niveau: 'Intermédiaire',
    muscles: ['Triceps long', 'Triceps'],
    description: 'Allongé sur le banc, haltères en mains bras tendus vers le haut. Fléchissez les coudes pour descendre les haltères de chaque côté de la tête.' },
  { nom: 'Dips triceps', groupe: 'Triceps', materiel: 'Barre parallèle', niveau: 'Intermédiaire',
    muscles: ['Triceps', 'Pectoraux inférieurs'],
    description: 'Corps vertical (ne pas se pencher en avant). Descente et montée contrôlées. Cible principalement les triceps.' },
  { nom: 'Développé couché prise serrée', groupe: 'Triceps', materiel: 'Barre', niveau: 'Intermédiaire',
    muscles: ['Triceps', 'Pectoraux'],
    description: 'Prise à largeur d\'épaules sur la barre. Même mouvement que le développé couché mais en ciblant massivement les triceps.' },
  { nom: 'Kickback triceps', groupe: 'Triceps', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Triceps'],
    description: 'Buste penché à 90°, coude fixe à hauteur du dos. Étendez l\'avant-bras vers l\'arrière. Isolation complète du triceps.' },

  // ── Jambes ───────────────────────────────────────────────────────────
  { nom: 'Squat', groupe: 'Jambes', materiel: 'Barre', niveau: 'Intermédiaire',
    muscles: ['Quadriceps', 'Fessiers', 'Ischio-jambiers'],
    description: 'Roi des exercices jambes. Barre en position haute, pieds écartés légèrement plus que les hanches, descendez jusqu\'à ce que les cuisses soient parallèles au sol.' },
  { nom: 'Squat gobelet', groupe: 'Jambes', materiel: 'Kettlebell', niveau: 'Débutant',
    muscles: ['Quadriceps', 'Fessiers'],
    description: 'Kettlebell tenu à deux mains devant la poitrine. Parfait pour apprendre la technique du squat avec le buste vertical.' },
  { nom: 'Squat bulgare', groupe: 'Jambes', materiel: 'Haltères', niveau: 'Intermédiaire',
    muscles: ['Quadriceps', 'Fessiers', 'Ischio-jambiers'],
    description: 'Pied arrière sur un banc, pied avant avancé. Descendez le genou arrière vers le sol. Excellent pour la force unilatérale et les fessiers.' },
  { nom: 'Hack squat', groupe: 'Jambes', materiel: 'Machine', niveau: 'Intermédiaire',
    muscles: ['Quadriceps', 'Fessiers'],
    description: 'Machine inclinée, dos appuyé sur le dossier. Pieds hauts pour cibler les fessiers, pieds bas pour les quadriceps.' },
  { nom: 'Leg press', groupe: 'Jambes', materiel: 'Machine', niveau: 'Débutant',
    muscles: ['Quadriceps', 'Fessiers'],
    description: 'Poussez la plateforme en extension complète sans verrouiller les genoux. Position des pieds varie le ciblage musculaire.' },
  { nom: 'Leg extension', groupe: 'Jambes', materiel: 'Machine', niveau: 'Débutant',
    muscles: ['Quadriceps'],
    description: 'Assis à la machine, étendez les jambes jusqu\'à la quasi-extension. Isolation pure des quadriceps.' },
  { nom: 'Leg curl couché', groupe: 'Jambes', materiel: 'Machine', niveau: 'Débutant',
    muscles: ['Ischio-jambiers'],
    description: 'Allongé sur la machine, fléchissez les genoux pour ramener les talons vers les fessiers. Isolation des ischio-jambiers.' },
  { nom: 'Leg curl assis', groupe: 'Jambes', materiel: 'Machine', niveau: 'Débutant',
    muscles: ['Ischio-jambiers'],
    description: 'Assis à la machine, fléchissez les genoux. La position assise étire le chef court du biceps fémoral.' },
  { nom: 'Fentes', groupe: 'Jambes', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Quadriceps', 'Fessiers', 'Ischio-jambiers'],
    description: 'Avancez un pied, fléchissez les deux genoux. Le genou avant ne dépasse pas le pied.' },
  { nom: 'Fentes marchées', groupe: 'Jambes', materiel: 'Haltères', niveau: 'Intermédiaire',
    muscles: ['Quadriceps', 'Fessiers', 'Ischio-jambiers'],
    description: 'Fentes en avançant continuellement. Plus exigeant pour l\'équilibre et la coordination. Excellent pour la mobilité des hanches.' },
  { nom: 'Soulevé de terre roumain', groupe: 'Jambes', materiel: 'Barre', niveau: 'Intermédiaire',
    muscles: ['Ischio-jambiers', 'Fessiers', 'Érecteurs spinaux'],
    description: 'Pieds à hanches, penchez le buste en gardant les jambes quasi-tendues. Sentez l\'étirement des ischios.' },
  { nom: 'Soulevé de terre jambes tendues haltères', groupe: 'Jambes', materiel: 'Haltères', niveau: 'Intermédiaire',
    muscles: ['Ischio-jambiers', 'Fessiers'],
    description: 'Même pattern que le roumain mais aux haltères, permettant plus de liberté de mouvement et une meilleure conscience musculaire.' },
  { nom: 'Hip thrust', groupe: 'Jambes', materiel: 'Barre', niveau: 'Débutant',
    muscles: ['Fessiers', 'Ischio-jambiers'],
    description: 'Dos appuyé sur un banc, barre sur le bassin. Poussez les hanches vers le haut en contractant les fessiers.' },
  { nom: 'Hip thrust machine', groupe: 'Jambes', materiel: 'Machine', niveau: 'Débutant',
    muscles: ['Fessiers', 'Ischio-jambiers'],
    description: 'Version machine du hip thrust. Plus simple à installer, permet de se concentrer sur la contraction des fessiers.' },
  { nom: 'Abducteur machine', groupe: 'Jambes', materiel: 'Machine', niveau: 'Débutant',
    muscles: ['Fessiers', 'Abducteurs'],
    description: 'Assis à la machine, poussez les genoux vers l\'extérieur contre la résistance. Cible le moyen fessier.' },
  { nom: 'Step up', groupe: 'Jambes', materiel: 'Haltères', niveau: 'Débutant',
    muscles: ['Quadriceps', 'Fessiers'],
    description: 'Montez sur un banc ou une boite en poussant sur le pied avant. Alterez les jambes. Travaille l\'équilibre et la force unijambiste.' },
  { nom: 'Mollets debout', groupe: 'Jambes', materiel: 'Machine', niveau: 'Débutant',
    muscles: ['Gastrocnémiens', 'Soléaire'],
    description: 'Montez sur la pointe des pieds avec amplitude complète. Descente lente pour un étirement maximal.' },
  { nom: 'Mollets assis', groupe: 'Jambes', materiel: 'Machine', niveau: 'Débutant',
    muscles: ['Soléaire', 'Gastrocnémiens'],
    description: 'Assis à la machine mollets. La flexion du genou isole le soléaire, muscle profond du mollet.' },
  { nom: 'Mollets leg press', groupe: 'Jambes', materiel: 'Machine', niveau: 'Débutant',
    muscles: ['Gastrocnémiens', 'Soléaire'],
    description: 'En fin de leg press, poussez la plateforme avec les orteils uniquement. Permet une lourde charge sur les mollets.' },

  // ── Abdominaux ────────────────────────────────────────────────────────
  { nom: 'Crunchs', groupe: 'Abdominaux', materiel: 'Aucun', niveau: 'Débutant',
    muscles: ['Grand droit de l\'abdomen'],
    description: 'Contractez les abdos pour lever les épaules du sol. Ne tirez pas sur la nuque.' },
  { nom: 'Crunchs à la poulie', groupe: 'Abdominaux', materiel: 'Câble', niveau: 'Débutant',
    muscles: ['Grand droit de l\'abdomen'],
    description: 'À genoux face à la poulie haute, corde derrière la nuque. Enroulez le buste vers le bas. Permet de charger les abdominaux.' },
  { nom: 'Planche', groupe: 'Abdominaux', materiel: 'Aucun', niveau: 'Débutant',
    muscles: ['Transverse', 'Grand droit', 'Stabilisateurs'], type_metrique: 'isometrique',
    description: 'Corps aligné de la tête aux talons, abdos et fessiers contractés. Tenez la position.' },
  { nom: 'Planche latérale', groupe: 'Abdominaux', materiel: 'Aucun', niveau: 'Débutant',
    muscles: ['Obliques', 'Transverse'], type_metrique: 'isometrique',
    description: 'Appuyé sur un coude et le côté du pied, corps aligné. Cible intensément les obliques et le transverse.' },
  { nom: 'Relevés de jambes', groupe: 'Abdominaux', materiel: 'Barre de traction', niveau: 'Intermédiaire',
    muscles: ['Abdominaux inférieurs', 'Fléchisseurs de hanche'],
    description: 'Suspendu à la barre, montez les jambes tendues ou genoux vers la poitrine en contractant les abdos.' },
  { nom: 'Russian twist', groupe: 'Abdominaux', materiel: 'Aucun', niveau: 'Débutant',
    muscles: ['Obliques', 'Grand droit'],
    description: 'Assis, pieds levés ou au sol, faites pivoter le buste de gauche à droite. Ajoutez un poids pour augmenter la difficulté.' },
  { nom: 'Mountain climbers', groupe: 'Abdominaux', materiel: 'Aucun', niveau: 'Débutant',
    muscles: ['Abdominaux inférieurs', 'Transverse', 'Fléchisseurs de hanche'],
    description: 'Position de pompe, ramenez alternativement les genoux vers la poitrine rapidement. Cardio et gainage combinés.' },
  { nom: 'Roue abdominale', groupe: 'Abdominaux', materiel: 'Aucun', niveau: 'Avancé',
    muscles: ['Grand droit de l\'abdomen', 'Transverse', 'Érecteurs spinaux'],
    description: 'À genoux, roulez la roue devant vous en maintenant le gainage. Remontez en contractant les abdos. Exercice très exigeant.' },
  { nom: 'Relevés de buste machine', groupe: 'Abdominaux', materiel: 'Machine', niveau: 'Débutant',
    muscles: ['Grand droit de l\'abdomen'],
    description: 'Machine à abdominaux. Enroulez le buste contre la résistance. Permet de progresser en charge sur les abdominaux.' },
  { nom: 'Leg raises sol', groupe: 'Abdominaux', materiel: 'Aucun', niveau: 'Débutant',
    muscles: ['Abdominaux inférieurs', 'Fléchisseurs de hanche'],
    description: 'Allongé sur le dos, jambes tendues. Montez les jambes à 90° puis redescendez lentement sans poser les talons.' },

  // ── Cardio ───────────────────────────────────────────────────────────
  { nom: 'Marche', groupe: 'Cardio', materiel: 'Tapis', niveau: 'Débutant',
    muscles: ['Cardio-vasculaire', 'Jambes'], type_metrique: 'cardio_basique',
    description: 'Marche à allure modérée, sur tapis ou en extérieur. Idéal pour la récupération active et l\'endurance de base.' },
  { nom: 'Course à pied', groupe: 'Cardio', materiel: 'Tapis', niveau: 'Intermédiaire',
    muscles: ['Cardio-vasculaire', 'Quadriceps', 'Mollets'], type_metrique: 'cardio_basique',
    description: 'Course sur tapis ou en extérieur. Travaille l\'endurance cardio-vasculaire et le bas du corps.' },
  { nom: 'Vélo stationnaire', groupe: 'Cardio', materiel: 'Vélo', niveau: 'Débutant',
    muscles: ['Cardio-vasculaire', 'Quadriceps', 'Ischio-jambiers'], type_metrique: 'cardio_machine',
    description: 'Pédalage assis à résistance réglable. Faible impact sur les articulations, bon pour la récupération active.' },
  { nom: 'Vélo elliptique', groupe: 'Cardio', materiel: 'Elliptique', niveau: 'Débutant',
    muscles: ['Cardio-vasculaire', 'Jambes', 'Bras'], type_metrique: 'cardio_machine',
    description: 'Mouvement elliptique combinant haut et bas du corps. Sans impact, sollicite l\'ensemble du corps.' },
  { nom: 'Rameur', groupe: 'Cardio', materiel: 'Rameur', niveau: 'Intermédiaire',
    muscles: ['Cardio-vasculaire', 'Dorsaux', 'Jambes', 'Biceps'], type_metrique: 'cardio_machine',
    description: 'Mouvement de tirage complet : jambes, dos puis bras. Excellent exercice cardio combiné au renforcement musculaire.' },
  { nom: 'Escaliers', groupe: 'Cardio', materiel: 'StepMill', niveau: 'Intermédiaire',
    muscles: ['Cardio-vasculaire', 'Quadriceps', 'Fessiers', 'Mollets'], type_metrique: 'cardio_machine',
    description: 'Montée d\'escaliers en continu, sur machine StepMill ou en extérieur. Très exigeant pour le cardio et les jambes.' },
  { nom: 'Corde à sauter', groupe: 'Cardio', materiel: 'Corde', niveau: 'Débutant',
    muscles: ['Cardio-vasculaire', 'Mollets', 'Épaules'], type_metrique: 'isometrique',
    description: 'Sauts à la corde en continu. Excellent pour la coordination, l\'endurance et l\'explosivité des mollets.' },
];

const GROUPES_BASE = [...new Set(EXERCICES.map(e => e.groupe))];

// ── Chargement des exercices custom (Supabase) ────────────────────────

let _customCache = null;

async function _loadCustom() {
  try {
    const { data } = await supabase
      .from('exercices_custom')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });
    _customCache = (data ?? []).map(e => ({ ...e, custom: true }));
  } catch {
    _customCache = [];
  }
  return _customCache;
}

// ── Page Exercices ────────────────────────────────────────────────────

let _section    = null;
let _activeTab  = 'tous';
let _allExos    = [];

export async function loadExercices(section) {
  _section   = section;
  _activeTab = 'tous';

  section.innerHTML = `
    <div class="tabs" id="exo-page-tabs">
      <button class="tab active" data-tab="tous">Tous</button>
      <button class="tab" data-tab="mes">Mes exercices</button>
    </div>
    <div id="exo-page-content"></div>`;

  section.querySelectorAll('#exo-page-tabs .tab').forEach(t => {
    t.addEventListener('click', () => {
      section.querySelectorAll('#exo-page-tabs .tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      _activeTab = t.dataset.tab;
      _activeTab === 'tous' ? _renderTous() : _renderMes();
    });
  });

  await _renderTous();
}

// ── Onglet Tous ───────────────────────────────────────────────────────

async function _renderTous() {
  const content = _section.querySelector('#exo-page-content');
  content.innerHTML = `
    <div class="search-bar">
      <div class="search-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>
      <input class="search-input" id="exo-search" placeholder="Rechercher un exercice…" type="search" autocomplete="off">
    </div>
    <div class="filter-chips" id="filter-chips">
      <div class="chip active" data-groupe="Tous">Tous</div>
      ${GROUPES_BASE.map(g => `<div class="chip" data-groupe="${g}">${g}</div>`).join('')}
    </div>
    <div id="exo-list" class="item-list"></div>`;

  const custom = await _loadCustom();
  _allExos = [...EXERCICES, ...custom];

  let activeGroupe = 'Tous';
  let searchTerm   = '';

  const render = () => {
    const filtered = _allExos.filter(e => {
      const matchG = activeGroupe === 'Tous' || e.groupe === activeGroupe;
      const q      = searchTerm;
      const matchS = !q || e.nom.toLowerCase().includes(q)
                       || (e.muscles ?? []).some(m => m.toLowerCase().includes(q));
      return matchG && matchS;
    });

    const list = content.querySelector('#exo-list');
    if (!filtered.length) {
      list.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-8);font-size:var(--font-size-sm)">Aucun exercice trouvé</p>`;
      return;
    }
    list.innerHTML = filtered.map((e, i) => _exoItem(e, i, filtered)).join('');
    list.querySelectorAll('[data-exo-idx]').forEach(item => {
      item.addEventListener('click', () => openExoDetail(filtered[parseInt(item.dataset.exoIdx)]));
    });
    _loadListImages(list);
  };

  content.querySelector('#filter-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    content.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeGroupe = chip.dataset.groupe;
    render();
  });

  content.querySelector('#exo-search').addEventListener('input', debounce(e => {
    searchTerm = e.target.value.toLowerCase().trim();
    render();
  }, 200));

  render();
}

// ── Onglet Mes exercices ──────────────────────────────────────────────

async function _renderMes() {
  const content = _section.querySelector('#exo-page-content');
  content.innerHTML = `
    <div style="margin-bottom:var(--space-4)">
      <button class="btn btn-primary btn-full" id="btn-new-exo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
          style="width:18px;height:18px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Créer un exercice
      </button>
    </div>
    <div id="custom-exo-list" class="item-list">
      <div class="skeleton skeleton-card" style="margin-bottom:8px"></div>
      <div class="skeleton skeleton-card"></div>
    </div>`;

  content.querySelector('#btn-new-exo').addEventListener('click', () => _openCreateModal());

  const custom = await _loadCustom();
  const list   = content.querySelector('#custom-exo-list');

  if (!custom.length) {
    list.innerHTML = emptyState(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="18" y2="12"/><rect x="2" y="9" width="4" height="6" rx="1.5"/><rect x="18" y="9" width="4" height="6" rx="1.5"/></svg>`,
      'Aucun exercice custom',
      'Créez des exercices personnalisés pour les retrouver dans vos séances.', null, null
    );
    return;
  }

  list.innerHTML = custom.map((e, i) => _exoItem(e, i, custom, true)).join('');
  _loadListImages(list);

  list.querySelectorAll('[data-exo-idx]').forEach(item => {
    item.addEventListener('click', () => openExoDetail(custom[parseInt(item.dataset.exoIdx)]));
  });
  list.querySelectorAll('[data-delete-exo]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _deleteCustom(btn.dataset.deleteExo);
    });
  });
  list.querySelectorAll('[data-edit-exo]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const exo = custom.find(c => String(c.id) === btn.dataset.editExo);
      if (exo) openCreateExerciceModal('', null, exo);
    });
  });
}

// ── HTML item exercice ────────────────────────────────────────────────

const _THUMB_FALLBACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
  stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px;color:var(--text-muted)">
  <line x1="6" y1="12" x2="18" y2="12"/><rect x="2" y="9" width="4" height="6" rx="1.5"/><rect x="18" y="9" width="4" height="6" rx="1.5"/>
</svg>`;

function _exoItem(e, i, list, showDelete = false) {
  return `
    <div class="list-item clickable" data-exo-idx="${i}" style="align-items:center">
      <div class="exo-thumb" data-img-nom="${e.nom}"
        style="width:58px;height:58px;min-width:58px;border-radius:10px;overflow:hidden;
          background:var(--surface-3);display:flex;align-items:center;justify-content:center">
        ${_THUMB_FALLBACK}
      </div>
      <div class="item-body">
        <div style="display:flex;align-items:center;gap:var(--space-2)">
          <p class="item-title">${e.nom}</p>
          ${e.custom ? `<span class="badge badge-primary" style="font-size:10px;padding:1px 6px">Custom</span>` : ''}
        </div>
        <p class="item-subtitle">${e.groupe} • ${e.materiel}</p>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:var(--space-2)">
          ${(e.muscles ?? []).slice(0, 3).map(m => `<span class="muscle-tag">${m}</span>`).join('')}
        </div>
      </div>
      ${showDelete
        ? `<div style="display:flex;gap:4px;flex-shrink:0">
             <button class="icon-btn" data-edit-exo="${e.id}" style="flex-shrink:0">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                 <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
               </svg>
             </button>
             <button class="icon-btn" data-delete-exo="${e.id}" style="color:var(--color-error);flex-shrink:0">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                 <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
               </svg>
             </button>
           </div>`
        : `<span class="badge badge-muted" style="flex-shrink:0">${e.niveau ?? ''}</span>`
      }
    </div>`;
}

function _loadListImages(container) {
  container.querySelectorAll('.exo-thumb[data-img-nom]').forEach(el => {
    const nom = el.dataset.imgNom;
    fetchExerciseImage(nom).then(url => {
      if (!el.isConnected || !url) return;
      el.innerHTML = `<img src="${url}" alt="${nom}"
        style="width:100%;height:100%;object-fit:cover;display:block"
        onerror="this.parentElement.innerHTML='${_THUMB_FALLBACK.replace(/"/g, "'")}'">`;
    });
  });
}

// ── Détail exercice ───────────────────────────────────────────────────

export function openExoDetail(exo) {
  openModal({
    title: exo.nom,
    body: `
      <div style="display:flex;flex-direction:column;gap:var(--space-4)">

        <!-- Illustration -->
        <div id="exo-gif-wrap" style="border-radius:10px;overflow:hidden;background:var(--surface-2);
          min-height:180px;display:flex;align-items:center;justify-content:center">
          <div id="exo-gif-inner" style="width:100%;text-align:center;padding:16px">
            <div class="skeleton" style="width:100%;height:180px;border-radius:8px"></div>
          </div>
        </div>

        <!-- Badges -->
        <div style="display:flex;gap:var(--space-2);flex-wrap:wrap">
          <span class="badge badge-primary">${exo.groupe}</span>
          <span class="badge badge-muted">${exo.materiel}</span>
          ${exo.niveau ? `<span class="badge badge-muted">${exo.niveau}</span>` : ''}
          ${exo.custom ? `<span class="badge badge-primary">Custom</span>` : ''}
        </div>

        <!-- Muscles -->
        ${(exo.muscles ?? []).length ? `
        <div>
          <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
            color:var(--text-muted);margin-bottom:var(--space-2)">Muscles ciblés</p>
          <div style="display:flex;gap:var(--space-2);flex-wrap:wrap">
            ${exo.muscles.map(m => `<span class="muscle-tag">${m}</span>`).join('')}
          </div>
        </div>` : ''}

        <!-- Description -->
        ${exo.description ? `
        <div>
          <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
            color:var(--text-muted);margin-bottom:var(--space-2)">Description</p>
          <p style="font-size:var(--font-size-sm);color:var(--text-secondary);line-height:1.7">${exo.description}</p>
        </div>` : ''}

        <!-- Progression -->
        <div>
          <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
            color:var(--text-muted);margin-bottom:var(--space-2)">Progression</p>
          <div id="exo-progression">
            <div class="skeleton skeleton-card" style="height:140px;margin-bottom:8px"></div>
            <div class="skeleton skeleton-card" style="height:140px"></div>
          </div>
        </div>
      </div>`,
  });

  setTimeout(() => _loadGif(exo), 80);
  setTimeout(() => _loadProgression(exo), 80);
}

function _progressionBaselineKey(exoNom) {
  return `esse_prog_baseline_${currentUser.id}_${exoNom}`;
}

async function _loadProgression(exo) {
  const wrap = document.getElementById('exo-progression');
  if (!wrap) return;

  try {
    const { data: series, error } = await supabase
      .from('series')
      .select('poids_kg, repetitions, created_at, seance_id')
      .eq('user_id', currentUser.id)
      .eq('exercice_nom', exo.nom)
      .not('poids_kg', 'is', null)
      .not('repetitions', 'is', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    if (!wrap.isConnected) return;

    if (!series?.length) {
      wrap.innerHTML = `<p style="color:var(--text-muted);font-size:var(--font-size-sm);text-align:center;padding:var(--space-4) 0">Aucune donnée enregistrée pour cet exercice.</p>`;
      return;
    }

    // Regrouper par séance (et non par jour calendaire) → meilleur 1RM et
    // poids max par séance, sinon deux séances le même jour s'écrasent en
    // un seul point et la progression entre les deux disparaît.
    const bySeance = {};
    for (const s of series) {
      const key = s.seance_id;
      const orm = calc1RM(s.poids_kg, s.repetitions);
      if (!bySeance[key]) bySeance[key] = { date: s.created_at, orm: 0, poids: 0 };
      if (s.created_at < bySeance[key].date) bySeance[key].date = s.created_at;
      if (orm > bySeance[key].orm)         bySeance[key].orm   = orm;
      if (s.poids_kg > bySeance[key].poids) bySeance[key].poids = s.poids_kg;
    }
    const points = Object.values(bySeance).sort((a, b) => a.date.localeCompare(b.date));

    const baselineDate = lsGet(_progressionBaselineKey(exo.nom));
    const basePoint = baselineDate
      ? (points.find(p => p.date >= baselineDate) ?? points.at(-1))
      : points[0];
    const lastPoint   = points.at(-1);
    const deltaPoids  = lastPoint.poids - basePoint.poids;

    wrap.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--space-4)">
        <div class="card" style="padding:var(--space-4)">
          <p class="card-title" style="margin-bottom:var(--space-3)">1RM estimé dans le temps</p>
          ${svgLineChart(points.map(p => ({ x: new Date(p.date).getTime(), y: p.orm })))}
        </div>
        <div class="card" style="padding:var(--space-4)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-3)">
            <p class="card-title">Poids soulevé dans le temps</p>
            <button class="section-link" id="exo-prog-reset" style="font-size:11px">Réinitialiser</button>
          </div>
          ${svgLineChart(points.map(p => ({ x: new Date(p.date).getTime(), y: p.poids })), { color: 'var(--color-success)' })}
          <p style="font-size:var(--font-size-sm);margin-top:var(--space-3);font-weight:700;
            color:${deltaPoids >= 0 ? 'var(--color-success)' : 'var(--color-error)'}">
            ${deltaPoids >= 0 ? '+' : ''}${deltaPoids} kg depuis ${formatDate(basePoint.date)}
          </p>
        </div>
      </div>`;

    wrap.querySelector('#exo-prog-reset')?.addEventListener('click', () => {
      lsSet(_progressionBaselineKey(exo.nom), todayStr());
      _loadProgression(exo);
    });
  } catch {
    if (wrap.isConnected) {
      wrap.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:var(--space-4)">Erreur de chargement</p>`;
    }
  }
}

async function _loadGif(exo) {
  const wrap = document.getElementById('exo-gif-inner');
  if (!wrap) return;
  const url = await fetchExerciseImage(exo.nom);
  if (!wrap.isConnected) return;
  if (url) {
    wrap.innerHTML = `
      <img src="${url}" alt="${exo.nom}"
        onload="this.style.opacity='1'"
        style="width:100%;max-height:280px;object-fit:contain;border-radius:8px;display:block;opacity:0;transition:opacity .3s">`;
  } else {
    wrap.innerHTML = `
      <p style="font-size:.8rem;color:var(--text-muted);padding:20px;text-align:center">
        Illustration non disponible pour cet exercice
      </p>`;
  }
}

// ── Créer un exercice custom ──────────────────────────────────────────
// Exporté pour que d'autres flux de création rapide (routine-builder,
// séance en cours) ouvrent le même formulaire complet au lieu d'ajouter
// un nom brut qui ne serait jamais retrouvable dans la bibliothèque.

const MUSCLE_CATEGORIES = {
  'Poitrine':   ['Pectoraux', 'Pectoraux supérieurs', 'Pectoraux inférieurs'],
  'Dos':        ['Grand dorsal', 'Dorsaux', 'Trapèzes', 'Rhomboïdes', 'Érecteurs spinaux'],
  'Épaules':    ['Épaules', 'Deltoïdes', 'Deltoïdes antérieurs', 'Deltoïdes latéraux', 'Deltoïdes postérieurs'],
  'Bras':       ['Biceps', 'Biceps brachial', 'Brachial', 'Brachioradial', 'Triceps', 'Triceps long', 'Bras'],
  'Abdominaux': ["Grand droit de l'abdomen", 'Grand droit', 'Transverse', 'Obliques', 'Abdominaux inférieurs'],
  'Jambes':     ['Quadriceps', 'Ischio-jambiers', 'Fessiers', 'Abducteurs', 'Adducteurs', 'Fléchisseurs de hanche', 'Mollets', 'Gastrocnémiens', 'Soléaire', 'Jambes'],
  'Autres':     ['Stabilisateurs', 'Cardio-vasculaire'],
};

let _selectedMuscles = new Set();

function _muscleTagPickerHTML(preselected = []) {
  _selectedMuscles = new Set(preselected);
  return `
    <div id="ce-muscles-picker" style="display:flex;flex-direction:column;gap:var(--space-3)">
      ${Object.entries(MUSCLE_CATEGORIES).map(([cat, muscles]) => `
        <div>
          <p style="font-size:var(--font-size-xs);font-weight:700;color:var(--text-muted);margin-bottom:var(--space-2)">${cat}</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${muscles.map(m => `<div class="chip ${_selectedMuscles.has(m) ? 'active' : ''}" data-muscle="${_esc(m)}">${m}</div>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

function _bindMuscleTagPicker() {
  document.getElementById('ce-muscles-picker')?.addEventListener('click', e => {
    const chip = e.target.closest('[data-muscle]');
    if (!chip) return;
    const m = chip.dataset.muscle;
    if (_selectedMuscles.has(m)) { _selectedMuscles.delete(m); chip.classList.remove('active'); }
    else { _selectedMuscles.add(m); chip.classList.add('active'); }
  });
}

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

export function openCreateExerciceModal(prefillNom = '', onCreated = null, editExo = null) {
  const GROUPES_ALL = [...GROUPES_BASE, 'Cardio', 'Mobilité', 'Autre'];
  const typeMetriqueVal = editExo?.type_metrique || DEFAULT_METRIC_TYPE;

  openModal({
    title: editExo ? 'Modifier l\'exercice' : 'Nouvel exercice',
    body: `
      <div style="display:flex;flex-direction:column;gap:var(--space-4)">
        <div class="form-group">
          <label class="form-label">Nom de l'exercice *</label>
          <input class="form-input" id="ce-nom" type="text" placeholder="ex: Curl marteau unilatéral" autocomplete="off" value="${_esc(editExo?.nom ?? prefillNom)}">
        </div>
        <div class="form-group">
          <label class="form-label">Groupe musculaire *</label>
          <select class="form-select" id="ce-groupe">
            ${GROUPES_ALL.map(g => `<option value="${g}" ${g === editExo?.groupe ? 'selected' : ''}>${g}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Matériel</label>
          <input class="form-input" id="ce-materiel" type="text" placeholder="ex: Haltères, Câble, Machine…" value="${_esc(editExo?.materiel ?? 'Aucun')}">
        </div>
        <div class="form-group">
          <label class="form-label">Type de saisie *</label>
          <select class="form-select" id="ce-type-metrique">
            ${Object.entries(METRIC_TYPES).map(([key, t]) =>
              `<option value="${key}" ${key === typeMetriqueVal ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Muscles ciblés</label>
          ${_muscleTagPickerHTML(editExo?.muscles ?? [])}
        </div>
        <div class="form-group">
          <label class="form-label">Description (facultatif)</label>
          <textarea class="form-input form-textarea" id="ce-desc" rows="3" placeholder="Consignes techniques…">${_esc(editExo?.description ?? '')}</textarea>
        </div>
      </div>`,
    footer: `
      <button class="btn btn-secondary" id="ce-cancel">Annuler</button>
      <button class="btn btn-primary" id="ce-save" style="flex:1">${editExo ? 'Enregistrer' : 'Créer l\'exercice'}</button>`,
  });

  setTimeout(() => { const i = document.getElementById('ce-nom'); if (i) { i.focus(); if (prefillNom) i.select(); } }, 80);
  _bindMuscleTagPicker();
  document.getElementById('ce-cancel')?.addEventListener('click', closeModal);
  document.getElementById('ce-save')?.addEventListener('click', () => _saveCustom(onCreated, editExo));
}

function _openCreateModal() {
  openCreateExerciceModal();
}

async function _saveCustom(onCreated, editExo = null) {
  const nom      = document.getElementById('ce-nom')?.value.trim();
  const groupe   = document.getElementById('ce-groupe')?.value;
  const materiel = document.getElementById('ce-materiel')?.value.trim() || 'Aucun';
  const typeMetrique = document.getElementById('ce-type-metrique')?.value || DEFAULT_METRIC_TYPE;
  const muscles  = [..._selectedMuscles];
  const desc     = document.getElementById('ce-desc')?.value.trim();

  if (!nom) { showToast('Entrez un nom d\'exercice', 'warning'); return; }

  showLoading();
  try {
    const payload = {
      nom, groupe, materiel, muscles, description: desc || null,
      type_metrique: typeMetrique,
    };

    const { data, error } = editExo
      ? await supabase.from('exercices_custom').update(payload).eq('id', editExo.id).select().single()
      : await supabase.from('exercices_custom').insert({ ...payload, user_id: currentUser.id }).select().single();
    if (error) throw error;
    _customCache = null;
    closeModal();
    showToast(editExo ? `"${nom}" mis à jour` : `"${nom}" ajouté à vos exercices`, 'success');
    if (onCreated) {
      onCreated({ ...data, custom: true });
    } else {
      _activeTab = 'mes';
      _section?.querySelector('[data-tab="mes"]')?.click();
    }
  } catch {
    showToast(editExo ? 'Erreur lors de la modification' : 'Erreur lors de la création', 'error');
  } finally {
    hideLoading();
  }
}

async function _deleteCustom(id) {
  if (!await confirmDialog('Supprimer cet exercice ?')) return;
  try {
    await supabase.from('exercices_custom').delete().eq('id', id);
    _customCache = null;
    showToast('Exercice supprimé', 'success');
    _renderMes();
  } catch {
    showToast('Erreur lors de la suppression', 'error');
  }
}

// ── Export pour le picker de séance ──────────────────────────────────

export async function getAllExercices() {
  const custom = _customCache ?? await _loadCustom();
  return [...EXERCICES, ...custom];
}
