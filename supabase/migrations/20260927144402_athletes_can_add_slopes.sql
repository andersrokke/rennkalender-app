-- Bakkeregisteret var oppslagsverk: hentet fra OpenStreetMap, lesbart for
-- alle, skrivbart for ingen. Men OSM kjenner ikke hver eneste bakke, og en
-- løper som trente et sted som ikke fantes i lista måtte skrive fritekst -
-- som verken kan summeres eller bære en vanskelighetsgrad.
--
-- Nå kan løperen legge til det som mangler. source skiller hva som kom fra
-- OSM og hva folk har lagt inn selv, så de to aldri blandes.

alter table public.slopes
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.slopes drop constraint if exists slopes_source_check;
alter table public.slopes add constraint slopes_source_check
  check (source = any (array['openstreetmap', 'user']));

-- Alle ser alt: legger én inn «Nedre Olympiabakke», slipper resten av laget
-- å legge den inn på nytt. Unik (resort, name) hindrer duplikater.
drop policy if exists "slopes insert own" on public.slopes;
create policy "slopes insert own" on public.slopes as permissive for insert to authenticated
  with check (source = 'user' and created_by = auth.uid());

-- Egne rader kan rettes. OSM-rader kan ingen røre gjennom API-et, og ingen
-- kan gjøre en egen rad om til en OSM-rad.
drop policy if exists "slopes update own" on public.slopes;
create policy "slopes update own" on public.slopes as permissive for update to authenticated
  using (source = 'user' and created_by = auth.uid())
  with check (source = 'user' and created_by = auth.uid());
