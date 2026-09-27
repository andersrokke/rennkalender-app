-- Hovedtreneren inviterer sine egne trenere.
--
-- Invitasjon var en administratoroppgave. Det betyr at den som drifter appen
-- måtte invitere hver eneste trener på vegne av hver eneste hovedtrener - et
-- ledd som ikke gir noe, og som stopper opp så snart administratoren har
-- annet å gjøre.
--
-- Hvem som får lov følger av strukturen og trenger ingen ny rolle: eier du et
-- lag som ikke ligger under noe annet, er du toppen av et hus, og grupper kan
-- henge under deg. Eier du en gruppe, ligger den under noen, og da kan du ikke
-- invitere videre. Det faller ut av parent_team_id helt av seg selv.

create or replace function public.my_top_team()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select id from teams
   where owner_id = auth.uid() and parent_team_id is null
   order by created_at limit 1
$function$;

create or replace function public.head_invite_coach(p_email text, p_note text default null)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_email text := lower(btrim(p_email)); v_team uuid := my_top_team();
        v_id bigint; v_apne integer;
begin
  if v_team is null then
    raise exception 'Du må eie et lag for å invitere trenere';
  end if;
  if position('@' in v_email) < 2 then
    raise exception 'Ikke en e-postadresse: %', p_email;
  end if;
  if exists (select 1 from auth.users
              where lower(email) = v_email and last_sign_in_at is not null) then
    raise exception 'Den adressen er allerede i bruk';
  end if;

  -- Hver invitasjon oppretter en bruker. Registrering er åpen, så uten et tak
  -- kunne hvem som helst meldt seg som trener og deretter laget kontoer i
  -- andres navn. Ti ubrukte om gangen er rikelig for et trenerteam, og lite
  -- nok til at det ikke er verdt å misbruke.
  select count(*) into v_apne from coach_invites i
   where i.invited_by = auth.uid()
     and not exists (select 1 from auth.users u
                      where lower(u.email) = i.email and u.last_sign_in_at is not null);
  if v_apne >= 10 then
    raise exception 'Du har ti invitasjoner som ikke er tatt i bruk. Trekk tilbake noen først.';
  end if;

  insert into coach_invites (email, note, invited_by, parent_team_id)
  values (v_email, nullif(btrim(p_note), ''), auth.uid(), v_team)
  on conflict (email)
    do update set note = excluded.note, invited_by = excluded.invited_by,
                  parent_team_id = excluded.parent_team_id,
                  created_at = now(), sent_at = null, send_error = null
  returning id into v_id;

  perform invoke_edge_function('invite-coach', jsonb_build_object('id', v_id), 20000);
  return v_id;
end
$function$;

-- Egne invitasjoner, med om de er tatt i bruk. Samme regel som i admin_invites:
-- det leses av at brukeren har logget inn, ikke av en status som kan bli
-- hengende igjen og lyve.
create or replace function public.head_invites()
returns table (
  id bigint, email text, note text, created_at timestamp with time zone,
  sent_at timestamp with time zone, send_error text,
  sist_innlogget timestamp with time zone, gruppe text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if my_top_team() is null then return; end if;
  return query
    select i.id, i.email, i.note, i.created_at, i.sent_at, i.send_error,
           u.last_sign_in_at, g.name
      from coach_invites i
      left join auth.users u on lower(u.email) = i.email
      left join teams g on g.owner_id = u.id and g.parent_team_id = i.parent_team_id
     where i.invited_by = auth.uid()
     order by i.created_at desc
     limit 50;
end
$function$;

create or replace function public.head_cancel_invite(p_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from coach_invites where id = p_id and invited_by = auth.uid();
end
$function$;

do $$
declare f text;
begin
  foreach f in array array[
    'my_top_team()', 'head_invite_coach(text, text)', 'head_invites()',
    'head_cancel_invite(bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Én bryter for «alle ser alt»
--
-- Rutenettet gir presis styring, men er feil verktøy når svaret uansett er at
-- alle skal se alt: da må ni ruter krysses av, og én til for hver nye trener -
-- en tilstand man må huske å vedlikeholde. Bryteren er en regel i stedet, og
-- regler gjelder også for dem som kommer senere.
--
-- Den står på laget øverst, ikke på hver gruppe, fordi det er huset som har
-- en kultur - ikke den enkelte gruppa.
-- ---------------------------------------------------------------------------
alter table public.teams
  add column if not exists coaches_see_all boolean not null default false;

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
      -- «Alle ser alt» er slått på for huset, og jeg har en gruppe i det.
      or exists (select 1 from teams g join teams p on p.id = g.parent_team_id
                  where g.id = t and p.coaches_see_all
                    and exists (select 1 from teams m
                                 where m.parent_team_id = p.id and m.owner_id = auth.uid()))
      -- Innsyn hovedtreneren har gitt til en enkelt trener.
      or exists (select 1 from team_access a where a.team_id = t and a.coach_id = auth.uid())
$function$;

create or replace function public.head_set_open(p_on boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare p uuid := my_top_team();
begin
  if p is null then raise exception 'Bare hovedtrener'; end if;
  update teams set coaches_see_all = p_on where id = p;
end
$function$;

-- head_overview() må si fra om bryteren står på, ellers viser rutenettet
-- tomme ruter for tilganger som faktisk gjelder.
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
    'lag', (select jsonb_build_object('id', t.id, 'navn', t.name,
                                      'alle_ser_alt', t.coaches_see_all)
              from teams t where t.id = p),
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

do $$
begin
  execute 'revoke all on function public.head_set_open(boolean) from public, anon';
  execute 'grant execute on function public.head_set_open(boolean) to authenticated, service_role';
end $$;
