-- Påmelding for foreldre: en samlet oversikt over barnas renn med frist og
-- påmeldingsstatus, og varsler på e-post sju dager og ett døgn før fristen.
--
-- Fristen er den iSonen oppgir. Finnes ikke den, brukes fristen treneren har
-- satt i lagets plan (til dagens slutt, norsk tid). Uten noen av dem er
-- fristen ukjent, og da sendes det ikke varsel.

-- En forelder kan slå varslene av for seg selv.
alter table public.profiles add column if not exists entry_alerts boolean not null default true;

-- To varsler per renn i stedet for ett.
alter table public.entry_reminders add column if not exists kind text not null default 'd1';
alter table public.entry_reminders drop constraint if exists entry_reminders_kind_check;
alter table public.entry_reminders add constraint entry_reminders_kind_check check (kind in ('d7', 'd1'));
alter table public.entry_reminders drop constraint if exists entry_reminders_pkey;
alter table public.entry_reminders add constraint entry_reminders_pkey primary key (athlete_id, race_id, kind);

-- Fristen for et renn slik en gitt løper skal forholde seg til den.
create or replace function public.pameldingsfrist(p_race integer, p_team uuid)
 returns table(frist timestamptz, kilde text)
 language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(r.signup_deadline, ((tr.entry_deadline + 1)::timestamp at time zone 'Europe/Oslo')),
         case when r.signup_deadline is not null then 'isonen' when tr.entry_deadline is not null then 'trener' end
  from races r
  left join team_races tr on tr.race_id = r.id and tr.team_id = p_team
  where r.id = p_race
$function$;
revoke all on function public.pameldingsfrist(integer, uuid) from public, anon, authenticated;
grant execute on function public.pameldingsfrist(integer, uuid) to service_role;

-- Hvem som mangler på deltakerlista når fristen nærmer seg. Returtypen har
-- fått «kind», så funksjonen må lages på nytt.
drop function if exists public.entry_gaps();
create function public.entry_gaps()
 returns table(athlete_id uuid, athlete_name text, email text, fis_code text, race_id integer, place text,
   start_date date, deadline timestamptz, certainty text, guardian_emails text[], kind text)
 language sql stable security definer set search_path to 'public'
as $function$
  with latest as (
    select race_id, max(batch) as b from race_entries group by race_id
  ), entered as (
    select e.race_id, e.fis_code from race_entries e join latest l
      on l.race_id = e.race_id and l.b = e.batch where e.fis_code is not null
  ), kandidat as (
    select p.id, p.full_name, u.email, p.fis_code, r.id as race_id, r.place, r.start_date, f.frist,
      case when l.race_id is null then 'unknown' else 'missing' end as certainty,
      case when f.frist <= now() + interval '24 hours' then 'd1' else 'd7' end as kind
    from athlete_races ar
    join profiles p on p.id = ar.athlete_id
    join auth.users u on u.id = p.id
    join races r on r.id = ar.race_id
    cross join lateral public.pameldingsfrist(r.id, p.team_id) f
    left join latest l on l.race_id = r.id
    where ar.status in ('wish', 'planned', 'entered')
      and f.frist between now() and now() + interval '7 days'
      and not exists (select 1 from entered e where e.race_id = r.id and e.fis_code = p.fis_code)
  )
  select k.id, k.full_name, k.email, k.fis_code, k.race_id, k.place, k.start_date, k.frist, k.certainty,
    array(select gu.email from guardians g
          join profiles gp on gp.id = g.parent_id and gp.entry_alerts
          join auth.users gu on gu.id = g.parent_id
          where g.athlete_id = k.id),
    k.kind
  from kandidat k
  where not exists (select 1 from entry_reminders er
                    where er.athlete_id = k.id and er.race_id = k.race_id and er.kind = k.kind)
$function$;
revoke all on function public.entry_gaps() from public, anon, authenticated;
grant execute on function public.entry_gaps() to service_role;

-- Foreldrenes oversikt: ett svar med alle barnas kommende renn, fristen og om
-- barnet står på deltakerlista. Svarer bare for barn man er koblet til.
create or replace function public.barnas_pamelding()
 returns table(athlete_id uuid, athlete_name text, race_id integer, place text, host_nation text,
   start_date date, end_date date, events text, category text, status text, i_lagets_plan boolean,
   frist timestamptz, frist_kilde text, pa_lista boolean, lista_kjent boolean, isonen_id text, fis_event_id integer)
 language sql stable security definer set search_path to 'public'
as $function$
  with barn as (
    select p.id, p.full_name, p.team_id, p.fis_code
    from guardians g join profiles p on p.id = g.athlete_id
    where g.parent_id = auth.uid()
  ), renn as (
    select b.id as athlete_id, ar.race_id from barn b join athlete_races ar on ar.athlete_id = b.id
    where ar.status <> 'unavailable'
    union
    select b.id, tr.race_id from barn b join team_races tr on tr.team_id = b.team_id
    where not exists (select 1 from athlete_races ar
                      where ar.athlete_id = b.id and ar.race_id = tr.race_id and ar.status = 'unavailable')
  ), latest as (
    select race_id, max(batch) as b from race_entries group by race_id
  )
  select b.id, b.full_name, r.id, r.place, r.host_nation::text, r.start_date, r.end_date, r.events, r.category,
    ar.status::text,
    exists (select 1 from team_races tr where tr.team_id = b.team_id and tr.race_id = r.id),
    f.frist, f.kilde,
    exists (select 1 from race_entries e join latest l on l.race_id = e.race_id and l.b = e.batch
            where e.race_id = r.id and e.fis_code is not null and e.fis_code = b.fis_code),
    exists (select 1 from latest l where l.race_id = r.id),
    r.isonen_id, r.fis_event_id
  from renn x
  join barn b on b.id = x.athlete_id
  join races r on r.id = x.race_id
  left join athlete_races ar on ar.athlete_id = b.id and ar.race_id = r.id
  cross join lateral public.pameldingsfrist(r.id, b.team_id) f
  where r.end_date >= current_date
  order by r.start_date, b.full_name
$function$;
revoke all on function public.barnas_pamelding() from public, anon;
grant execute on function public.barnas_pamelding() to authenticated, service_role;
