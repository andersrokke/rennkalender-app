-- Admin-lista viser hvilke grupper en trener har innsyn i, ikke bare hvilke
-- hun eier. Treneren «står» i huset og bytter gruppe øverst i appen; uten
-- dette så det ut som trenere og løpere lå på ulike lag.
drop function if exists public.admin_users();
create function public.admin_users()
returns table (
  id uuid, email text, full_name text, role text, is_admin boolean,
  is_test boolean, onboarded boolean, team_id uuid, team_name text,
  hus_id uuid, hus_navn text, pa_huset boolean, skigymnas boolean,
  foresatte text, barn text, eier_av text, innsyn text,
  provider text, created_at timestamp with time zone,
  last_sign_in_at timestamp with time zone, okter bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  return query
    select p.id, u.email::text, p.full_name, p.role::text, p.is_admin, p.is_test,
           p.onboarded, p.team_id, t.name,
           coalesce(t.parent_team_id, t.id), coalesce(h.name, t.name),
           (t.id is not null and t.parent_team_id is null),
           coalesce(h.is_school, t.is_school, false),
           (select string_agg(pp.full_name, ', ') from guardians g
              join profiles pp on pp.id = g.parent_id where g.athlete_id = p.id),
           (select string_agg(a.full_name, ', ') from guardians g
              join profiles a on a.id = g.athlete_id where g.parent_id = p.id),
           (select string_agg(e.name, ', ') from teams e where e.owner_id = p.id),
           (select string_agg(e.name, ', ') from team_access ta join teams e on e.id = ta.team_id where ta.coach_id = p.id),
           (select string_agg(distinct i.provider, ', ')
              from auth.identities i where i.user_id = p.id)::text,
           u.created_at, u.last_sign_in_at,
           (select count(*) from training_sessions s
             where s.athlete_id = p.id and not s.planned)
      from profiles p
      join auth.users u on u.id = p.id
      left join teams t on t.id = p.team_id
      left join teams h on h.id = t.parent_team_id
     order by coalesce(h.name, t.name) nulls last, t.parent_team_id nulls first, t.name, p.full_name;
end
$function$;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated, service_role;
