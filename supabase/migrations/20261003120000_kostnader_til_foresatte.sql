-- Kostnadene flyttes til foreldresiden.
--
-- Hva en reise koster er de foresattes anliggende, ikke løperens. Løperen
-- planlegger hvor hun skal og hvordan hun reiser; de voksne ser hva det koster
-- og setter sine egne satser. Satsene (kilometer, hotell, startavgift,
-- heiskort) lagres derfor på den foresattes egen profil, og krever ingen ny
-- rettighet.
--
-- Flyprisen er det eneste kostnadsfeltet som ligger på løperens rad, per
-- renn. Løperen fører den ikke lenger, så den foresatte må kunne. Det går
-- gjennom én funksjon som bare rører det ene feltet - ikke en skriveregel på
-- hele tabellen, som ville latt en foresatt endre reisemåte og netter også.
create or replace function public.sett_flypris(p_athlete uuid, p_race integer, p_cost numeric)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not is_guardian_of(p_athlete) then
    raise exception 'Bare foresatte kan føre flypris';
  end if;
  if p_cost is not null and (p_cost < 0 or p_cost > 100000) then
    raise exception 'Ugyldig beløp';
  end if;
  insert into race_plan_details (athlete_id, race_id, flight_cost, updated_at)
  values (p_athlete, p_race, p_cost, now())
  on conflict (athlete_id, race_id)
    do update set flight_cost = excluded.flight_cost, updated_at = now();
end
$function$;

revoke all on function public.sett_flypris(uuid, integer, numeric) from public, anon;
grant execute on function public.sett_flypris(uuid, integer, numeric) to authenticated, service_role;
