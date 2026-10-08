-- Klubben IRS og gruppene under tas bort igjen: appen holder seg til FIS.
-- Ferdige grupper som tas over av den inviterte treneren (create_coach_team)
-- beholdes - det er nyttig for skigymnasene også.
delete from public.teams where parent_team_id in (select id from public.teams where kind = 'club');
delete from public.teams where kind = 'club';

drop function if exists public.admin_teams();
create function public.admin_teams()
returns table (
  id uuid, name text, club text, owner_id uuid, owner_name text, owner_email text,
  invite_code text, lopere bigint, renn bigint, parent_team_id uuid,
  parent_name text, is_school boolean, created_at timestamp with time zone
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
           t.parent_team_id, pt.name, t.is_school, t.created_at
      from teams t
      left join profiles o on o.id = t.owner_id
      left join auth.users u on u.id = t.owner_id
      left join teams pt on pt.id = t.parent_team_id
     order by coalesce(pt.name, t.name), t.parent_team_id nulls first, t.name;
end
$function$;
revoke all on function public.admin_teams() from public, anon;
grant execute on function public.admin_teams() to authenticated, service_role;

alter table public.teams drop column if exists kind;
