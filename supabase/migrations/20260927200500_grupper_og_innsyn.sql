-- Grupper under et lag, og innsyn på tvers.
--
-- NTG Lillehammer har tre trenere med hver sin gruppe. Slik det sto kunne man
-- velge mellom to ytterpunkter: ett felles lag, der alle så alt og ingen hadde
-- grupper - eller tre adskilte lag, der ingen så på tvers. Onboardingen gjorde
-- valget for deg: «Trener» opprettet alltid et nytt lag, aldri en gruppe under
-- et eksisterende.
--
-- Nå kan et lag ligge under et annet. Hovedtreneren eier laget øverst, ser alle
-- gruppene under, og bestemmer hvem av de andre trenerne som ser hverandres.
--
-- Ett nivå, ikke et tre. Et tre hadde vært mer generelt, men også noe ingen
-- hadde bedt om: NTG Lillehammer har grupper, ikke grupper i grupper. Regelen
-- håndheves av en trigger, ikke av disiplin.

alter table public.teams
  add column if not exists parent_team_id uuid references public.teams(id) on delete set null;

create index if not exists teams_parent_idx on public.teams (parent_team_id)
  where parent_team_id is not null;

create or replace function public.teams_ett_niva()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.parent_team_id is null then return new; end if;
  if new.parent_team_id = new.id then
    raise exception 'Et lag kan ikke ligge under seg selv';
  end if;
  if exists (select 1 from teams where id = new.parent_team_id and parent_team_id is not null) then
    raise exception 'Laget du peker på ligger allerede under et annet lag. Det er bare ett nivå.';
  end if;
  if exists (select 1 from teams where parent_team_id = new.id) then
    raise exception 'Dette laget har grupper under seg, og kan ikke selv legges under et annet';
  end if;
  return new;
end
$function$;

drop trigger if exists teams_ett_niva_trg on public.teams;
create trigger teams_ett_niva_trg before insert or update of parent_team_id on public.teams
  for each row execute function public.teams_ett_niva();

-- ---------------------------------------------------------------------------
-- Innsyn gitt av hovedtreneren
-- ---------------------------------------------------------------------------
create table if not exists public.team_access (
  team_id uuid not null references public.teams(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  primary key (team_id, coach_id)
);

alter table public.team_access enable row level security;
revoke all on table public.team_access from anon;
grant select on table public.team_access to authenticated;
grant all on table public.team_access to service_role;

-- Leses for å vise hvem som har innsyn. Skrives bare gjennom head_set_access().
drop policy if exists "team_access read" on public.team_access;
create policy "team_access read" on public.team_access as permissive for select to authenticated
  using (coach_id = auth.uid() or is_coach_of(team_id));

-- ---------------------------------------------------------------------------
-- Porten
--
-- 26 RLS-regler kaller is_coach_of(). Utvidelsen skjer her, én gang, i stedet
-- for at hver regel skal lære seg det samme på nytt.
--
-- Merk: innsyn gir samme rettigheter som å være gruppas egen trener, også til
-- å endre. Å skille lesing fra skriving ville betydd å skrive om alle 26
-- reglene, og innenfor ett trenerteam er det ikke det problemet skal løse.
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
      -- Hovedtreneren eier laget gruppa ligger under, og ser alle gruppene.
      or exists (select 1 from teams g join teams p on p.id = g.parent_team_id
                  where g.id = t and p.owner_id = auth.uid())
      -- Innsyn hovedtreneren har gitt til en annen trener.
      or exists (select 1 from team_access a where a.team_id = t and a.coach_id = auth.uid())
$function$;

-- ---------------------------------------------------------------------------
-- Hovedtrenerens bilde
-- ---------------------------------------------------------------------------

-- Laget denne treneren er hovedtrener for, hvis noe.
create or replace function public.my_head_team()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select t.id from teams t
   where t.owner_id = auth.uid() and t.parent_team_id is null
     and exists (select 1 from teams g where g.parent_team_id = t.id)
   limit 1
$function$;

create or replace function public.head_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare p uuid := my_head_team();
begin
  if p is null then return null; end if;
  return jsonb_build_object(
    'lag', (select jsonb_build_object('id', t.id, 'navn', t.name) from teams t where t.id = p),
    'grupper', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'navn', g.name,
               'trener', o.full_name, 'trener_id', g.owner_id,
               'lopere', (select count(*) from profiles a
                           where a.team_id = g.id and a.role = 'athlete'),
               'okter_30d', (select count(*) from training_sessions s
                              join profiles a on a.id = s.athlete_id
                             where a.team_id = g.id and not s.planned
                               and s.date > current_date - 30))
             order by g.name)
        from teams g left join profiles o on o.id = g.owner_id
       where g.parent_team_id = p), '[]'::jsonb),
    -- Trenerne som hører til huset: de som eier en gruppe under laget.
    'trenere', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'navn', o.full_name, 'egen_gruppe', g.id,
               'innsyn', coalesce((select jsonb_agg(a.team_id)
                                     from team_access a where a.coach_id = o.id), '[]'::jsonb))
             order by o.full_name)
        from teams g join profiles o on o.id = g.owner_id
       where g.parent_team_id = p), '[]'::jsonb)
  );
