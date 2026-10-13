-- Forme · espace coach : un coach invite ses membres par code, leur
-- assigne ses programmes et suit leurs séances.
-- À exécuter une fois dans Supabase (SQL Editor). Sans risque si relancé.
--
-- Principe de confidentialité : les tables seances / series / profils
-- restent strictement privées (RLS inchangée). Le coach ne lit les
-- données d'un membre qu'au travers des fonctions ci-dessous, qui
-- vérifient le lien coach ↔ membre. Seuls les programmes assignés
-- deviennent lisibles par le membre concerné.

-- ── Liens coach ↔ membre ──────────────────────────────────────────────
create table if not exists public.coach_liens (
  id          uuid primary key default uuid_generate_v4(),
  coach_id    uuid not null references auth.users(id) on delete cascade,
  membre_id   uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (coach_id, membre_id),
  check (coach_id <> membre_id)
);
alter table public.coach_liens enable row level security;
create index if not exists coach_liens_membre_idx on public.coach_liens (membre_id);

-- Chacun voit les liens qui le concernent et peut y mettre fin (le coach
-- retire un membre, le membre quitte son coach). La création passe par
-- rejoindre_coach(), avec un code d'invitation.
drop policy if exists "Liens coach visibles" on public.coach_liens;
create policy "Liens coach visibles" on public.coach_liens
  for select using (auth.uid() in (coach_id, membre_id));
drop policy if exists "Liens coach supprimables" on public.coach_liens;
create policy "Liens coach supprimables" on public.coach_liens
  for delete using (auth.uid() in (coach_id, membre_id));

-- ── Codes d'invitation ────────────────────────────────────────────────
create table if not exists public.coach_invitations (
  code        text primary key,
  coach_id    uuid not null references auth.users(id) on delete cascade,
  expire_le   timestamptz not null default now() + interval '7 days',
  created_at  timestamptz not null default now()
);
alter table public.coach_invitations enable row level security;
create index if not exists coach_invitations_coach_idx on public.coach_invitations (coach_id);

drop policy if exists "Propres invitations" on public.coach_invitations;
create policy "Propres invitations" on public.coach_invitations
  for select using (auth.uid() = coach_id);
drop policy if exists "Propres invitations supprimables" on public.coach_invitations;
create policy "Propres invitations supprimables" on public.coach_invitations
  for delete using (auth.uid() = coach_id);

-- ── Programmes assignés ───────────────────────────────────────────────
-- La clé étrangère vers coach_liens garantit qu'on n'assigne qu'à un
-- membre lié, et retire les assignations quand le lien est rompu.
create table if not exists public.programmes_assignes (
  id            uuid primary key default uuid_generate_v4(),
  coach_id      uuid not null,
  membre_id     uuid not null,
  programme_id  uuid not null references public.programmes(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (membre_id, programme_id),
  foreign key (coach_id, membre_id)
    references public.coach_liens (coach_id, membre_id) on delete cascade
);
alter table public.programmes_assignes enable row level security;
create index if not exists programmes_assignes_coach_idx on public.programmes_assignes (coach_id, membre_id);

drop policy if exists "Assignations visibles" on public.programmes_assignes;
create policy "Assignations visibles" on public.programmes_assignes
  for select using (auth.uid() in (coach_id, membre_id));
drop policy if exists "Coach assigne ses programmes" on public.programmes_assignes;
create policy "Coach assigne ses programmes" on public.programmes_assignes
  for insert with check (
    auth.uid() = coach_id
    and exists (select 1 from public.programmes p where p.id = programme_id and p.user_id = auth.uid())
  );
drop policy if exists "Coach retire ses programmes" on public.programmes_assignes;
create policy "Coach retire ses programmes" on public.programmes_assignes
  for delete using (auth.uid() = coach_id);

-- Le membre lit (sans pouvoir les modifier) les programmes qu'on lui a
-- assignés : il les voit toujours à jour quand son coach les retouche.
drop policy if exists "Programmes assignés lisibles" on public.programmes;
create policy "Programmes assignés lisibles" on public.programmes
  for select using (exists (
    select 1 from public.programmes_assignes pa
    where pa.programme_id = programmes.id and pa.membre_id = auth.uid()
  ));

-- ── Fonctions ─────────────────────────────────────────────────────────

-- Prénom affiché d'un utilisateur (profil, sinon celui de l'inscription).
create or replace function public._coach_prenom(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(trim((select prenom from public.profils where user_id = p_user)), ''),
    nullif(trim((select raw_user_meta_data->>'prenom' from auth.users where id = p_user)), ''),
    'Sans nom'
  );
