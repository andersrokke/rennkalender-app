-- Grupper for alle trenere i huset, og vern av profiles.
--
-- Fram til nå kunne en gruppe bare oppstå én måte: en trener ble invitert, og
-- registreringen laget gruppa. Oscar, som eier huset, kunne ikke lage en
-- gruppe til sine egne løpere - de lå rett på NTG Lillehammer, usynlige for
-- de andre trenerne selv med «alle ser alt» på.
--
-- Nå kan hver trener i huset opprette grupper under det, eie flere, bytte
-- mellom dem, flytte løpere mellom dem, og hovedtreneren kan gi en gruppe til
-- en annen trener.
--
-- Og en tetting som ikke kan vente: profiles hadde ingen with check på
-- oppdatering. Hvem som helst kunne sette is_admin = true på sin egen rad
-- gjennom REST-API-et, eller team_id til hvilket som helst lag uten kode.
-- Én trigger avviser begge når kallet kommer direkte som authenticated.
-- Funksjonene som er security definer kjører som eieren og slipper gjennom,
-- så alt lagbytte går gjennom dem - og bare dem.

-- ---------------------------------------------------------------------------
-- Vern
-- ---------------------------------------------------------------------------
create or replace function public.profiles_vern()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  -- Direkte fra klienten. Security definer-funksjoner og migrasjoner kjører
  -- som eieren, og treffer ikke denne grenen.
  if current_user = 'authenticated' then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'is_admin kan ikke endres direkte';
    end if;
    if new.team_id is distinct from old.team_id and new.team_id is not null then
      raise exception 'Lag byttes gjennom join_team, bytt_gruppe eller flytt_loper';
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists profiles_vern_trg on public.profiles;
create trigger profiles_vern_trg before update on public.profiles
  for each row execute function public.profiles_vern();

-- ---------------------------------------------------------------------------
-- Huset
-- ---------------------------------------------------------------------------

-- Toppen av det laget jeg står i nå: laget selv hvis det ikke ligger under
-- noe, ellers det det ligger under. Står jeg ikke i noe lag - en trener
-- forfremmet fra løper har ikke team_id - faller den tilbake på et hus jeg eier.
create or replace function public.mitt_hus()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select coalesce(t.parent_team_id, t.id)
       from profiles p join teams t on t.id = p.team_id
      where p.id = auth.uid()),
    (select id from teams where owner_id = auth.uid() and parent_team_id is null
      order by created_at limit 1))
$function$;

-- Er jeg trener i dette huset? Eier det, eier en gruppe i det, eller står i
-- det som trener.
create or replace function public.i_huset(p_hus uuid, p_hvem uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from profiles where id = p_hvem and role = 'coach')
     and (exists (select 1 from teams where id = p_hus and owner_id = p_hvem)
       or exists (select 1 from teams where parent_team_id = p_hus and owner_id = p_hvem)
       or exists (select 1 from profiles p join teams t on t.id = p.team_id
                   where p.id = p_hvem and (t.id = p_hus or t.parent_team_id = p_hus)))
$function$;

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

  insert into teams (name, owner_id, parent_team_id)
  values (btrim(p_name), auth.uid(), v_hus)
  returning id into v_id;
  -- Den som lager gruppa står i den etterpå, så neste skjerm er den nye gruppa.
  update profiles set team_id = v_id where id = auth.uid();
  return v_id;
end
$function$;

create or replace function public.bytt_gruppe(p_team uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'coach') then
    raise exception 'Bare trenere bytter gruppe';
  end if;
  if not is_coach_of(p_team) then raise exception 'Du er ikke trener for den gruppa'; end if;
  update profiles set team_id = p_team where id = auth.uid();
end
$function$;

