-- Renn utenfor Norge meldes på gjennom Norges Skiforbund, og forbundets frist
-- er 20 dager før rennet. Den fristen kan regnes ut, så foreldrenes oversikt
-- slipper å si «frist ikke kjent» for alle utenlandske renn.
--
-- Rekkefølgen: iSonens frist, så trenerens, så forbundets 20 dager for renn
-- utenfor Norge. Norske renn uten frist fra iSonen eller treneren står fortsatt
-- som ukjent.

create or replace function public.pameldingsfrist(p_race integer, p_team uuid)
 returns table(frist timestamptz, kilde text)
 language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(r.signup_deadline,
                  ((tr.entry_deadline + 1)::timestamp at time zone 'Europe/Oslo'),
                  case when r.host_nation <> 'NOR'
                       then ((r.start_date - 20 + 1)::timestamp at time zone 'Europe/Oslo') end),
         case when r.signup_deadline is not null then 'isonen'
              when tr.entry_deadline is not null then 'trener'
              when r.host_nation <> 'NOR' then 'forbund' end
  from races r
  left join team_races tr on tr.race_id = r.id and tr.team_id = p_team
  where r.id = p_race
$function$;
