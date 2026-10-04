-- Frister som er en dato (trenerens, og forbundets 20 dager) gjaldt til midnatt
-- og ble vist som «30. okt. 00:00» når fristen er 29. oktober. De går nå ut
-- 23:59 samme dag, så datoen som vises er den som gjelder.

create or replace function public.pameldingsfrist(p_race integer, p_team uuid)
 returns table(frist timestamptz, kilde text)
 language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(r.signup_deadline,
                  ((tr.entry_deadline + time '23:59') at time zone 'Europe/Oslo'),
                  case when r.host_nation <> 'NOR'
                       then (((r.start_date - 20) + time '23:59') at time zone 'Europe/Oslo') end),
         case when r.signup_deadline is not null then 'isonen'
              when tr.entry_deadline is not null then 'trener'
              when r.host_nation <> 'NOR' then 'forbund' end
  from races r
  left join team_races tr on tr.race_id = r.id and tr.team_id = p_team
  where r.id = p_race
$function$;
