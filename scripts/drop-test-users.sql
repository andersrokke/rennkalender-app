-- Fjerner testbrukerne fra Rennkalender.
--
-- Kjør denne før ekte brukere slippes inn i produksjon. Etterpå kan de
-- gjenopprettes når som helst med supabase/seed.sql.
--
-- Sletter: de fem brukerne på @test.rennkalender, laget de eier (Testlaget),
-- og alt som henger etter via ON DELETE CASCADE - profil, renn i planen,
-- treninger, tidtaking, foreldrekobling og påminnelser.
--
-- Rører ikke: profiler uten is_test, og lag som eies av dem.

do $$
declare
  v_ids uuid[];
  v_teams int;
  v_unexpected int;
begin
  -- Bare brukere som BÅDE har testdomenet og is_test-merket. Et av kriteriene
  -- alene er ikke nok: en ekte bruker skal aldri kunne ryke med her.
  select array_agg(u.id) into v_ids
  from auth.users u
  join public.profiles p on p.id = u.id
  where u.email like '%@test.rennkalender'
    and p.is_test;

  if v_ids is null then
    raise notice 'Ingen testbrukere å slette.';
    return;
  end if;

  -- Stopp hvis et lag som skal slettes har medlemmer utenfor testsettet.
  select count(*) into v_unexpected
  from public.profiles p
  where p.team_id in (select t.id from public.teams t where t.owner_id = any(v_ids))
    and not (p.id = any(v_ids));

  if v_unexpected > 0 then
    raise exception 'Avbryter: % profil(er) utenfor testsettet er medlem av et testlag. Flytt dem først.', v_unexpected;
  end if;

  select count(*) into v_teams from public.teams where owner_id = any(v_ids);

  delete from auth.users where id = any(v_ids);

  raise notice 'Slettet % testbruker(e) og % lag.', array_length(v_ids, 1), v_teams;
end
$$;

-- Kontroll: begge skal gi 0.
select
  (select count(*) from auth.users where email like '%@test.rennkalender') as test_users_igjen,
  (select count(*) from public.profiles where is_test) as test_profiler_igjen;