$$;
revoke execute on function public._coach_prenom(uuid) from public, anon, authenticated;

-- Code d'invitation du coach : réutilise le code encore valable, ou en
-- crée un nouveau (p_nouveau = true pour révoquer l'ancien).
create or replace function public.coach_invitation(p_nouveau boolean default false)
returns json language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_inv  public.coach_invitations;
  v_abc  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  if v_uid is null then raise exception 'non_connecte' using errcode = '42501'; end if;

  delete from public.coach_invitations
   where coach_id = v_uid and (p_nouveau or expire_le <= now());

  select * into v_inv from public.coach_invitations
   where coach_id = v_uid order by expire_le desc limit 1;

  if v_inv.code is null then
    loop
      v_code := '';
      for i in 1..6 loop
        v_code := v_code || substr(v_abc, 1 + floor(random() * length(v_abc))::int, 1);
      end loop;
      exit when not exists (select 1 from public.coach_invitations where code = v_code);
    end loop;
    insert into public.coach_invitations (code, coach_id) values (v_code, v_uid)
    returning * into v_inv;
  end if;

  return json_build_object('code', v_inv.code, 'expire_le', v_inv.expire_le);
end $$;

-- Le membre entre le code reçu : le lien est créé, renvoie le prénom du coach.
create or replace function public.rejoindre_coach(p_code text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_coach uuid;
begin
  if v_uid is null then raise exception 'non_connecte' using errcode = '42501'; end if;

  select coach_id into v_coach from public.coach_invitations
   where code = upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')) and expire_le > now();

  if v_coach is null then raise exception 'code_invalide'; end if;
  if v_coach = v_uid then raise exception 'code_personnel'; end if;

  insert into public.coach_liens (coach_id, membre_id) values (v_coach, v_uid)
  on conflict (coach_id, membre_id) do nothing;

  return public._coach_prenom(v_coach);
end $$;

-- Côté membre : ses coachs.
create or replace function public.mes_coachs()
returns table (coach_id uuid, prenom text, depuis timestamptz)
language sql stable security definer set search_path = public as $$
  select l.coach_id, public._coach_prenom(l.coach_id), l.created_at
    from public.coach_liens l
   where l.membre_id = auth.uid()
   order by l.created_at;
$$;

-- Côté coach : ses membres, avec un aperçu de leur activité.
create or replace function public.mes_membres()
returns table (membre_id uuid, prenom text, depuis timestamptz, derniere_seance date,
               seances_7j int, objectif_hebdo int, programmes int)
language sql stable security definer set search_path = public as $$
  select l.membre_id,
         public._coach_prenom(l.membre_id),
         l.created_at,
         (select max(s.date) from public.seances s where s.user_id = l.membre_id),
         (select count(*)::int from public.seances s
           where s.user_id = l.membre_id and s.date >= current_date - 6),
         (select p.frequence from public.profils p where p.user_id = l.membre_id),
         (select count(*)::int from public.programmes_assignes pa
           where pa.coach_id = l.coach_id and pa.membre_id = l.membre_id)
    from public.coach_liens l
   where l.coach_id = auth.uid()
   order by 2;
$$;

-- Côté coach : les 30 dernières séances d'un membre (hors séries
-- d'échauffement), avec records battus. Refusé sans lien coach ↔ membre.
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
        select s.id, s.nom, s.date, s.created_at, s.duree_minutes, s.programme_id, s.records,
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

revoke execute on function public.coach_invitation(boolean) from public, anon;
revoke execute on function public.rejoindre_coach(text)     from public, anon;
revoke execute on function public.mes_coachs()              from public, anon;
revoke execute on function public.mes_membres()             from public, anon;
revoke execute on function public.suivi_membre(uuid)        from public, anon;
grant  execute on function public.coach_invitation(boolean) to authenticated;
grant  execute on function public.rejoindre_coach(text)     to authenticated;
grant  execute on function public.mes_coachs()              to authenticated;
grant  execute on function public.mes_membres()             to authenticated;
grant  execute on function public.suivi_membre(uuid)        to authenticated;
