-- Forme · espace coach : le coach ouvre une séance de son membre et en
-- voit le détail (séries, charges, répétitions, muscles travaillés).
-- À exécuter une fois dans Supabase (SQL Editor), après
-- 20261013_coaching.sql. Sans risque si relancé.
--
-- Même principe que suivi_membre() : les tables seances / series restent
-- privées, la fonction vérifie le lien coach ↔ membre avant de lire.
-- Les lignes passent par to_jsonb() pour ne pas dépendre des colonnes
-- facultatives (records, calories_estimees, duree_s…) : une colonne
-- absente revient simplement à null.

-- Détail d'une séance d'un membre : { seance: {...}, series: [...] }.
create or replace function public.seance_membre(p_seance uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_seance public.seances;
begin
  select * into v_seance from public.seances where id = p_seance;

  if v_seance.id is null or not exists (
    select 1 from public.coach_liens
     where coach_id = auth.uid() and membre_id = v_seance.user_id
  ) then
    raise exception 'acces_refuse' using errcode = '42501';
  end if;

  return json_build_object(
    'seance', (
      select jsonb_build_object(
        'id', j->'id', 'nom', j->'nom', 'date', j->'date', 'duree_minutes', j->'duree_minutes',
        'notes', j->'notes', 'records', j->'records',
        'calories_estimees', j->'calories_estimees', 'muscles_travailles', j->'muscles_travailles')
        from to_jsonb(v_seance) j
    ),
    'series', coalesce((
      select json_agg(
               jsonb_build_object(
                 'exercice_nom', j->'exercice_nom', 'numero_serie', j->'numero_serie',
                 'poids_kg', j->'poids_kg', 'repetitions', j->'repetitions',
                 'duree_s', j->'duree_s', 'vitesse_kmh', j->'vitesse_kmh',
                 'inclinaison_pct', j->'inclinaison_pct', 'resistance', j->'resistance',
                 'temps_repos_s', j->'temps_repos_s', 'notes', j->'notes',
                 'type_serie', j->'type_serie')
               order by r.exercice_nom, r.numero_serie)
        from public.series r, to_jsonb(r) j
       where r.seance_id = p_seance
    ), '[]'::json)
  );
end $$;

-- suivi_membre() lisait s.records en direct : sans la migration
-- 20261010_pulse_rappels_records.sql, la liste des séances du membre
-- échouait. Même fonction, records lu via to_jsonb().
create or replace function public.suivi_membre(p_membre uuid)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.coach_liens
                  where coach_id = auth.uid() and membre_id = p_membre) then
    raise exception 'acces_refuse' using errcode = '42501';
  end if;

  return coalesce((
    select json_agg(x order by x.date desc, x.created_at desc)
      from (
        select s.id, s.nom, s.date, s.created_at, s.duree_minutes, s.programme_id,
               (select to_jsonb(s2)->'records' from public.seances s2 where s2.id = s.id) as records,
               count(r.id) filter (where r.type_serie <> 'echauffement')::int as nb_series,
               coalesce(sum(r.poids_kg * r.repetitions)
                 filter (where r.type_serie <> 'echauffement'), 0) as volume,
               coalesce(array_agg(distinct r.exercice_nom)
                 filter (where r.exercice_nom is not null), '{}') as exercices
          from public.seances s
          left join public.series r on r.seance_id = s.id
         where s.user_id = p_membre
         group by s.id
         order by s.date desc, s.created_at desc
         limit 30
      ) x
  ), '[]'::json);
end $$;

revoke execute on function public.seance_membre(uuid) from public, anon;
revoke execute on function public.suivi_membre(uuid)  from public, anon;
grant  execute on function public.seance_membre(uuid) to authenticated;
grant  execute on function public.suivi_membre(uuid)  to authenticated;
