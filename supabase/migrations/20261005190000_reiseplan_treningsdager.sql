-- Reiseplanen per renn:
--
-- 1. Reisemåten hadde «egen bil» som standard i tabellen. Da ble et renn i
--    lagets plan regnet som egen bil så snart det fantes en rad for rennet
--    (for eksempel fordi en forelder hadde ført flypris). Uten valg er feltet
--    nå tomt, og appen avgjør: med laget for lagets renn, egen bil ellers.
-- 2. Treningsdager før rennet: løpere drar ofte noen dager i forkant for å
--    trene der de skal kjøre. Dagene gir heiskort og overnatting.

alter table public.race_plan_details alter column travel_mode drop default;
alter table public.race_plan_details alter column travel_mode drop not null;

alter table public.race_plan_details add column if not exists training_days integer not null default 0;
alter table public.race_plan_details drop constraint if exists race_plan_details_training_days_check;
alter table public.race_plan_details add constraint race_plan_details_training_days_check check (training_days between 0 and 30);
