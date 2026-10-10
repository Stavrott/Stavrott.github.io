-- Forme · refonte Pulse : jours prévus, rappels et records du jour.
-- À exécuter une fois dans Supabase (SQL Editor). Sans risque si relancé.

-- Jours d'entraînement prévus (0 = lundi … 6 = dimanche) et heure du
-- rappel (« 08:30 » ; null = pas de rappel).
alter table public.profils
  add column if not exists jours_prevus smallint[] not null default '{}',
  add column if not exists rappel_heure text;

-- Records battus pendant la séance : [{ exercice, poids, reps, type }].
-- Sert à marquer les jours de record dans le calendrier des stats.
alter table public.seances
  add column if not exists records jsonb;

-- Les rappels sont remplacés en bloc par l'utilisateur : index pour
-- retrouver vite ses notifications encore en attente.
create index if not exists push_pending_user_pending_idx
  on public.push_pending (user_id) where sent = false;
