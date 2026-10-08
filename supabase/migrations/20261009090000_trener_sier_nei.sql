-- Treneren kan si nei til et renn, og skrive en kommentar til én løper om ett
-- renn. Før kunne treneren bare si ja; et ønske treneren ikke ville innfri
-- ble stående som «venter på trener» for alltid.
alter table public.athlete_races add column if not exists coach_declined_at timestamptz;

-- Trenerens felt er trenerens, også det nye.
create or replace function public.athlete_races_vern()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user in ('authenticated', 'anon') and auth.uid() = new.athlete_id then
    if tg_op = 'INSERT' then
      new.assigned_by := null; new.assigned_at := null; new.coach_note := null; new.coach_declined_at := null;
    else
      new.assigned_by := old.assigned_by; new.assigned_at := old.assigned_at; new.coach_note := old.coach_note;
      new.coach_declined_at := old.coach_declined_at;
    end if;
    new.answered_at := coalesce(new.answered_at, now());
  end if;
  return new;
end
$function$;

-- Nei gjelder bare rader som finnes: det er svaret på et ønske. Et ja
-- (assign_race) opphever et nei.
create or replace function public.decline_race(p_race_id integer, p_athletes uuid[], p_note text default null, p_on boolean default true)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare t uuid; n int;
begin
  select team_id into t from profiles where id = auth.uid();
  if t is null or not is_coach_of(t) then raise exception 'Bare trener kan svare nei'; end if;
  update athlete_races ar set
      coach_declined_at = case when p_on then now() else null end,
      assigned_by = case when p_on then null else assigned_by end,
      assigned_at = case when p_on then null else assigned_at end,
      coach_note = coalesce(nullif(btrim(p_note), ''), coach_note)
    from profiles p
   where ar.athlete_id = p.id and ar.race_id = p_race_id and ar.athlete_id = any(p_athletes)
     and p.role = 'athlete' and is_coach_of(p.team_id);
  get diagnostics n = row_count;
  return n;
end
$function$;

create or replace function public.assign_race(p_race_id integer, p_athletes uuid[])
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare t uuid; n int := 0; a uuid;
begin
  select team_id into t from profiles where id = auth.uid();
  if t is null or not is_coach_of(t) then raise exception 'Bare trener kan tildele renn'; end if;
  foreach a in array p_athletes loop
    if exists (select 1 from profiles p where p.id = a and p.team_id = t and p.role = 'athlete') then
      insert into athlete_races (athlete_id, race_id, team_id, status, assigned_by, assigned_at)
      values (a, p_race_id, t, 'planned', auth.uid(), now())
      on conflict (athlete_id, race_id) do update
        -- leave status alone: wish, unavailable and entered all stand
        set assigned_by = auth.uid(), assigned_at = now(), coach_declined_at = null;
      n := n + 1;
    end if;
  end loop;
  return n;
end $function$;

-- Kommentar fra treneren til én løper om ett renn. Tom tekst fjerner den.
create or replace function public.coach_race_note(p_race_id integer, p_athlete uuid, p_note text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n int;
begin
  update athlete_races ar set coach_note = nullif(btrim(coalesce(p_note, '')), '')
    from profiles p
   where ar.athlete_id = p.id and ar.race_id = p_race_id and ar.athlete_id = p_athlete
     and p.role = 'athlete' and is_coach_of(p.team_id);
  get diagnostics n = row_count;
  return n > 0;
end
$function$;

do $$
declare f text;
begin
  foreach f in array array['decline_race(integer, uuid[], text, boolean)', 'coach_race_note(integer, uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

drop function if exists public.team_race_athletes();
create function public.team_race_athletes()
 returns table(race_id integer, athlete_id uuid, full_name text, status athlete_status, assigned boolean, birth_year integer, gender character, fis_code text, sl numeric, gs numeric, sg numeric, dh numeric,
               answered boolean, athlete_note text, coach_note text, declined boolean)
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
         p.birth_year, p.gender, p.fis_code, f.sl, f.gs, f.sg, f.dh,
         ar.answered_at is not null, ar.athlete_note, ar.coach_note, ar.coach_declined_at is not null
  from lagrenn l
  join races r on r.id = l.race_id
  join profiles p on p.team_id = l.team_id and p.role = 'athlete'
  left join athlete_races ar on ar.athlete_id = p.id and ar.race_id = r.id
  left join fis_list_athletes f on f.fis_code = p.fis_code
  where is_coach_of(l.team_id)
  order by r.start_date, p.full_name
$function$;
revoke all on function public.team_race_athletes() from public, anon;
grant execute on function public.team_race_athletes() to authenticated, service_role;
