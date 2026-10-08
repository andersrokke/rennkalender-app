-- Tidtaking kobles alltid i basen, ikke bare i skjemaet.
--
-- Treneren ser forslagene i opplastingen, men det som til slutt avgjør er
-- raden som lagres. Her kobles hvert løp som kommer inn uten løper: først mot
-- navn treneren har koblet før (timing_aliases), så mot én entydig løper i
-- laget eller huset. Da er det likt uansett hvilken vei fila kom inn.
create or replace function public.tidtaking_navn_passer(p_kilde text, p_fullt text)
returns boolean
language sql immutable
set search_path to 'public'
as $function$
  select p_kilde is not null and p_fullt is not null and (
       lower(btrim(p_fullt)) = lower(btrim(p_kilde))
    or lower(btrim(p_fullt)) like lower(btrim(p_kilde)) || ' %'
    or lower(regexp_replace(btrim(p_fullt), '^(.*) (\S+)$', '\2 \1')) = lower(btrim(p_kilde))
  )
$function$;

create or replace function public.timing_runs_koble()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_hus uuid; v_id uuid; n int;
begin
  if new.athlete_id is not null or new.source_name is null or new.source_name like '#%' then return new; end if;
  select coalesce(parent_team_id, id) into v_hus from teams where id = new.team_id;

  -- Husket av treneren, på dette laget eller på huset.
  select a.athlete_id into v_id from timing_aliases a
   where a.source_name = new.source_name and a.team_id in (new.team_id, v_hus)
   order by (a.team_id = new.team_id) desc limit 1;
  if v_id is not null then new.athlete_id := v_id; return new; end if;

  -- Ellers: nøyaktig én løper i huset som navnet passer på.
  select count(*), min(p.id::text)::uuid into n, v_id
    from profiles p join teams t on t.id = p.team_id
   where p.role = 'athlete' and (t.id = v_hus or t.parent_team_id = v_hus or t.id = new.team_id)
     and tidtaking_navn_passer(new.source_name, p.full_name);
  if n = 1 then new.athlete_id := v_id; end if;
  return new;
end
$function$;
revoke all on function public.timing_runs_koble() from public, anon, authenticated;
drop trigger if exists timing_runs_koble on public.timing_runs;
create trigger timing_runs_koble before insert on public.timing_runs
  for each row execute function public.timing_runs_koble();

-- Triggerfunksjoner skal ikke kunne kalles som API.
revoke all on function public.athlete_races_vern() from public, anon, authenticated;
revoke all on function public.profiles_koble_tidtaking() from public, anon, authenticated;

-- Indekser på fremmednøklene som spørres mest.
create index if not exists athlete_races_race_idx on public.athlete_races (race_id);
create index if not exists athlete_races_team_idx on public.athlete_races (team_id);
create index if not exists profiles_team_idx on public.profiles (team_id);
create index if not exists team_races_race_idx on public.team_races (race_id);
create index if not exists timing_imports_team_idx on public.timing_imports (team_id);
create index if not exists races_venue_idx on public.races (venue_id);
create index if not exists guardians_athlete_idx on public.guardians (athlete_id);
