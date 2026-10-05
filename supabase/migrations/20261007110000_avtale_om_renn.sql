-- Dialogen om hvilke renn en løper skal kjøre.
--
-- Raden i athlete_races bærer to stemmer: løperens (status) og trenerens
-- (assigned_by). Det manglet en måte å se om løperen faktisk har svart: en
-- tildeling fra treneren oppretter raden som «planned», og det så likt ut som
-- at løperen selv hadde valgt «skal kjøre».
--
-- answered_at settes når løperen selv velger noe. Da kan alle tre - trener,
-- løper og forelder - se det samme:
--   løper ja, trener ja      -> avtalt
--   løper ja, trener ikke    -> venter på trener
--   trener ja, løper ikke    -> venter på løper
alter table public.athlete_races add column if not exists answered_at timestamptz;

-- Alt som ikke er en ubesvart tildeling er noe løperen har valgt selv.
update public.athlete_races
   set answered_at = coalesce(updated_at, now())
 where answered_at is null and (assigned_by is null or status <> 'planned');

-- Trenerens del av raden er trenerens. Løperen kunne før skrive assigned_by
-- og coach_note på sin egen rad, og dermed «godkjenne» seg selv.
create or replace function public.athlete_races_vern()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user in ('authenticated', 'anon') and auth.uid() = new.athlete_id then
    if tg_op = 'INSERT' then
      new.assigned_by := null; new.assigned_at := null; new.coach_note := null;
    else
      new.assigned_by := old.assigned_by; new.assigned_at := old.assigned_at; new.coach_note := old.coach_note;
    end if;
    -- Løperen har svart i det hun skriver raden sin.
    new.answered_at := coalesce(new.answered_at, now());
  end if;
  return new;
end
$function$;

drop trigger if exists athlete_races_vern on public.athlete_races;
create trigger athlete_races_vern before insert or update on public.athlete_races
  for each row execute function public.athlete_races_vern();

-- Treneren får med om løperen har svart, og notatene fra begge.
drop function if exists public.team_race_athletes();
create function public.team_race_athletes()
 returns table(race_id integer, athlete_id uuid, full_name text, status athlete_status, assigned boolean, birth_year integer, gender character, fis_code text, sl numeric, gs numeric, sg numeric, dh numeric,
               answered boolean, athlete_note text, coach_note text)
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
         ar.answered_at is not null, ar.athlete_note, ar.coach_note
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
