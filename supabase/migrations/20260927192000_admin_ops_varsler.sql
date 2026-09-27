-- Mislykkede varsler inn i Drift-fanen.
--
-- Feedback-varselet feilet i to døgn uten at det var synlig noe sted: raden
-- lå i basen, funksjonen svarte pent med «sent: false, mangler
-- RESEND_API_KEY», og det svaret havnet i net._http_response - en tabell
-- ingen leter i. Invitasjonene har send_error i lista si; varslene hadde
-- ingenting.
--
-- pg_net lagrer ikke hvilken URL som ble kalt, bare svaret. Derfor filtreres
-- det på innholdet: alt som ikke er 2xx, eller som selv sier at det ikke ble
-- sendt. Det er grovt, men det er nettopp de radene man vil se.

create or replace function public.admin_ops()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_jobs jsonb := '[]'::jsonb; v_varsler jsonb := '[]'::jsonb;
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;

  if to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null then
    select coalesce(jsonb_agg(x order by x->>'jobb'), '[]'::jsonb) into v_jobs from (
      select jsonb_build_object(
               'jobb', j.jobname,
               'plan', j.schedule,
               'aktiv', j.active,
               'sist', d.start_time,
               'status', d.status,
               'melding', left(coalesce(d.return_message, ''), 200)) as x
        from cron.job j
        left join lateral (
          select r.start_time, r.status, r.return_message
            from cron.job_run_details r
           where r.jobid = j.jobid
           order by r.start_time desc limit 1
        ) d on true
    ) q;
  end if;

  -- Tabellen eies av pg_net og finnes ikke i et lokalt prosjekt uten
  -- utvidelsen. Mangler den, står lista tom i stedet for at hele siden feiler.
  if to_regclass('net._http_response') is not null then
    begin
      select coalesce(jsonb_agg(x order by x->>'nar' desc), '[]'::jsonb) into v_varsler from (
        select jsonb_build_object(
                 'nar', r.created,
                 'status', r.status_code,
                 'svar', left(coalesce(r.error_msg, r.content, ''), 300)) as x
          from net._http_response r
         where r.created > now() - interval '7 days'
           and (r.status_code is null
                or r.status_code >= 300
                or r.content like '%"sent": false%'
                or r.content like '%"ok": false%')
         order by r.created desc
         limit 10
      ) q;
    exception when others then
      v_varsler := '[]'::jsonb;
    end;
  end if;

  return jsonb_build_object(
    'jobber', v_jobs,
    'varsler', v_varsler,
    'fis_liste',    (select max(imported_at) from fis_lists),
    'cupstilling',  (select max(fetched_at) from fis_cup_standings),
    'isonen',       (select max(counted_at) from race_signups),
    'renn',         (select count(*) from races),
    'bakker',       (select count(*) from slopes),
    'fis_lopere',   (select count(*) from fis_list_athletes)
  );
end
$function$;

revoke all on function public.admin_ops() from public, anon;
grant execute on function public.admin_ops() to authenticated, service_role;
