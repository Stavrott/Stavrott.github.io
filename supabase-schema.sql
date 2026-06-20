-- MusclApp — Schéma Supabase
-- À exécuter dans l'éditeur SQL de votre projet Supabase

-- Extension UUID
create extension if not exists "uuid-ossp";

-- ── Profils utilisateurs ──────────────────────────────────────────────
create table if not exists profils (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  prenom      text,
  poids_kg    numeric(5,2),
  taille_cm   integer,
  created_at  timestamptz default now(),
  unique(user_id)
);

-- ── Séances d'entraînement ───────────────────────────────────────────
create table if not exists seances (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  nom             text not null default 'Séance',
  date            date not null default current_date,
  duree_minutes   integer,
  notes           text,
  programme_id    uuid,
  created_at      timestamptz default now()
);

-- ── Séries (sets) ─────────────────────────────────────────────────────
create table if not exists series (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  seance_id       uuid not null references seances(id) on delete cascade,
  exercice_nom    text not null,
  numero_serie    integer not null,
  poids_kg        numeric(6,2),
  repetitions     integer,
  temps_repos_s   integer,
  notes           text,
  created_at      timestamptz default now()
);

-- ── Programmes ────────────────────────────────────────────────────────
create table if not exists programmes (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nom         text not null,
  description text,
  structure   jsonb,  -- [{nom:"Jour A", exercices:[...]}]
  is_public   boolean default false,
  created_at  timestamptz default now()
);

-- ── Nutrition ─────────────────────────────────────────────────────────
create table if not exists nutrition (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null default current_date,
  nom         text not null,
  calories    numeric(7,2) default 0,
  proteines   numeric(6,2) default 0,
  glucides    numeric(6,2) default 0,
  lipides     numeric(6,2) default 0,
  fibres      numeric(6,2) default 0,
  notes       text,
  created_at  timestamptz default now()
);

-- ── Objectifs nutritionnels ───────────────────────────────────────────
create table if not exists objectifs_nutrition (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  calories    numeric(7,2) default 2000,
  proteines   numeric(6,2) default 150,
  glucides    numeric(6,2) default 200,
  lipides     numeric(6,2) default 70,
  updated_at  timestamptz default now(),
  unique(user_id)
);

-- ── Row Level Security (RLS) ──────────────────────────────────────────
-- Chaque utilisateur ne voit que ses propres données

alter table profils             enable row level security;
alter table seances             enable row level security;
alter table series              enable row level security;
alter table programmes          enable row level security;
alter table nutrition           enable row level security;
alter table objectifs_nutrition enable row level security;

-- Politiques : accès uniquement à ses propres données
create policy "Propres profils"   on profils             for all using (auth.uid() = user_id);
create policy "Propres séances"   on seances             for all using (auth.uid() = user_id);
create policy "Propres séries"    on series              for all using (auth.uid() = user_id);
create policy "Propres progs"     on programmes          for all using (auth.uid() = user_id);
create policy "Propre nutrition"  on nutrition           for all using (auth.uid() = user_id);
create policy "Propres objectifs" on objectifs_nutrition for all using (auth.uid() = user_id);

-- ── Exercices personnalisés ──────────────────────────────────────────
create table if not exists exercices_custom (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nom         text not null,
  groupe      text not null default 'Autre',
  materiel    text not null default 'Aucun',
  muscles     text[] default '{}',
  description text,
  created_at  timestamptz default now()
);
alter table exercices_custom enable row level security;
create policy "Propres exercices" on exercices_custom for all using (auth.uid() = user_id);
create index if not exists idx_exo_custom_user on exercices_custom(user_id);

-- ── Historique du poids corporel ─────────────────────────────────────
create table if not exists historique_poids (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null default current_date,
  poids_kg    numeric(5,2) not null,
  notes       text,
  created_at  timestamptz default now(),
  unique(user_id, date)
);
alter table historique_poids enable row level security;
create policy "Propre poids" on historique_poids for all using (auth.uid() = user_id);
create index if not exists idx_poids_user_date on historique_poids(user_id, date desc);

