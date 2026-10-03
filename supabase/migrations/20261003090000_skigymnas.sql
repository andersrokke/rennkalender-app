-- Skigymnasene som ferdige lag, åpen tilknytning, og trenerrett som bygger
-- på eierskap.
--
-- Fram til nå fantes et lag først når en trener hadde opprettet det. En løper
-- som gikk på NTG Lillehammer kunne ikke si det før treneren var i gang, og
-- en trener kunne ikke finne en løper som alt hadde registrert seg.
--
-- Nå finnes skigymnasene fra start. En løper velger sitt uten kode og står
-- der til en trener henter henne inn i en gruppe. Det betyr at laget ikke
-- lenger er en lukket krets man slipper inn i med en kode - og da må to ting
-- strammes samtidig:
--
--   Løpere som bare har valgt samme skigymnas, ser ikke hverandre. Det gjør
--   de først når de står i samme gruppe.
--
--   Å være trener for et lag kan ikke lenger bety «står i laget og har valgt
--   rollen trener». Rollen velger man selv ved registrering. Trenerrett
--   følger nå av eierskap: du eier laget, eier huset det ligger under, eier
--   en gruppe i et hus med «alle ser alt», eller hovedtreneren har gitt deg
--   innsyn. Ingenting av det kan man gi seg selv.

-- ---------------------------------------------------------------------------
-- Lag uten eier
-- ---------------------------------------------------------------------------
alter table public.teams
  add column if not exists is_school boolean not null default false;
alter table public.teams alter column owner_id drop not null;

-- Var cascade: slettet man en bruker, forsvant laget hun eide - med løperne
-- sine. Et skigymnas skal overleve at hovedtreneren slutter.
alter table public.teams drop constraint if exists teams_owner_id_fkey;
alter table public.teams add constraint teams_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete set null;

alter table public.teams drop constraint if exists teams_school_er_hus;
alter table public.teams add constraint teams_school_er_hus
  check (not is_school or parent_team_id is null);

-- Finnes laget fra før (NTG Lillehammer gjør det), merkes det. Ellers opprettes
-- det uten eier.
update public.teams set is_school = true
 where parent_team_id is null
   and lower(btrim(name)) = any (array['ntg bærum', 'ntg geilo', 'ntg lillehammer',
       'wang toppidrett', 'tryvis', 'voss', 'oppdal', 'narvik', 'dønski']);

insert into public.teams (name, owner_id, is_school)
select n, null, true
  from unnest(array['NTG Bærum', 'NTG Geilo', 'NTG Lillehammer', 'Wang Toppidrett',
                    'Tryvis', 'Voss', 'Oppdal', 'Narvik', 'Dønski']) as n
 where not exists (select 1 from public.teams t
                    where t.parent_team_id is null and lower(btrim(t.name)) = lower(n));

