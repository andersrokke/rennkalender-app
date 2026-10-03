-- Modusen bestemmer, også i databasen. Og tre herdinger.
--
-- Administrator kan bytte mellom trener, løper og forelder. Det byttet endret
-- bare en etikett: den som eide et lag var trener for det uansett valgt rolle,
-- så «forelder» viste trenerens skjermer og hadde trenerens rettigheter.
--
-- Nå krever trenerrett at rollen faktisk er trener - i tillegg til eierskapet
-- eller innsynet som ga retten. Rollen alene gir fortsatt ingenting; den er
-- nødvendig, ikke tilstrekkelig. Står man som forelder, har man en forelders
-- rettigheter: sine egne barn, og ikke mer.

create or replace function public.is_coach_of(t uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from profiles where id = auth.uid() and role = 'coach')
     and (exists (select 1 from teams where id = t and owner_id = auth.uid())
       or exists (select 1 from teams g join teams p on p.id = g.parent_team_id
                   where g.id = t and p.owner_id = auth.uid())
       or exists (select 1 from teams g join teams p on p.id = g.parent_team_id
                   where g.id = t and p.coaches_see_all
                     and exists (select 1 from teams m
                                  where m.parent_team_id = p.id and m.owner_id = auth.uid()))
       or exists (select 1 from teams h
                   where h.id = t and h.parent_team_id is null and h.coaches_see_all
                     and exists (select 1 from teams m
                                  where m.parent_team_id = h.id and m.owner_id = auth.uid()))
       or exists (select 1 from team_access a where a.team_id = t and a.coach_id = auth.uid()))
$function$;

create or replace function public.i_huset(p_hus uuid, p_hvem uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from profiles where id = p_hvem and role = 'coach')
     and (exists (select 1 from teams where id = p_hus and owner_id = p_hvem)
       or exists (select 1 from teams where parent_team_id = p_hus and owner_id = p_hvem))
$function$;

-- ---------------------------------------------------------------------------
-- Forsøkssperre på kodene
--
-- Foreldrekoden gir innsyn i en mindreårigs plan og logg, lagkoden gir plass i
-- en gruppe. Seks tegn er over en milliard muligheter, men uten sperre kan de
-- prøves så fort nettet tillater. Ti feil i timen per bruker, så stopper det.
--
-- Et galt forsøk må overleve transaksjonen for å kunne telles. Derfor kaster
-- funksjonene ikke lenger ved feil kode - et kast ruller tilbake tellingen -
-- men svarer tomt, og klienten sier «ugyldig kode».
-- ---------------------------------------------------------------------------
create table if not exists public.kodeforsok (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  slag text not null,
  tid timestamp with time zone not null default now()
);
create index if not exists kodeforsok_idx on public.kodeforsok (user_id, slag, tid desc);
alter table public.kodeforsok enable row level security;
revoke all on table public.kodeforsok from anon, authenticated;

create or replace function public.for_mange_forsok(p_slag text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select count(*) >= 10 from kodeforsok
   where user_id = auth.uid() and slag = p_slag and tid > now() - interval '1 hour'
$function$;

create or replace function public.link_guardian(code text)
returns table(athlete_id uuid, full_name text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare a_id uuid; a_name text;
begin
  if auth.uid() is null then raise exception 'Ikke innlogget'; end if;
  if for_mange_forsok('forelder') then
    raise exception 'For mange forsøk. Prøv igjen om en time.';
  end if;
  select id, profiles.full_name into a_id, a_name from profiles
   where upper(link_code) = upper(btrim(code)) and role = 'athlete';
  if a_id is null then
    insert into kodeforsok (user_id, slag) values (auth.uid(), 'forelder');
    return;
  end if;
  if a_id = auth.uid() then raise exception 'Du kan ikke koble deg til deg selv'; end if;
  insert into guardians(parent_id, athlete_id) values (auth.uid(), a_id) on conflict do nothing;
  update profiles set role = 'parent', onboarded = true where id = auth.uid() and role <> 'coach';
  return query select a_id, a_name;
end $function$;

create or replace function public.join_team(code text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'Ikke innlogget'; end if;
  if for_mange_forsok('lag') then
    raise exception 'For mange forsøk. Prøv igjen om en time.';
  end if;
  select id into t from teams where upper(invite_code) = upper(btrim(code));
  if t is null then
    insert into kodeforsok (user_id, slag) values (auth.uid(), 'lag');
    return null;
  end if;
  update profiles set team_id = t where id = auth.uid();
  return t;
end
$function$;

-- ---------------------------------------------------------------------------
-- Varsler sendes én gang
--
-- Edge-funksjonene tar imot kall fra hvem som helst med den offentlige
-- nøkkelen. Det lot en utenforstående sende samme feedback-varsel eller
-- invitasjon om og om igjen. Nå tar funksjonen saken før den sender: bare det
-- første kallet får den, resten får «allerede sendt».
-- ---------------------------------------------------------------------------
alter table public.feedback add column if not exists notified_at timestamp with time zone;
update public.feedback set notified_at = created_at where notified_at is null;

do $$
begin
  execute 'revoke all on function public.for_mange_forsok(text) from public, anon';
  execute 'grant execute on function public.for_mange_forsok(text) to authenticated, service_role';
end $$;