-- ── Colonnes objectifs dans profils ──────────────────────────────────
alter table profils add column if not exists objectif           text    default 'hypertrophie';
alter table profils add column if not exists objectif_poids_kg  numeric(5,2);

-- ── Colonnes onboarding dans profils ────────────────────────────────────
alter table profils add column if not exists age         integer;
alter table profils add column if not exists sexe        text;
alter table profils add column if not exists niveau      text;
alter table profils add column if not exists frequence   integer;
alter table profils add column if not exists lieu        text    default 'salle';
alter table profils add column if not exists equipements text[]  default '{}';

-- ── Index pour les performances ───────────────────────────────────────
create index if not exists idx_seances_user_date    on seances(user_id, date desc);
create index if not exists idx_series_seance        on series(seance_id);
create index if not exists idx_series_user_exo      on series(user_id, exercice_nom);
create index if not exists idx_nutrition_user_date  on nutrition(user_id, date desc);

-- ── Métriques dynamiques par type d'exercice (cardio / isométrique) ────
-- poids_kg / repetitions restent utilisées pour le type 'kg_reps' (défaut).
-- Ces colonnes sont nullable et additives : aucun impact sur les données existantes.
alter table series           add column if not exists duree_s         integer;
alter table series           add column if not exists vitesse_kmh     numeric(5,2);
alter table series           add column if not exists inclinaison_pct numeric(4,1);
alter table series           add column if not exists resistance      numeric(5,1);
alter table exercices_custom add column if not exists type_metrique   text default 'kg_reps';

-- ── Calories estimées + muscles travaillés par séance (voir js/calories.js) ────
alter table seances add column if not exists calories_estimees integer;
alter table seances add column if not exists muscles_travailles text[];

-- ── Disposition personnalisée de l'accueil (voir pages/home.js) ────────
-- [{id:'week-stats', hidden:false}, ...] — ordre + visibilité par widget.
alter table profils add column if not exists home_layout jsonb;

-- ── Notifications push (repos fiable même app fermée) ──────────────────
-- Un appareil = un abonnement Web Push. Géré directement par le client
-- (RLS classique user_id = auth.uid()).
create table if not exists push_subscriptions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth_key    text not null,
  created_at  timestamptz default now()
);
alter table push_subscriptions enable row level security;
create policy "Propres abonnements push" on push_subscriptions for all using (auth.uid() = user_id);

-- File des notifications programmées, gérée uniquement par les Edge
-- Functions (clé service_role) — pas de policy ouverte au client, RLS
-- activée mais "deny by default" pour anon/authenticated.
create table if not exists push_pending (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  deliver_at  timestamptz not null,
  title       text not null,
  body        text,
  sent        boolean default false,
  created_at  timestamptz default now()
);
alter table push_pending enable row level security;
create index if not exists idx_push_pending_due on push_pending(deliver_at) where sent = false;

-- ── Tâche planifiée : déclenche l'envoi des notifications dues ─────────
-- pg_cron ne descend pas sous la minute ; la fonction send-due-notifications
-- boucle elle-même toutes les ~1s pendant ~55s pour une précision correcte.
-- La clé "anon" suffit ici (déjà publique, cf. js/config.js) : elle ne fait
-- que passer la vérification JWT de la passerelle Edge Functions. La
-- fonction utilise elle-même SUPABASE_SERVICE_ROLE_KEY pour ses accès BDD
-- privilégiés — cette variable est injectée automatiquement par Supabase,
-- pas besoin de la stocker nulle part (Vault ou autre).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-due-push-notifications',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://ytkrjraoqmroankhidip.supabase.co/functions/v1/send-due-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_bBM2IhLy67iX7-e-n6SaFg__WDrReHj'
    )
  );
  $$
);