end
$function$;

create or replace function public.head_set_access(p_coach uuid, p_team uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare p uuid := my_head_team();
begin
  if p is null then raise exception 'Bare hovedtrener'; end if;
  -- Gruppa må ligge under hovedtrenerens lag, og treneren må høre til huset.
  if not exists (select 1 from teams where id = p_team and parent_team_id = p) then
    raise exception 'Gruppa hører ikke til laget ditt';
  end if;
  if not exists (select 1 from teams where parent_team_id = p and owner_id = p_coach) then
    raise exception 'Treneren hører ikke til laget ditt';
  end if;
  -- Å gi noen innsyn i sin egen gruppe er ikke feil, bare uten virkning.
  if exists (select 1 from teams where id = p_team and owner_id = p_coach) then
    return;
  end if;

  if p_on then
    insert into team_access (team_id, coach_id, granted_by)
    values (p_team, p_coach, auth.uid())
    on conflict (team_id, coach_id) do nothing;
  else
    delete from team_access where team_id = p_team and coach_id = p_coach;
  end if;
end
$function$;

-- ---------------------------------------------------------------------------
-- Gruppa opprettes som gruppe
--
-- Onboardingen satte inn et lag rett i tabellen. Da ble hver ny trener sitt
-- eget frittstående lag, uansett hvem som inviterte henne. Nå går det gjennom
-- en funksjon som ser etter en invitasjon først, og henger gruppa på riktig
-- sted med én gang.
-- ---------------------------------------------------------------------------
alter table public.coach_invites
  add column if not exists parent_team_id uuid references public.teams(id) on delete set null;

create or replace function public.create_coach_team(p_name text)
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

  insert into teams (name, owner_id, parent_team_id)
  values (btrim(p_name), auth.uid(), v_parent)
  returning id into v_id;
  return v_id;
end
$function$;

-- ---------------------------------------------------------------------------
-- Administrator: sett strukturen for hånd
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_parent_team(p_team uuid, p_parent uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  update teams set parent_team_id = p_parent where id = p_team;
end
$function$;

-- Returtypen får to nye kolonner, og da nytter det ikke med create or
-- replace: Postgres krever at funksjonen slippes først.
drop function if exists public.admin_teams();
create function public.admin_teams()
returns table (
  id uuid, name text, club text, owner_name text, owner_email text,
  invite_code text, lopere bigint, renn bigint, parent_team_id uuid,
  parent_name text, created_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  return query
    select t.id, t.name, t.club, o.full_name, u.email::text, t.invite_code,
           (select count(*) from profiles p where p.team_id = t.id and p.role = 'athlete'),
           (select count(*) from team_races r where r.team_id = t.id),
           t.parent_team_id, pt.name, t.created_at
      from teams t
      left join profiles o on o.id = t.owner_id
      left join auth.users u on u.id = t.owner_id
      left join teams pt on pt.id = t.parent_team_id
     order by coalesce(pt.name, t.name), t.parent_team_id nulls first, t.name;
end
$function$;

-- Invitasjonen kan peke på laget gruppa skal havne under.
drop function if exists public.admin_invite_coach(text, text);
create or replace function public.admin_invite_coach(
  p_email text, p_note text default null, p_parent_team uuid default null)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_email text := lower(btrim(p_email)); v_id bigint;
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  if position('@' in v_email) < 2 then
    raise exception 'Ikke en e-postadresse: %', p_email;
  end if;
  if exists (select 1 from auth.users
              where lower(email) = v_email and last_sign_in_at is not null) then
    raise exception 'Den adressen er allerede i bruk';
  end if;

  insert into coach_invites (email, note, invited_by, parent_team_id)
  values (v_email, nullif(btrim(p_note), ''), auth.uid(), p_parent_team)
  on conflict (email)
    do update set note = excluded.note, invited_by = excluded.invited_by,
                  parent_team_id = excluded.parent_team_id,
                  created_at = now(), sent_at = null, send_error = null
  returning id into v_id;

  perform invoke_edge_function('invite-coach', jsonb_build_object('id', v_id), 20000);
  return v_id;
end
$function$;

do $$
declare f text;
begin
  foreach f in array array[
    'my_head_team()', 'head_overview()', 'head_set_access(uuid, uuid, boolean)',
    'create_coach_team(text)', 'admin_set_parent_team(uuid, uuid)',
    'admin_teams()', 'admin_invite_coach(text, text, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
