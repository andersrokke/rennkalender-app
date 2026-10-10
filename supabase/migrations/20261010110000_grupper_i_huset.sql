-- Grupper i huset, satt opp på én skjerm.
--
-- Før måtte treneren «stå» i en gruppe for å se løperne i den, hente inn
-- løpere én og én fra «uten gruppe», og flytte dem én og én. Nå ser en trener
-- i huset alle løperne i huset, merker flere og flytter dem samlet. Grupper
-- kan få nytt navn og slettes når de er tomme.
--
-- Rettigheter: alt krever at du er trener i huset (i_huset). Å flytte en
-- løper krever i tillegg at du er trener for gruppa hun står i og gruppa hun
-- skal til - eller at huset har «alle ser alt», eller at du er hovedtrener.

-- Alle gruppene i huset mitt, huset selv først.
create or replace function public.hus_grupper()
returns table (id uuid, name text, er_hus boolean, eier_id uuid, eier_navn text, lopere bigint, min boolean, invite_code text)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_hus uuid := mitt_hus();
begin
  if v_hus is null or not i_huset(v_hus) then return; end if;
  return query
    select t.id, t.name, t.parent_team_id is null, t.owner_id, o.full_name,
           (select count(*) from profiles a where a.team_id = t.id and a.role = 'athlete'),
           is_coach_of(t.id), t.invite_code
      from teams t left join profiles o on o.id = t.owner_id
     where t.id = v_hus or t.parent_team_id = v_hus
     order by t.parent_team_id nulls first, t.name;
end
$function$;

-- Alle løperne i huset mitt, uansett gruppe.
create or replace function public.hus_lopere()
returns table (id uuid, full_name text, birth_year integer, gender character, fis_code text, team_id uuid)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_hus uuid := mitt_hus();
begin
  if v_hus is null or not i_huset(v_hus) then return; end if;
  return query
    select p.id, p.full_name, p.birth_year, p.gender, p.fis_code, p.team_id
      from profiles p join teams t on t.id = p.team_id
     where p.role = 'athlete' and (t.id = v_hus or t.parent_team_id = v_hus)
     order by p.full_name;
end
$function$;

-- Flytt flere løpere til en gruppe, eller til huset (uten gruppe).
-- Planene deres følger med: et ønske er løperens, ikke gruppas.
create or replace function public.flytt_lopere(p_athletes uuid[], p_team uuid)
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare v_hus uuid := mitt_hus(); v_hoved boolean; v_alle boolean; a uuid; v_fra uuid; n int := 0;
begin
  if v_hus is null or not i_huset(v_hus) then raise exception 'Bare trenere i laget kan flytte løpere'; end if;
  if not exists (select 1 from teams where id = p_team and (id = v_hus or parent_team_id = v_hus)) then
    raise exception 'Gruppa hører ikke til laget ditt';
  end if;
  select owner_id = auth.uid(), coaches_see_all into v_hoved, v_alle from teams where id = v_hus;
  foreach a in array p_athletes loop
    select p.team_id into v_fra from profiles p join teams t on t.id = p.team_id
     where p.id = a and p.role = 'athlete' and (t.id = v_hus or t.parent_team_id = v_hus);
    if v_fra is null or v_fra = p_team then continue; end if;
    if not (v_hoved or v_alle or (is_coach_of(v_fra) and is_coach_of(p_team))) then
      raise exception 'Du er ikke trener for gruppa løperen står i';
    end if;
    update athlete_races set team_id = p_team where athlete_id = a and team_id = v_fra;
    update profiles set team_id = p_team where id = a;
    n := n + 1;
  end loop;
  return n;
end
$function$;

create or replace function public.gi_gruppenavn(p_team uuid, p_name text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_hus uuid;
begin
  select parent_team_id into v_hus from teams where id = p_team;
  if v_hus is null then raise exception 'Huset får navn av administrator'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Gruppa må ha et navn'; end if;
  if not (is_coach_of(p_team) or exists (select 1 from teams where id = v_hus and owner_id = auth.uid())) then
    raise exception 'Bare gruppas trener eller hovedtrener kan gi nytt navn';
  end if;
  update teams set name = btrim(p_name) where id = p_team;
end
$function$;

-- Bare tomme grupper slettes. Løperne flyttes først.
create or replace function public.slett_gruppe(p_team uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_hus uuid;
begin
  select parent_team_id into v_hus from teams where id = p_team;
  if v_hus is null then raise exception 'Huset kan ikke slettes her'; end if;
  if not (exists (select 1 from teams where id = p_team and owner_id = auth.uid())
       or exists (select 1 from teams where id = v_hus and owner_id = auth.uid())) then
    raise exception 'Bare gruppas eier eller hovedtrener kan slette gruppa';
  end if;
  if exists (select 1 from profiles where team_id = p_team and role = 'athlete') then
    raise exception 'Gruppa har løpere. Flytt dem først.';
  end if;
  -- Trenere som står i gruppa settes tilbake i huset.
  update profiles set team_id = v_hus where team_id = p_team;
  delete from teams where id = p_team;
end
$function$;

do $$
declare f text;
begin
  foreach f in array array['hus_grupper()', 'hus_lopere()', 'flytt_lopere(uuid[], uuid)', 'gi_gruppenavn(uuid, text)', 'slett_gruppe(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- NTG Lillehammer: trenerne i huset ser hverandres grupper. Hovedtreneren
-- kan slå det av under Løpere.
update public.teams set coaches_see_all = true
 where parent_team_id is null and lower(name) = 'ntg lillehammer';
