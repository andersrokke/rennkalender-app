-- Klubber ved siden av skigymnasene, og IRS som den første.
--
-- Et skigymnas og en klubb er samme skrog: et hus med grupper under, og en
-- hovedtrener som ser alt. Forskjellen er hvem som er i det. På et skigymnas
-- velger løperen skolen selv ved registrering. I en klubb er løperne barn,
-- foreldrene eier kontoen, og man kommer inn med gruppekode - aldri ved å
-- velge klubben fra en liste. Derfor er en klubb ikke is_school, og dukker
-- ikke opp i skigymnas().
alter table public.teams
  add column if not exists kind text check (kind in ('school', 'club'));
update public.teams set kind = 'school' where is_school and kind is null;

-- IRS med de tre gruppene ferdig opprettet, uten eier. Hovedtrener settes av
-- administrator. Gruppetrenerne inviteres med klubben som overordnet lag, og
-- tar over gruppa si ved å gi den samme navn (se create_coach_team under).
do $$
declare v_irs uuid;
begin
  select id into v_irs from public.teams where parent_team_id is null and lower(btrim(name)) = 'irs';
  if v_irs is null then
    insert into public.teams (name, owner_id, kind) values ('IRS', null, 'club') returning id into v_irs;
  else
    update public.teams set kind = 'club' where id = v_irs;
  end if;
  insert into public.teams (name, owner_id, parent_team_id)
  select g, null, v_irs from unnest(array['U12', 'U14', 'U16']) as g
   where not exists (select 1 from public.teams t where t.parent_team_id = v_irs and lower(btrim(t.name)) = lower(g));
end $$;

-- En invitert trener som gir laget sitt samme navn som en ferdig gruppe uten
-- eier, tar over den gruppa i stedet for å lage en til. Da kan huset settes
-- opp før trenerne er på plass, uten at det blir to U14.
drop function if exists public.create_coach_team(text);
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

  if v_parent is not null then
    update teams set owner_id = auth.uid()
     where parent_team_id = v_parent and owner_id is null
       and lower(btrim(name)) = lower(btrim(p_name))
     returning id into v_id;
    if v_id is not null then
      update profiles set team_id = v_id, role = 'coach' where id = auth.uid();
      return v_id;
    end if;
  end if;

  insert into teams (name, club, owner_id, parent_team_id)
  values (btrim(p_name), nullif(btrim(coalesce(p_club, '')), ''), auth.uid(), v_parent)
  returning id into v_id;
  update profiles set team_id = v_id, role = 'coach' where id = auth.uid();
  return v_id;
end
$function$;
revoke all on function public.create_coach_team(text, text) from public, anon;
grant execute on function public.create_coach_team(text, text) to authenticated, service_role;

-- Administrator ser hva slags hus det er.
drop function if exists public.admin_teams();
create function public.admin_teams()
returns table (
  id uuid, name text, club text, owner_id uuid, owner_name text, owner_email text,
  invite_code text, lopere bigint, renn bigint, parent_team_id uuid,
  parent_name text, is_school boolean, kind text, created_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  return query
    select t.id, t.name, t.club, t.owner_id, o.full_name, u.email::text, t.invite_code,
           (select count(*) from profiles p where p.team_id = t.id and p.role = 'athlete'),
           (select count(*) from team_races r where r.team_id = t.id),
           t.parent_team_id, pt.name, t.is_school, t.kind, t.created_at
      from teams t
      left join profiles o on o.id = t.owner_id
      left join auth.users u on u.id = t.owner_id
      left join teams pt on pt.id = t.parent_team_id
     order by coalesce(pt.name, t.name), t.parent_team_id nulls first, t.name;
end
$function$;
revoke all on function public.admin_teams() from public, anon;
grant execute on function public.admin_teams() to authenticated, service_role;

