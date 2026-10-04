-- Sikkerhetsherding etter gjennomgangen 5. oktober 2026.
--
-- Hovedfunnet: lag kunne opprettes og endres rett i tabellen av enhver
-- innlogget bruker, uten å gå gjennom funksjonene som kontrollerer hvem man
-- er. Sammen med at rollen kunne settes fritt på egen profil, ga det en vei
-- til trenerrett i et lag man ikke hørte til. Dette lukkes her.
--
-- 1. Lag opprettes bare gjennom create_coach_team og opprett_gruppe.
-- 2. Eier, plassering i huset, skigymnas-status, «alle ser alt» og lagkode
--    endres bare gjennom funksjonene som finnes for det.
-- 3. Egen rolle kan bare settes til løper eller forelder. Trener blir man ved
--    å opprette et lag, eller ved at administrator setter det.
-- 4. Foreldrekoden er ikke lenger lesbar for lagkamerater og trenere.
-- 5. Regler og rettigheter appen ikke bruker, fjernes.

-- ---------------------------------------------------------------------------
-- 1 og 2: lagtabellen
-- ---------------------------------------------------------------------------
drop policy if exists "teams insert" on public.teams;

create or replace function public.teams_vern()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  -- Bare direkte kall fra klienten treffer denne grenen. Funksjonene som er
  -- security definer kjører som eieren.
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      raise exception 'Lag opprettes gjennom create_coach_team eller opprett_gruppe';
    end if;
    if new.owner_id is distinct from old.owner_id
       or new.parent_team_id is distinct from old.parent_team_id
       or new.is_school is distinct from old.is_school
       or new.coaches_see_all is distinct from old.coaches_see_all
       or new.invite_code is distinct from old.invite_code then
      raise exception 'Dette feltet endres gjennom egne funksjoner, ikke direkte';
    end if;
  end if;
  return new;
end
$function$;
drop trigger if exists teams_vern_trg on public.teams;
create trigger teams_vern_trg before insert or update on public.teams
  for each row execute function public.teams_vern();

-- ---------------------------------------------------------------------------
-- 3: profilen
-- ---------------------------------------------------------------------------
-- Appen oppdaterer bare egen profil. Trenerens endringer av løpere går
-- gjennom flytt_loper og fjern_fra_lag.
drop policy if exists "profiles coach update" on public.profiles;

create or replace function public.profiles_vern()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'is_admin kan ikke endres direkte';
    end if;
    if new.team_id is distinct from old.team_id and new.team_id is not null then
      raise exception 'Lag byttes gjennom join_team, bytt_gruppe eller flytt_loper';
    end if;
    if new.role is distinct from old.role and new.role not in ('athlete', 'parent') then
      raise exception 'Trener blir man ved å opprette et lag';
    end if;
    if new.link_code is distinct from old.link_code then
      raise exception 'Foreldrekoden byttes gjennom bytt_foreldrekode';
    end if;
    if new.is_test is distinct from old.is_test then
      raise exception 'is_test kan ikke endres direkte';
    end if;
  end if;
  return new;
end
$function$;

-- Rollen alene gir ingen rettigheter: trenerrett krever at man eier et lag
-- eller har fått innsyn. Invitasjoner oppretter derfor fortsatt brukeren med
-- trenerrollen, og det er lagopprettelsen som er stengt.

-- ---------------------------------------------------------------------------
-- 4: foreldrekoden
-- ---------------------------------------------------------------------------
-- Den som har koden kan koble seg til løperen som foresatt. Den skal derfor
-- bare kunne leses av løperen selv. Kolonnerettigheter i stedet for regel:
-- radreglene styrer rader, ikke kolonner.
revoke select on public.profiles from authenticated, anon;
grant select (id, full_name, role, team_id, fis_code, birth_year, gender, created_at, onboarded,
              home_city, plan_settings, lang, theme, is_test, is_admin, entry_alerts)
  on public.profiles to authenticated;

create or replace function public.min_foreldrekode()
 returns text language sql stable security definer set search_path to 'public'
as $function$
  select link_code from profiles where id = auth.uid() and role = 'athlete'
$function$;
revoke all on function public.min_foreldrekode() from public, anon;
grant execute on function public.min_foreldrekode() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5: det appen ikke bruker
-- ---------------------------------------------------------------------------
-- Foresatte kobles bare gjennom link_guardian, med kode.
drop policy if exists "guardians insert" on public.guardians;

-- Uinnloggede skal ikke kunne skrive noe sted, og ingen klientrolle trenger
-- TRUNCATE, REFERENCES eller TRIGGER. Radreglene stopper dette i dag; dette
-- er et lag til.
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'v')
  loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t.relname);
    execute format('revoke insert, update, delete on public.%I from anon', t.relname);
  end loop;
end $$;

-- Triggerfunksjoner skal ikke kunne kalles som vanlige funksjoner.
revoke all on function public.teams_vern() from public, anon, authenticated;
revoke all on function public.profiles_vern() from public, anon, authenticated;
revoke all on function public.teams_ett_niva() from public, anon, authenticated;
revoke all on function public.feedback_touch() from public, anon, authenticated;
