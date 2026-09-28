-- Lesbar lagkode, ny kode ved behov, og en vei ut av laget.
--
-- Koden var tolv heksadesimale tegn fra gen_random_bytes(6). Den ble aldri
-- laget for å leses opp, og det er nettopp det en kode skal tåle: sies høyt på
-- trening, skrives på en tavle. Nå er den seks tegn uten de som forveksles -
-- ingen O mot 0, ingen I mot 1 - av typen K7RF2M.
--
-- Viktigere enn formen: koden kunne ikke byttes, og en trener kunne ikke
-- fjerne noen fra laget. Én lenke på avveie ga en fremmed i troppen for alltid.
-- Uten de to kan man ikke dele en lenke i en gruppechat med god samvittighet.

-- ---------------------------------------------------------------------------
-- Koden
--
-- gen_random_bytes og ikke random(): koden er det eneste som står mellom en
-- utenforstående og en tropp med navn, årsklasser og FIS-koder. 32 tegn deler
-- 256 jevnt, så modulo gir ingen skjevhet.
-- ---------------------------------------------------------------------------
create or replace function public.ny_lagkode()
returns text
language plpgsql
set search_path to 'public'
as $function$
declare
  alfabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea;
  kode text;
  i integer;
begin
  for forsok in 1..20 loop
    b := extensions.gen_random_bytes(6);
    kode := '';
    for i in 0..5 loop
      kode := kode || substr(alfabet, 1 + (get_byte(b, i) % 32), 1);
    end loop;
    if not exists (select 1 from teams where invite_code = kode) then
      return kode;
    end if;
  end loop;
  raise exception 'Fikk ikke laget en ledig lagkode';
end
$function$;

-- Gamle koder byttes. De er hex og uleselige, og ingen løper har brukt dem
-- ennå. Blir det først mange lag, er dette en endring man ikke kan gjøre
-- stille lenger.
update public.teams set invite_code = public.ny_lagkode()
 where invite_code ~ '^[0-9a-f]{12}$';

alter table public.teams alter column invite_code set default public.ny_lagkode();

-- To lag med samme kode ville gjort join_team tvetydig: den plukker ett av
-- dem, og ingen oppdager det før en løper havner feil sted.
create unique index if not exists teams_invite_code_key on public.teams (invite_code);

-- ---------------------------------------------------------------------------
-- join_team tåler nå store og små bokstaver
--
-- Koden er versaler, men ingen taster den slik. Skjermene skrev den om til
-- små bokstaver før kallet, noe som virket så lenge koden var hex - og ville
-- sluttet å virke i det øyeblikket den ble lesbar.
-- ---------------------------------------------------------------------------
create or replace function public.join_team(code text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare t uuid;
begin
  select id into t from teams where upper(invite_code) = upper(btrim(code));
  if t is null then raise exception 'Ugyldig invitasjonskode'; end if;
  update profiles set team_id = t where id = auth.uid();
  return t;
end
$function$;

-- ---------------------------------------------------------------------------
-- Ny kode
--
-- Gjør alle delte lenker ugyldige med én gang. Det er hele poenget: det er
-- svaret når en lenke har kommet på avveie.
-- ---------------------------------------------------------------------------
create or replace function public.ny_invitasjonskode(p_team uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare k text;
begin
  if not is_coach_of(p_team) then
    raise exception 'Bare treneren for laget kan lage ny kode';
  end if;
  k := ny_lagkode();
  update teams set invite_code = k where id = p_team;
  return k;
end
$function$;

-- ---------------------------------------------------------------------------
-- Fjerne noen fra laget
--
-- Bare løperen selv kunne gå ut. Det er feil vei: den som oppdager at en
-- fremmed står i troppen er treneren, ikke den fremmede.
-- ---------------------------------------------------------------------------
create or replace function public.fjern_fra_lag(p_athlete uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare t uuid;
begin
  select team_id into t from profiles where id = p_athlete;
  if t is null then return; end if;
  if not is_coach_of(t) then
    raise exception 'Bare treneren for laget kan fjerne noen';
  end if;
  if p_athlete = auth.uid() then
    raise exception 'Du kan ikke fjerne deg selv herfra';
  end if;

  -- Lagets planer for denne løperen følger med ut. Blir de stående, dukker de
  -- opp igjen som spøkelsesrader hvis hun senere kommer tilbake til laget.
  delete from athlete_races where athlete_id = p_athlete and team_id = t;
  update profiles set team_id = null where id = p_athlete;
end
$function$;

do $$
declare f text;
begin
  foreach f in array array[
    'ny_lagkode()', 'ny_invitasjonskode(uuid)', 'fjern_fra_lag(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
  end loop;
  -- ny_lagkode er en hjelpefunksjon for de to andre og for default-verdien.
  execute 'revoke all on function public.ny_lagkode() from authenticated';
  execute 'grant execute on function public.ny_invitasjonskode(uuid) to authenticated, service_role';
  execute 'grant execute on function public.fjern_fra_lag(uuid) to authenticated, service_role';
end $$;
