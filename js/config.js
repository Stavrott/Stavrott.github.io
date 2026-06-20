// ⚠️  Remplacez ces valeurs par vos identifiants Supabase
// Disponibles dans : Supabase Dashboard → Settings → API

export const SUPABASE_URL      = 'https://ytkrjraoqmroankhidip.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_bBM2IhLy67iX7-e-n6SaFg__WDrReHj';

// Clé publique VAPID (Web Push) — la clé privée correspondante ne vit que
// côté serveur (secret de l'Edge Function send-due-notifications), jamais ici.
export const VAPID_PUBLIC_KEY = 'BLn9PuAMOa3gZIPAZxuAI400KGEJ_pdVuAhD29rMI6kTgSky5JTutD1DFoQdoR2kEa2XpYpbOfs_jtG_q8kc86A';

// Nom du cache Service Worker (incrémentez lors de mises à jour)
export const SW_CACHE_VERSION = 'v1';

// Paramètres de l'application
export const APP_CONFIG = {
  name:       'Forme',
  version:    '1.0.0',
  // Durée de repos par défaut entre les séries (secondes)
  defaultRestTime: 90,
  // Niveaux pour le calcul du 1RM (formule Epley)
  maxRepRange: 12,
};