create or replace function public.er_skigymnas(t uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((select is_school from teams where id = t), false)
$function$;

-- ---------------------------------------------------------------------------
-- Trenerrett følger av eierskap
-- ---------------------------------------------------------------------------
create or replace function public.is_coach_of(t uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from teams where id = t and owner_id = auth.uid())
      or exists (select 1 from teams g join teams p on p.id = g.parent_team_id
                  where g.id = t and p.owner_id = auth.uid())
      or exists (select 1 from teams g join teams p on p.id = g.parent_team_id
                  where g.id = t and p.coaches_see_all
                    and exists (select 1 from teams m
                                 where m.parent_team_id = p.id and m.owner_id = auth.uid()))
      or exists (select 1 from teams h
                  where h.id = t and h.parent_team_id is null and h.coaches_see_all
                    and exists (select 1 from teams m
                                 where m.parent_team_id = h.id and m.owner_id = auth.uid()))
      or exists (select 1 from team_access a where a.team_id = t and a.coach_id = auth.uid())
$function$;

-- I huset er den som eier det, eller eier en gruppe i det. Ikke den som bare
-- står der.
create or replace function public.i_huset(p_hus uuid, p_hvem uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from teams where id = p_hus and owner_id = p_hvem)
      or exists (select 1 from teams where parent_team_id = p_hus and owner_id = p_hvem)
$function$;

-- Lesing av profiler: seg selv, de man er trener for, barna sine, og
-- lagkamerater - men ikke på et skigymnas uten gruppe, der man bare har valgt
-- samme skole.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles as permissive for select to authenticated
  using (id = auth.uid()
      or (team_id is not null and team_id = my_team() and not er_skigymnas(team_id))
      or is_coach_of(team_id)
      or is_guardian_of(id));

-- ---------------------------------------------------------------------------
-- Løperen velger skigymnas
-- ---------------------------------------------------------------------------
create or replace function public.skigymnas()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select t.id, t.name from teams t where t.is_school order by t.name
$function$;

create or replace function public.velg_skigymnas(p_team uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_na uuid;
begin
  if not er_skigymnas(p_team) then raise exception 'Det er ikke et skigymnas'; end if;
  select team_id into v_na from profiles where id = auth.uid();
  -- Står man i en gruppe eller et vanlig lag, går man ut der først. Ellers
  -- kunne et feilklikk flytte en løper ut av gruppa til treneren sin.
  if v_na is not null and not er_skigymnas(v_na) then
    raise exception 'Gå ut av laget du står i først';
  end if;
  update profiles set team_id = p_team where id = auth.uid();
end
$function$;

-- ---------------------------------------------------------------------------
-- Treneren henter inn løpere som alt står på skigymnaset
-- ---------------------------------------------------------------------------
create or replace function public.ledige_lopere()
returns table (id uuid, full_name text, birth_year integer, fis_code text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_hus uuid := mitt_hus();
begin
  if v_hus is null or not i_huset(v_hus) then return; end if;
  return query
    select p.id, p.full_name, p.birth_year, p.fis_code
      from profiles p
     where p.team_id = v_hus and p.role = 'athlete'
     order by p.full_name;
end
$function$;

create or replace function public.flytt_loper(p_athlete uuid, p_team uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_fra uuid; v_hus_fra uuid; v_hus_til uuid;
begin
  select team_id into v_fra from profiles where id = p_athlete and role = 'athlete';
  if v_fra is null then raise exception 'Fant ikke løperen i noe lag'; end if;
  if v_fra = p_team then return; end if;
  select coalesce(parent_team_id, id) into v_hus_fra from teams where id = v_fra;
  select coalesce(parent_team_id, id) into v_hus_til from teams where id = p_team;
  if v_hus_fra is distinct from v_hus_til then
    raise exception 'Løpere flyttes bare mellom grupper i samme lag';
  end if;
  -- Fra huset selv kan enhver trener i huset hente en løper inn i sin gruppe.
  -- Det er slik en trener kobler seg til en løper som alt har registrert seg.
  if not (is_coach_of(v_fra) or (v_fra = v_hus_fra and i_huset(v_hus_fra))) then
    raise exception 'Du er ikke trener for gruppa løperen står i';
  end if;
  if not is_coach_of(p_team) then raise exception 'Du er ikke trener for gruppa du flytter til'; end if;

  delete from athlete_races where athlete_id = p_athlete and team_id = v_fra;
  update profiles set team_id = p_team where id = p_athlete;
end
$function$;

-- ---------------------------------------------------------------------------
-- Foreldrekoden: dedikert, lesbar, og mulig å bytte
--
-- FIS-koden er offentlig - hvem som helst kan slå den opp - så den kan ikke
-- være det som gir en voksen innsyn i en løpers plan og logg. Koden under
-- profilen er det. Den var åtte heksadesimale tegn; nå er den seks lesbare,
-- som lagkoden, og løperen kan lage en ny om den kommer på avveie.
-- ---------------------------------------------------------------------------
create or replace function public.ny_foreldrekode()
returns text
language plpgsql
set search_path to 'public'
as $function$
declare
  alfabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea; kode text; i integer;
begin
  for forsok in 1..20 loop
    b := extensions.gen_random_bytes(6);
    kode := '';
    for i in 0..5 loop
      kode := kode || substr(alfabet, 1 + (get_byte(b, i) % 32), 1);
    end loop;
    if not exists (select 1 from profiles where link_code = kode) then return kode; end if;
  end loop;
  raise exception 'Fikk ikke laget en ledig kode';
end
$function$;

update public.profiles set link_code = public.ny_foreldrekode()
 where link_code is null or link_code ~ '^[0-9a-f]{8}$';
alter table public.profiles alter column link_code set default public.ny_foreldrekode();
create unique index if not exists profiles_link_code_key on public.profiles (link_code);

create or replace function public.bytt_foreldrekode()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare k text := ny_foreldrekode();
begin
  update profiles set link_code = k where id = auth.uid();
  return k;
end
$function$;

create or replace function public.link_guardian(code text)
returns table(athlete_id uuid, full_name text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare a_id uuid; a_name text;
begin
  select id, profiles.full_name into a_id, a_name from profiles
   where upper(link_code) = upper(btrim(code)) and role = 'athlete';
  if a_id is null then raise exception 'Ugyldig kode'; end if;
  if a_id = auth.uid() then raise exception 'Du kan ikke koble deg til deg selv'; end if;
  insert into guardians(parent_id, athlete_id) values (auth.uid(), a_id) on conflict do nothing;
  update profiles set role = 'parent', onboarded = true where id = auth.uid() and role <> 'coach';
  return query select a_id, a_name;
end $function$;

-- ---------------------------------------------------------------------------
-- Administrator: oversikt og struktur
-- ---------------------------------------------------------------------------
drop function if exists public.admin_users();
create function public.admin_users()
returns table (
  id uuid, email text, full_name text, role text, is_admin boolean,
  is_test boolean, onboarded boolean, team_id uuid, team_name text,
  hus_id uuid, hus_navn text, pa_huset boolean, skigymnas boolean,
  foresatte text, barn text, eier_av text,
  provider text, created_at timestamp with time zone,
  last_sign_in_at timestamp with time zone, okter bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  return query
    select p.id, u.email::text, p.full_name, p.role::text, p.is_admin, p.is_test,
           p.onboarded, p.team_id, t.name,
           coalesce(t.parent_team_id, t.id), coalesce(h.name, t.name),
           (t.id is not null and t.parent_team_id is null),
           coalesce(h.is_school, t.is_school, false),
           (select string_agg(pp.full_name, ', ') from guardians g
              join profiles pp on pp.id = g.parent_id where g.athlete_id = p.id),
           (select string_agg(a.full_name, ', ') from guardians g
              join profiles a on a.id = g.athlete_id where g.parent_id = p.id),
           (select string_agg(e.name, ', ') from teams e where e.owner_id = p.id),
           (select string_agg(distinct i.provider, ', ')
              from auth.identities i where i.user_id = p.id)::text,
           u.created_at, u.last_sign_in_at,
           (select count(*) from training_sessions s
             where s.athlete_id = p.id and not s.planned)
      from profiles p
      join auth.users u on u.id = p.id
      left join teams t on t.id = p.team_id
      left join teams h on h.id = t.parent_team_id
     order by coalesce(h.name, t.name) nulls last, t.parent_team_id nulls first, t.name, p.full_name;
end
$function$;

drop function if exists public.admin_teams();
create function public.admin_teams()
returns table (
  id uuid, name text, club text, owner_id uuid, owner_name text, owner_email text,
  invite_code text, lopere bigint, renn bigint, parent_team_id uuid,
  parent_name text, is_school boolean, created_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  return query
    select t.id, t.name, t.club, t.owner_id, o.full_name, u.email::text, t.invite_code,
           (select count(*) from profiles p where p.team_id = t.id and p.role = 'athlete'),
           (select count(*) from team_races r where r.team_id = t.id),
           t.parent_team_id, pt.name, t.is_school, t.created_at
      from teams t
      left join profiles o on o.id = t.owner_id
      left join auth.users u on u.id = t.owner_id
      left join teams pt on pt.id = t.parent_team_id
     order by coalesce(pt.name, t.name), t.parent_team_id nulls first, t.name;
end
$function$;

-- Hovedtrener for et skigymnas settes av administrator. Et skigymnas alle kan
-- velge, kan ikke samtidig være noe den første som melder seg kan ta.
create or replace function public.admin_set_team_owner(p_team uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  update teams set owner_id = p_user where id = p_team;
  if p_user is not null then
    update profiles set role = 'coach', team_id = coalesce(team_id, p_team) where id = p_user;
  end if;
end
$function$;

create or replace function public.admin_set_team(p_user uuid, p_team uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_fra uuid;
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  select team_id into v_fra from profiles where id = p_user;
  if v_fra is not distinct from p_team then return; end if;
  delete from athlete_races where athlete_id = p_user and team_id = v_fra;
  update profiles set team_id = p_team where id = p_user;
end
$function$;

create or replace function public.admin_rename_team(p_team uuid, p_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Laget må ha et navn'; end if;
  update teams set name = btrim(p_name) where id = p_team;
end
$function$;

create or replace function public.admin_delete_team(p_team uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  if exists (select 1 from teams where parent_team_id = p_team) then
    raise exception 'Laget har grupper under seg. Flytt eller slett dem først.';
  end if;
  delete from teams where id = p_team;
end
$function$;

-- Lagene ble før slettet sammen med eieren. Nå blir de stående uten eier, så
-- et frittstående lag som ikke er et skigymnas ryddes her, slik det ble før.
create or replace function public.admin_delete_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  if p_user = auth.uid() then raise exception 'Du kan ikke slette deg selv'; end if;
  delete from teams t
   where t.owner_id = p_user and not t.is_school and t.parent_team_id is null
     and not exists (select 1 from teams g where g.parent_team_id = t.id);
  delete from auth.users where id = p_user;
end
$function$;

do $$
declare f text;
begin
  foreach f in array array[
    'er_skigymnas(uuid)', 'skigymnas()', 'velg_skigymnas(uuid)', 'ledige_lopere()',
    'bytt_foreldrekode()', 'ny_foreldrekode()', 'admin_users()', 'admin_teams()',
    'admin_set_team_owner(uuid, uuid)', 'admin_set_team(uuid, uuid)',
    'admin_rename_team(uuid, text)', 'admin_delete_team(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
