-- Tidtaking som ble lastet opp før løperen registrerte seg, kobles til henne
-- i det hun kommer inn på laget.
--
-- Treneren laster opp Brower- og HC Timing-filer med navn som «Hugo» eller
-- «ETTERNAVN Fornavn». Løpere som ikke finnes i appen ennå, blir liggende
-- ukoblet. Når en slik løper senere registrerer seg og havner på laget (eller
-- i en gruppe under huset), kobles løpene hennes - men bare når navnet peker
-- på nøyaktig én løper i huset. Da huskes navnet også (timing_aliases), så
-- neste opplasting kobler av seg selv.

-- Navnet i fila mot navnet i appen. Tre former godtas:
--   «Hugo» / «Ole Magnus»      - fornavnet, eller fornavnene, som starten av navnet
--   «Ole Magnus Hansen»        - hele navnet
--   «HANSEN Ole Magnus»        - HC Timing: etternavnet først
create or replace function public.tidtaking_navn_passer(p_kilde text, p_fullt text)
returns boolean
language sql immutable
as $function$
  select p_kilde is not null and p_fullt is not null and (
       lower(btrim(p_fullt)) = lower(btrim(p_kilde))
    or lower(btrim(p_fullt)) like lower(btrim(p_kilde)) || ' %'
    or lower(regexp_replace(btrim(p_fullt), '^(.*) (\S+)$', '\2 \1')) = lower(btrim(p_kilde))
  )
$function$;

create or replace function public.koble_tidtaking_til_loper(p_athlete uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_team uuid; v_hus uuid; v_navn text; n int := 0;
begin
  select p.team_id, p.full_name, coalesce(t.parent_team_id, t.id)
    into v_team, v_navn, v_hus
    from profiles p join teams t on t.id = p.team_id
   where p.id = p_athlete and p.role = 'athlete';
  if v_team is null or v_navn is null then return 0; end if;

  -- Løpene som kan være hennes: lastet opp på laget hennes eller på huset.
  with kandidat as (
    select distinct r.team_id, r.source_name
      from timing_runs r
     where r.athlete_id is null and r.team_id in (v_team, v_hus)
       and tidtaking_navn_passer(r.source_name, v_navn)
       -- Bare når ingen annen løper i huset også passer på navnet.
       and not exists (
         select 1 from profiles o join teams ot on ot.id = o.team_id
          where o.id <> p_athlete and o.role = 'athlete'
            and (ot.id = v_hus or ot.parent_team_id = v_hus or ot.id = v_team)
            and tidtaking_navn_passer(r.source_name, o.full_name))
  ),
  oppdatert as (
    update timing_runs r set athlete_id = p_athlete
      from kandidat k
     where r.athlete_id is null and r.team_id = k.team_id and r.source_name = k.source_name
    returning r.id
  )
  select count(*) into n from oppdatert;

  insert into timing_aliases (team_id, source_name, athlete_id)
  select distinct r.team_id, r.source_name, p_athlete
    from timing_runs r
   where r.athlete_id = p_athlete and r.team_id in (v_team, v_hus)
  on conflict (team_id, source_name) do update set athlete_id = excluded.athlete_id;

  return n;
end
$function$;
revoke all on function public.koble_tidtaking_til_loper(uuid) from public, anon, authenticated;
grant execute on function public.koble_tidtaking_til_loper(uuid) to service_role;

-- Kjøres når en løper får et lag, eller bytter lag.
create or replace function public.profiles_koble_tidtaking()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.role = 'athlete' and new.team_id is not null
     and (tg_op = 'INSERT' or new.team_id is distinct from old.team_id or new.full_name is distinct from old.full_name) then
    perform koble_tidtaking_til_loper(new.id);
  end if;
  return new;
end
$function$;
drop trigger if exists profiles_koble_tidtaking on public.profiles;
create trigger profiles_koble_tidtaking after insert or update of team_id, full_name, role on public.profiles
  for each row execute function public.profiles_koble_tidtaking();

-- Og én gang nå, for dem som alt er inne.
do $$
declare p record;
begin
  for p in select id from profiles where role = 'athlete' and team_id is not null loop
    perform koble_tidtaking_til_loper(p.id);
  end loop;
end $$;
