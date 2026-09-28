-- «permission denied for function ny_lagkode»
--
-- teams.invite_code har default ny_lagkode(), og en kolonnes standardverdi
-- kjøres med den innloggendes rettigheter - ikke tabelleierens. Jeg hadde
-- trukket tilbake EXECUTE fra authenticated i den tro at funksjonen bare ble
-- kalt fra de to andre, som er security definer. Følgen var at ingen kunne
-- opprette et lag i det hele tatt.
--
-- Funksjonen er ufarlig å kalle: den lager en tilfeldig streng og sjekker at
-- den er ledig. Den endrer ingenting.
grant execute on function public.ny_lagkode() to authenticated;

-- Samtidig: «Opprett lag» satte inn i teams direkte, mens onboardingen gikk
-- gjennom create_coach_team. To veier inn til det samme, og bare den ene
-- fanget opp hvilket lag gruppa skulle ligge under. Nå går begge samme vei.
drop function if exists public.create_coach_team(text);
create function public.create_coach_team(p_name text, p_club text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_epost text; v_parent uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Ikke innlogget'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then
    raise exception 'Laget må ha et navn';
  end if;

  select lower(email) into v_epost from auth.users where id = auth.uid();
  select parent_team_id into v_parent from coach_invites
   where email = v_epost and parent_team_id is not null
   order by created_at desc limit 1;

  insert into teams (name, club, owner_id, parent_team_id)
  values (btrim(p_name), nullif(btrim(coalesce(p_club, '')), ''), auth.uid(), v_parent)
  returning id into v_id;
  return v_id;
end
$function$;

revoke all on function public.create_coach_team(text, text) from public, anon;
grant execute on function public.create_coach_team(text, text) to authenticated, service_role;
