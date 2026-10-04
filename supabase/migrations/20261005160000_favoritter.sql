-- Favoritter som egen fane: løpere man følger, satt opp mot egne løpere.
--
-- fis_sok finner løpere på navn eller FIS-kode i den gjeldende FIS-lista, så
-- man slipper å kunne koden. favoritt_tabell gir én rad per løper man følger
-- og per egen løper (seg selv for en løper, løperne på lagene for en trener),
-- med poeng og rangering i hver gren.

create or replace function public.fis_sok(q text)
 returns table(fis_code text, first_name text, last_name text, club text, nation text, birth_year integer, gender text,
   sl numeric, gs numeric, sg numeric, dh numeric)
 language sql stable security definer set search_path to 'public'
as $function$
  with ord as (
    -- Samme forenkling som name_key i lista: små bokstaver, uten nordiske tegn.
    -- replace i stedet for translate: translate regner tegn for tegn og gir
    -- feil når databasen ikke er satt opp med UTF-8.
    select regexp_split_to_table(
      trim(regexp_replace(lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(q, ''), 'æ', 'ae'), 'Æ', 'ae'), 'ø', 'o'), 'Ø', 'o'), 'ö', 'o'), 'Ö', 'o'), 'å', 'a'), 'Å', 'a'), 'ä', 'a'), 'Ä', 'a'), 'é', 'e'), 'É', 'e'), 'è', 'e'), 'È', 'e'), 'ü', 'u'), 'Ü', 'u')), '[^a-z0-9 ]+', ' ', 'g')), '\s+') as o
  )
  select l.fis_code, l.first_name, l.last_name, l.club, l.nation, l.birth_year, l.gender::text, l.sl, l.gs, l.sg, l.dh
  from fis_list_athletes l
  where length(trim(coalesce(q, ''))) >= 3
    and (l.fis_code = trim(q)
      or not exists (select 1 from ord where o <> '' and l.name_key not like '%' || o || '%'))
  order by (l.fis_code = trim(q)) desc, l.last_name, l.first_name
  limit 25
$function$;
revoke all on function public.fis_sok(text) from public, anon;
grant execute on function public.fis_sok(text) to authenticated, service_role;

create or replace function public.favoritt_tabell()
 returns table(fis_code text, navn text, club text, nation text, birth_year integer, gender text,
   sl numeric, gs numeric, sg numeric, dh numeric, sl_pos integer, gs_pos integer, sg_pos integer, dh_pos integer,
   egen boolean, favoritt boolean)
 language sql stable security definer set search_path to 'public'
as $function$
  with egne as (
    select p.fis_code, max(p.full_name) as full_name
    from profiles p
    where p.fis_code is not null
      and (p.id = auth.uid()
        or (p.role = 'athlete' and p.team_id is not null and is_coach_of(p.team_id)))
    group by p.fis_code
  ), fav as (
    select f.fis_code from follows f where f.user_id = auth.uid()
  ), alle as (
    select coalesce(e.fis_code, f.fis_code) as fis_code, e.full_name,
           e.fis_code is not null as egen, f.fis_code is not null as favoritt
    from egne e full join fav f on f.fis_code = e.fis_code
  )
  select a.fis_code,
    coalesce(a.full_name, nullif(trim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')), ''), a.fis_code),
    l.club, l.nation, l.birth_year, l.gender::text,
    l.sl, l.gs, l.sg, l.dh, l.sl_pos, l.gs_pos, l.sg_pos, l.dh_pos,
    a.egen, a.favoritt
  from alle a
  left join fis_list_athletes l on l.fis_code = a.fis_code
$function$;
revoke all on function public.favoritt_tabell() from public, anon;
grant execute on function public.favoritt_tabell() to authenticated, service_role;
