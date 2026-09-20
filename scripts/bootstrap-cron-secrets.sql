-- Legger hemmelighetene cron-jobbene trenger inn i Supabase Vault.
--
-- Kjøres ÉN gang per prosjekt, FØR migrasjonen
-- supabase/migrations/20260920095646_cron_jobs_via_vault.sql.
--
-- Rekkefølgen er viktig: den gamle jobbdefinisjonen er stedet nøkkelen ligger i
-- dag. Kjører du migrasjonen først, skrives den over og nøkkelen er borte.
--
-- Skriptet plukker nøkkelen rett ut av cron.job og legger den i Vault uten at
-- den vises på skjermen. Finnes det ingen gammel jobb å hente fra (nytt eller
-- lokalt prosjekt), settes cron_anon_key manuelt - se nederst.

do $$
declare
  v_key text;
  v_url text;
begin
  -- Prosjekt-URL. Endre denne hvis skriptet kjøres mot et annet prosjekt.
  v_url := 'https://hggzbixirdaamvkjvgul.supabase.co';

  if not exists (select 1 from vault.secrets where name = 'project_url') then
    perform vault.create_secret(v_url, 'project_url', 'Supabase prosjekt-URL brukt av cron-jobbene');
    raise notice 'Opprettet vault-hemmeligheten project_url.';
  else
    raise notice 'project_url finnes allerede, lar den stå.';
  end if;

  if exists (select 1 from vault.secrets where name = 'cron_anon_key') then
    raise notice 'cron_anon_key finnes allerede, lar den stå.';
    return;
  end if;

  select (regexp_match(command, 'Bearer\s+([A-Za-z0-9._-]+)'))[1]
    into v_key
  from cron.job
  where command ~ 'Bearer\s+[A-Za-z0-9._-]+'
  limit 1;

  if v_key is null then
    raise exception using
      message = 'Fant ingen Bearer-nøkkel i cron.job.',
      hint    = 'Sett den manuelt: select vault.create_secret(''<anon key>'', ''cron_anon_key'', ''...'');';
  end if;

  perform vault.create_secret(v_key, 'cron_anon_key', 'Anon-nøkkel cron-jobbene bruker mot edge-funksjonene');
  raise notice 'Opprettet vault-hemmeligheten cron_anon_key fra eksisterende jobbdefinisjon.';
end
$$;

-- Kontroll: skal gi to rader, uten at verdiene vises.
select name, description, created_at from vault.secrets where name in ('project_url', 'cron_anon_key') order by name;

-- Manuelt alternativ, for et nytt prosjekt uten gamle jobber:
--
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url',    'Supabase prosjekt-URL brukt av cron-jobbene');
--   select vault.create_secret('<anon key>',                'cron_anon_key',  'Anon-nøkkel cron-jobbene bruker mot edge-funksjonene');
--
-- Bytte nøkkel senere:
--
--   select vault.update_secret(id, '<ny anon key>') from vault.secrets where name = 'cron_anon_key';
