-- Far East Cup hentes fra FIS-kalenderen hver natt, i stedet for å legges inn
-- for hånd. Edge-funksjonen fis-calendar legger inn nye arrangementer, flytter
-- datoer som er endret og merker avlyste. Den sletter aldri noe.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning 'pg_cron er ikke tilgjengelig, hopper over planlegging av fis-calendar';
    return;
  end if;

  -- 04:30 UTC, før de andre FIS-jobbene.
  perform cron.schedule('fis-calendar-daily', '30 4 * * *',
    $job$select public.invoke_edge_function('fis-calendar', '{}'::jsonb, 120000)$job$);
end
$$;
