-- Søket fant ikke «Røkke»: FIS skriver ø som oe, å som aa og ä som ae
-- («ROEKKE», «BRAATHEN»), mens søket gjorde ø til o. Hvert ord prøves nå i
-- begge skrivemåter, så både «røkke», «rokke» og «roekke» treffer.

create or replace function public.fis_sok(q text)
 returns table(fis_code text, first_name text, last_name text, club text, nation text, birth_year integer, gender text,
   sl numeric, gs numeric, sg numeric, dh numeric)
 language sql stable security definer set search_path to 'public'
as $function$
  with raa as (
    select regexp_split_to_table(trim(coalesce(q, '')), '\s+') as o
  ), ord as (
    -- replace i stedet for translate: translate regner tegn for tegn og gir
    -- feil når databasen ikke er satt opp med UTF-8.
    select regexp_replace(lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(o, 'æ', 'ae'), 'Æ', 'ae'), 'ø', 'o'), 'Ø', 'o'), 'ö', 'o'), 'Ö', 'o'), 'å', 'a'), 'Å', 'a'), 'ä', 'a'), 'Ä', 'a'), 'é', 'e'), 'É', 'e'), 'è', 'e'), 'È', 'e'), 'ü', 'u'), 'Ü', 'u')), '[^a-z0-9]+', '', 'g') as enkel,
           regexp_replace(lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(o, 'æ', 'ae'), 'Æ', 'ae'), 'ø', 'oe'), 'Ø', 'oe'), 'ö', 'oe'), 'Ö', 'oe'), 'å', 'aa'), 'Å', 'aa'), 'ä', 'ae'), 'Ä', 'ae'), 'é', 'e'), 'É', 'e'), 'è', 'e'), 'È', 'e'), 'ü', 'ue'), 'Ü', 'ue')), '[^a-z0-9]+', '', 'g') as fis
    from raa
  )
  select l.fis_code, l.first_name, l.last_name, l.club, l.nation, l.birth_year, l.gender::text, l.sl, l.gs, l.sg, l.dh
  from fis_list_athletes l
  where length(trim(coalesce(q, ''))) >= 3
    and (l.fis_code = trim(q)
      or not exists (select 1 from ord
                     where enkel <> '' and l.name_key not like '%' || enkel || '%' and l.name_key not like '%' || fis || '%'))
  order by (l.fis_code = trim(q)) desc, l.last_name, l.first_name
  limit 25
$function$;
