-- Fem steder som FIS-resultatene nevner, men som manglet koordinater, så
-- været på renndagen ikke kunne hentes. Navnene står slik FIS skriver dem,
-- der appen alt finner den nordiske skrivemåten (Saelen = Sälen).
insert into public.venues (name, country, lat, lng)
select v.name, v.country, v.lat, v.lng
  from (values
    ('Sälen', 'SWE', 61.16, 13.26),
    ('Raudalen', 'NOR', 61.27, 8.90),
    ('Wyller', 'NOR', 59.985, 10.66),
    ('Mt Hutt', 'NZL', -43.47, 171.53),
    ('Coronet Peak', 'NZL', -44.92, 168.73)
  ) as v(name, country, lat, lng)
 where not exists (select 1 from public.venues x where lower(x.name) = lower(v.name) and x.country = v.country);

-- Renndagene som ble merket «ikke funnet» prøves på nytt i natt.
delete from public.race_weather where not funnet;
