-- World Cup skal ikke være i kalenderen. De 23 rennene kom inn da alle renn i
-- alpelandene ble hentet fra FIS; ingen av dem ligger i noen plan.
-- fis-calendar hopper over WC fra nå av. Renn som likevel står i en løpers
-- eller et lags plan får stå, så ingen plan mister et renn.

delete from public.races r
where 'WC' = any(string_to_array(r.category, ' • '))
  and not exists (select 1 from public.athlete_races a where a.race_id = r.id)
  and not exists (select 1 from public.team_races t where t.race_id = r.id);
