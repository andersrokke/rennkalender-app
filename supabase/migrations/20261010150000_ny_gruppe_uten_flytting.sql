-- Å lage en gruppe flytter ikke lenger treneren inn i den.
--
-- Før havnet treneren i den nye, tomme gruppa med én gang, og sesongskjermene
-- ble tomme til hun byttet tilbake. Nå blir hun stående der hun står, lager
-- gruppa, og flytter løpere inn i den fra Løpere-siden.
create or replace function public.opprett_gruppe(p_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_hus uuid := mitt_hus(); v_id uuid;
begin
  if v_hus is null then raise exception 'Du må stå i et lag for å opprette en gruppe'; end if;
  if not i_huset(v_hus) then raise exception 'Bare trenere i laget kan opprette grupper'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Gruppa må ha et navn'; end if;
  if exists (select 1 from teams where parent_team_id = v_hus and lower(btrim(name)) = lower(btrim(p_name))) then
    raise exception 'Det finnes alt en gruppe som heter det';
  end if;
  insert into teams (name, owner_id, parent_team_id)
  values (btrim(p_name), auth.uid(), v_hus)
  returning id into v_id;
  return v_id;
end
$function$;
