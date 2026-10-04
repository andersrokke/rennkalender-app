-- Påminnelser om påmeldingsfrist på e-post er slått av. Oversikten under
-- «Påmelding» i appen står igjen; ingenting sendes ut.

do $$
declare finnes boolean;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  -- Dynamisk, så blokka også lar seg kjøre der pg_cron ikke er installert.
  execute $q$select exists (select 1 from cron.job where jobname = 'entry-reminders-hourly')$q$ into finnes;
  if finnes then
    perform cron.unschedule('entry-reminders-hourly');
  end if;
end
$$;
