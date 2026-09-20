-- Cron-jobbene som drifter appen, lagt i git slik at de kan gjenskapes.
--
-- Bakgrunn: jobbene ble opprettet direkte i produksjon, og hver enkelt hadde
-- anon-nøkkelen skrevet rett inn i jobbdefinisjonen. Nøkkelen lå dermed i
-- klartekst i cron.job, som alle med tilgang til databasen kan lese. Her leses
-- den i stedet fra Vault gjennom én felles hjelpefunksjon.
--
-- Før denne migrasjonen kjøres må hemmelighetene finnes i Vault. Se
-- scripts/bootstrap-cron-secrets.sql og docs/DRIFT.md.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- ---------------------------------------------------------------------------
-- Felles hjelpefunksjon
--
-- Henter prosjekt-URL og nøkkel fra Vault og kaller edge-funksjonen.
-- Mangler hemmelighetene (typisk et lokalt `supabase db reset`) logges en
-- warning og jobben gjør ingenting, i stedet for å feile.
-- ---------------------------------------------------------------------------
create or replace function public.invoke_edge_function(
  p_slug text,
  p_body jsonb default '{}'::jsonb,
  p_timeout_ms integer default 60000
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_url text;
  v_key text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'cron_anon_key';

  if v_url is null or v_key is null then
    raise warning 'invoke_edge_function(%): mangler vault-hemmeligheten project_url eller cron_anon_key, hopper over kallet', p_slug;
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || p_slug,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := p_body,
    timeout_milliseconds := p_timeout_ms
  ) into v_request_id;

  return v_request_id;
end
$function$;

-- Funksjonen kan poste til hvilken som helst edge-funksjon med en gyldig
-- nøkkel. Bare postgres (som cron kjører som) skal nå den.
revoke all on function public.invoke_edge_function(text, jsonb, integer) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Jobbene
--
-- cron.schedule oppdaterer en jobb med samme navn, så denne blokka er trygg å
-- kjøre om igjen. Tidene er UTC.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning 'pg_cron er ikke tilgjengelig, hopper over planlegging av cron-jobber';
    return;
  end if;

  -- 04:45 UTC: henter nyeste FIS-punktliste (zip) inn i fis_list_athletes
  perform cron.schedule('fis-list-import-daily', '45 4 * * *',
    $job$select public.invoke_edge_function('fis-list-import', '{}'::jsonb, 170000)$job$);

  -- 05:00 UTC: teller påmeldte i iSonen og kobler renn til iSonen-arrangement
  perform cron.schedule('isonen-signups-daily', '0 5 * * *',
    $job$select public.invoke_edge_function('isonen-signups', '{}'::jsonb, 120000)$job$);

  -- 05:15 UTC: henter cupstillinger for inneværende sesong
  perform cron.schedule('fis-cup-standings-daily', '15 5 * * *',
    $job$select public.invoke_edge_function('fis-cup-standings', '{"season":"2027"}'::jsonb, 170000)$job$);

  -- 05:30 UTC: oppdaterer FIS-profiler, poeng og resultater for fulgte løpere
  perform cron.schedule('fis-athlete-daily', '30 5 * * *',
    $job$select public.invoke_edge_function('fis-athlete', '{}'::jsonb, 120000)$job$);

  -- :05 hver time: sender påminnelse om påmeldingsfrist som går ut om under et døgn
  perform cron.schedule('entry-reminders-hourly', '5 * * * *',
    $job$select public.invoke_edge_function('entry-reminders', '{}'::jsonb, 60000)$job$);
end
$$;
