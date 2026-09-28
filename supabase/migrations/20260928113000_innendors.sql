-- Innendørs anlegg.
--
-- SNØ på Lørenskog er en hall. Vær er ikke en variabel der - det er alltid det
-- samme - og å be en løper velge mellom sol, tåke og regn inne i en hall er å
-- be om enten et tilfeldig svar eller et tomt felt. Begge deler forurenser
-- statistikken: «sol» i SNØ betyr ingenting, og tomt felt kan ikke skilles fra
-- «glemte å fylle ut».
--
-- Derfor en egen verdi. Da er «innendørs» et svar, ikke et hull.

alter table public.slopes
  add column if not exists indoor boolean not null default false;

update public.slopes set indoor = true where resort = 'SNØ Lørenskog';

alter table public.training_sessions drop constraint if exists training_sessions_weather_check;
alter table public.training_sessions add constraint training_sessions_weather_check
  check (weather = any (array['sun', 'cloudy', 'flat_light', 'snow', 'fog', 'rain', 'wind', 'indoor']));