-- Alle lag jeg er trener for, huset først.
create or replace function public.mine_grupper()
returns table (
  id uuid, name text, parent_team_id uuid, er_hus boolean, eier_er_meg boolean,
  eier_navn text, lopere bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  return query
    select t.id, t.name, t.parent_team_id, t.parent_team_id is null,
           t.owner_id = auth.uid(), o.full_name,
           (select count(*) from profiles a where a.team_id = t.id and a.role = 'athlete')
      from teams t left join profiles o on o.id = t.owner_id
     where is_coach_of(t.id)
     order by t.parent_team_id nulls first, t.name;
end
$function$;

-- ---------------------------------------------------------------------------
-- Flytte en løper mellom grupper i samme hus
-- ---------------------------------------------------------------------------
create or replace function public.flytt_loper(p_athlete uuid, p_team uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_fra uuid; v_hus_fra uuid; v_hus_til uuid;
begin
  select team_id into v_fra from profiles where id = p_athlete and role = 'athlete';
  if v_fra is null then raise exception 'Fant ikke løperen i noe lag'; end if;
  if v_fra = p_team then return; end if;
  if not is_coach_of(v_fra) then raise exception 'Du er ikke trener for gruppa løperen står i'; end if;
  if not is_coach_of(p_team) then raise exception 'Du er ikke trener for gruppa du flytter til'; end if;
  select coalesce(parent_team_id, id) into v_hus_fra from teams where id = v_fra;
  select coalesce(parent_team_id, id) into v_hus_til from teams where id = p_team;
  if v_hus_fra is distinct from v_hus_til then
    raise exception 'Løpere flyttes bare mellom grupper i samme lag';
  end if;

  -- Den gamle gruppas planer for henne følger ikke med. De hører til gruppa.
  delete from athlete_races where athlete_id = p_athlete and team_id = v_fra;
  update profiles set team_id = p_team where id = p_athlete;
end
$function$;

-- ---------------------------------------------------------------------------
-- Hovedtreneren gir en gruppe til en annen trener
-- ---------------------------------------------------------------------------
create or replace function public.sett_gruppetrener(p_team uuid, p_coach uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_hus uuid;
begin
  select parent_team_id into v_hus from teams where id = p_team;
  if v_hus is null then raise exception 'Huset selv kan ikke gis bort'; end if;
  if not exists (select 1 from teams where id = v_hus and owner_id = auth.uid()) then
    raise exception 'Bare hovedtrener kan gi bort en gruppe';
  end if;
  if not i_huset(v_hus, p_coach) then raise exception 'Treneren hører ikke til laget'; end if;
  update teams set owner_id = p_coach where id = p_team;
end
$function$;

-- ---------------------------------------------------------------------------
-- «Alle ser alt» gjelder også huset selv
--
-- Løpere som står rett på huset - slik Oscars gjorde - var usynlige for
-- gruppetrenerne selv med bryteren på, fordi regelen bare så på grupper
-- under huset.
-- ---------------------------------------------------------------------------
create or replace function public.is_coach_of(t uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from profiles where id = auth.uid() and role = 'coach' and team_id = t)
      or exists (select 1 from teams where id = t and owner_id = auth.uid())
      or exists (select 1 from teams g join teams p on p.id = g.parent_team_id
                  where g.id = t and p.owner_id = auth.uid())
      or exists (select 1 from teams g join teams p on p.id = g.parent_team_id
                  where g.id = t and p.coaches_see_all
                    and exists (select 1 from teams m
                                 where m.parent_team_id = p.id and m.owner_id = auth.uid()))
      -- Huset selv, når «alle ser alt» er på og jeg har en gruppe i det.
      or exists (select 1 from teams h
                  where h.id = t and h.parent_team_id is null and h.coaches_see_all
                    and exists (select 1 from teams m
                                 where m.parent_team_id = h.id and m.owner_id = auth.uid()))
      or exists (select 1 from team_access a where a.team_id = t and a.coach_id = auth.uid())
$function$;

-- ---------------------------------------------------------------------------
-- create_coach_team setter profilen selv
--
-- Klienten satte team_id etterpå. Med vernet over kan den ikke lenger, og det
-- er riktig: laget og medlemskapet skal oppstå i samme transaksjon.
-- ---------------------------------------------------------------------------
create or replace function public.create_coach_team(p_name text, p_club text default null)
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
  update profiles set team_id = v_id, role = 'coach' where id = auth.uid();
  return v_id;
end
$function$;

do $$
declare f text;
begin
  foreach f in array array[
    'mitt_hus()', 'i_huset(uuid, uuid)', 'opprett_gruppe(text)', 'bytt_gruppe(uuid)',
    'mine_grupper()', 'flytt_loper(uuid, uuid)', 'sett_gruppetrener(uuid, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  execute 'revoke all on function public.profiles_vern() from public, anon, authenticated';
end $$;
