-- Renn en løper legger i sin egen plan skal komme opp hos treneren av seg
-- selv. Før tok team_race_athletes() bare utgangspunkt i lagets plan
-- (team_races), så en løper som ønsket seg et renn treneren ikke hadde lagt
-- inn, var usynlig for treneren.
--
-- Nå er grunnlaget lagets plan pluss alle renn løperne på laget selv har lagt
-- inn. «Kan ikke» alene gjør ikke et renn til lagets sak. Løperens lag er det
-- hun står i nå, ikke det som sto på raden da den ble skrevet.

create or replace function public.team_race_athletes()
 returns table(race_id integer, athlete_id uuid, full_name text, status athlete_status, assigned boolean, birth_year integer, gender character, fis_code text, sl numeric, gs numeric, sg numeric, dh numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with lagrenn as (
    select tr.team_id, tr.race_id from team_races tr
    union
    select p.team_id, ar.race_id
    from athlete_races ar
    join profiles p on p.id = ar.athlete_id and p.role = 'athlete'
    where p.team_id is not null and ar.status <> 'unavailable'
  )
  select r.id, p.id, p.full_name, ar.status, ar.assigned_by is not null,
         p.birth_year, p.gender, p.fis_code, f.sl, f.gs, f.sg, f.dh
  from lagrenn l
  join races r on r.id = l.race_id
  join profiles p on p.team_id = l.team_id and p.role = 'athlete'
  left join athlete_races ar on ar.athlete_id = p.id and ar.race_id = r.id
  left join fis_list_athletes f on f.fis_code = p.fis_code
  where is_coach_of(l.team_id)
  order by r.start_date, p.full_name
$function$;
