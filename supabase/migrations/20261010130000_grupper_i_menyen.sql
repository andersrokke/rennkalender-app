-- Hvem ser hvilke løpere i huset.
--
-- Hovedtreneren (eier huset) ser alle gruppene og alle løperne. En
-- gruppetrener ser bare sine egne grupper og løperne i dem. Innsyn gitt på
-- huset (team_access) gjelder alle gruppene under, så en som har fått innsyn i
-- skolen slipper å få det på nytt for hver ny gruppe.
create or replace function public.is_coach_of(t uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from profiles where id = auth.uid() and role = 'coach')
     and (exists (select 1 from teams where id = t and owner_id = auth.uid())
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
       or exists (select 1 from teams g join team_access a on a.team_id = g.parent_team_id
                   where g.id = t and a.coach_id = auth.uid()))
$function$;

-- Trener i huset: eier det, eier en gruppe i det, eller har fått innsyn i det.
create or replace function public.i_huset(p_hus uuid, p_hvem uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from profiles where id = p_hvem and role = 'coach')
     and (exists (select 1 from teams where id = p_hus and owner_id = p_hvem)
       or exists (select 1 from teams where parent_team_id = p_hus and owner_id = p_hvem)
       or exists (select 1 from team_access a where a.team_id = p_hus and a.coach_id = p_hvem))
$function$;

-- Gruppene jeg er trener for i huset. Hovedtreneren får alle.
create or replace function public.hus_grupper()
returns table (id uuid, name text, er_hus boolean, eier_id uuid, eier_navn text, lopere bigint, min boolean, invite_code text)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_hus uuid := mitt_hus();
begin
  if v_hus is null then return; end if;
  return query
    select t.id, t.name, t.parent_team_id is null, t.owner_id, o.full_name,
           (select count(*) from profiles a where a.team_id = t.id and a.role = 'athlete'),
           true, t.invite_code
      from teams t left join profiles o on o.id = t.owner_id
     where (t.id = v_hus or t.parent_team_id = v_hus) and is_coach_of(t.id)
     order by t.parent_team_id nulls first, t.name;
end
$function$;

-- Løperne i gruppene jeg er trener for.
create or replace function public.hus_lopere()
returns table (id uuid, full_name text, birth_year integer, gender character, fis_code text, team_id uuid)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_hus uuid := mitt_hus();
begin
  if v_hus is null then return; end if;
  return query
    select p.id, p.full_name, p.birth_year, p.gender, p.fis_code, p.team_id
      from profiles p join teams t on t.id = p.team_id
     where p.role = 'athlete' and (t.id = v_hus or t.parent_team_id = v_hus) and is_coach_of(t.id)
     order by p.full_name;
end
$function$;

-- Gruppetrenere ser bare sine egne. Hovedtreneren kan slå på «alle ser alt».
update public.teams set coaches_see_all = false
 where parent_team_id is null and lower(name) = 'ntg lillehammer';
