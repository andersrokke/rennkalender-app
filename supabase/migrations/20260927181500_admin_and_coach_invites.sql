-- Administratorside og invitasjon av trenere.
--
-- Fram til nå har det ikke vært noe sted å se helheten. Hvem er inne, hvilke
-- lag finnes, går cron-jobbene, brukes appen i det hele tatt. Svarene fantes
-- bare som SQL noen måtte kjøre for hånd.
--
-- Alt her går gjennom funksjoner med security definer som første handling
-- sjekker is_admin(). Grunnen er at oversikten må lese ting en vanlig bruker
-- ikke skal komme til - e-postadresser i auth.users, cron-historikk, alle lag
-- på tvers. Det er tryggere å åpne én dør med en vakt foran enn å gi
-- authenticated leserett på auth-skjemaet.

-- ---------------------------------------------------------------------------
-- Rydder opp i fremmednøkler som sto på no action
--
-- Fem tabeller pekte på profiles uten å si hva som skulle skje ved sletting.
-- Standarden er da «no action», som blokkerer. Det betyr at sletting av en
-- bruker feilet - også fra Supabase sitt eget dashbord - uten at det var
-- åpenbart hvorfor. Kolonnene er nullbare, så set null er det de burde vært.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass::text as tbl, a.attname
      from pg_constraint c
      join unnest(c.conkey) k(attnum) on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
     where c.contype = 'f'
       and c.confrelid = 'public.profiles'::regclass
       and c.confdeltype = 'a'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) '
                || 'references public.profiles(id) on delete set null',
                   r.tbl, r.conname, r.attname);
    raise notice 'satte on delete set null: %.%', r.tbl, r.attname;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Invitasjoner
-- ---------------------------------------------------------------------------
create table if not exists public.coach_invites (
  id bigint generated always as identity primary key,
  email text not null,
  note text,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  sent_at timestamp with time zone,
  send_error text,
  constraint coach_invites_email_check
    check (email = lower(btrim(email)) and position('@' in email) > 1),
  constraint coach_invites_note_len check (note is null or char_length(note) <= 500)
);

-- Én rad per adresse. Sendes invitasjonen på nytt, oppdateres raden i stedet
-- for at det vokser fram en liste med duplikater.
create unique index if not exists coach_invites_email_idx
  on public.coach_invites (email);

alter table public.coach_invites enable row level security;
revoke all on table public.coach_invites from anon, authenticated;
grant all on table public.coach_invites to service_role;

-- Ingen policy for authenticated: invitasjoner leses og skrives bare gjennom
-- admin-funksjonene og av edge-funksjonen. Tabellen er ikke for brukerne.

-- ---------------------------------------------------------------------------
-- Oversikt
-- ---------------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  return jsonb_build_object(
    'brukere',      (select count(*) from profiles),
    'trenere',      (select count(*) from profiles where role = 'coach'),
    'lopere',       (select count(*) from profiles where role = 'athlete'),
    'foreldre',     (select count(*) from profiles where role = 'parent'),
    'admins',       (select count(*) from profiles where is_admin),
    'ikke_ferdige', (select count(*) from profiles where not onboarded),
    'lag',          (select count(*) from teams),
    'aktive_7d',    (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'okter_30d',    (select count(*) from training_sessions
                      where date > (current_date - 30) and not planned),
    'feedback_ny',  (select count(*) from feedback where status = 'new'),
    'invitasjoner', (select count(*) from coach_invites i
                      where not exists (select 1 from auth.users u
                                         where lower(u.email) = i.email
                                           and u.last_sign_in_at is not null))
  );
end
$function$;

-- ---------------------------------------------------------------------------
-- Brukere og lag
-- ---------------------------------------------------------------------------
create or replace function public.admin_users()
returns table (
  id uuid, email text, full_name text, role text, is_admin boolean,
  is_test boolean, onboarded boolean, team_id uuid, team_name text,
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
           (select string_agg(distinct i.provider, ', ')
              from auth.identities i where i.user_id = p.id)::text,
           u.created_at, u.last_sign_in_at,
           (select count(*) from training_sessions s
             where s.athlete_id = p.id and not s.planned)
      from profiles p
      join auth.users u on u.id = p.id
      left join teams t on t.id = p.team_id
     order by u.created_at;
end
$function$;

create or replace function public.admin_teams()
returns table (
  id uuid, name text, club text, owner_name text, owner_email text,
  invite_code text, lopere bigint, renn bigint,
  created_at timestamp with time zone
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
           t.created_at
      from teams t
      left join profiles o on o.id = t.owner_id
      left join auth.users u on u.id = t.owner_id
     order by t.created_at;
end
$function$;

-- ---------------------------------------------------------------------------
-- Aktivitet: brukes appen, eller ligger den bare der?
-- ---------------------------------------------------------------------------
create or replace function public.admin_activity()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  return jsonb_build_object(
    'uker', coalesce((
      select jsonb_agg(x order by x->>'uke')
        from (
          select jsonb_build_object(
                   'uke', to_char(date_trunc('week', s.date), 'YYYY-MM-DD'),
                   'okter', count(*),
                   'lopere', count(distinct s.athlete_id)) as x
            from training_sessions s
           where not s.planned and s.date > current_date - 56
           group by date_trunc('week', s.date)
        ) q), '[]'::jsonb),
    'renn_i_planer',  (select count(*) from athlete_races),
    'planlagte_okter',(select count(*) from training_sessions where planned and date >= current_date),
    'aldri_inne',     (select count(*) from auth.users where last_sign_in_at is null)
  );
end
$function$;

-- ---------------------------------------------------------------------------
-- Driftsstatus
--
-- Leser cron-historikken. Finnes ikke pg_cron - typisk et lokalt db reset -
-- svarer funksjonen med tom liste i stedet for å feile, på samme måte som
-- invoke_edge_function.
-- ---------------------------------------------------------------------------
create or replace function public.admin_ops()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_jobs jsonb := '[]'::jsonb;
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;

  if to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null then
    select coalesce(jsonb_agg(x order by x->>'jobb'), '[]'::jsonb) into v_jobs from (
      select jsonb_build_object(
               'jobb', j.jobname,
               'plan', j.schedule,
               'aktiv', j.active,
               'sist', d.start_time,
               'status', d.status,
               'melding', left(coalesce(d.return_message, ''), 200)) as x
        from cron.job j
        left join lateral (
          select r.start_time, r.status, r.return_message
            from cron.job_run_details r
           where r.jobid = j.jobid
           order by r.start_time desc limit 1
        ) d on true
    ) q;
  end if;

  return jsonb_build_object(
    'jobber', v_jobs,
    'fis_liste',    (select max(imported_at) from fis_lists),
    'cupstilling',  (select max(fetched_at) from fis_cup_standings),
    'isonen',       (select max(counted_at) from race_signups),
    'renn',         (select count(*) from races),
    'bakker',       (select count(*) from slopes),
    'fis_lopere',   (select count(*) from fis_list_athletes)
  );
end
$function$;

-- ---------------------------------------------------------------------------
-- Handlinger
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  if p_role not in ('coach', 'athlete', 'parent') then
    raise exception 'Ukjent rolle: %', p_role;
  end if;
  update profiles set role = p_role::user_role where id = p_user;
end
$function$;

create or replace function public.admin_set_admin(p_user uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  -- Uten denne kan man låse seg selv ute av sin egen administratorside, og da
  -- må flagget settes med SQL mot produksjon for å komme inn igjen.
  if not p_on and (select count(*) from profiles where is_admin) <= 1 then
    raise exception 'Kan ikke fjerne den siste administratoren';
  end if;
  update profiles set is_admin = p_on where id = p_user;
end
$function$;

create or replace function public.admin_delete_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  if p_user = auth.uid() then
    raise exception 'Du kan ikke slette deg selv';
  end if;
  -- Resten følger med gjennom cascade og set null.
  delete from auth.users where id = p_user;
end
$function$;

-- ---------------------------------------------------------------------------
-- Invitasjon
--
-- Lagrer invitasjonen og ber edge-funksjonen lage innloggingslenken og sende
-- velkomstmailen. Samme arbeidsdeling som feedback: raden er sannheten,
-- e-posten er beskjeden. Feiler utsendingen, står invitasjonen der med
-- send_error og kan sendes på nytt.
-- ---------------------------------------------------------------------------
create or replace function public.admin_invite_coach(p_email text, p_note text default null)
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
  -- Blokkerer bare adresser som er i aktiv bruk. En invitasjon oppretter
  -- brukeren med en gang, så uten last_sign_in_at-sjekken ville det vært umulig
  -- å sende invitasjonen på nytt til en som aldri kom seg inn.
  if exists (select 1 from auth.users
              where lower(email) = v_email and last_sign_in_at is not null) then
    raise exception 'Den adressen er allerede i bruk';
  end if;

  insert into coach_invites (email, note, invited_by)
  values (v_email, nullif(btrim(p_note), ''), auth.uid())
  on conflict (email)
    do update set note = excluded.note, invited_by = excluded.invited_by,
                  created_at = now(), sent_at = null, send_error = null
  returning id into v_id;

  perform invoke_edge_function('invite-coach', jsonb_build_object('id', v_id), 20000);
  return v_id;
end
$function$;

create or replace function public.admin_invites()
returns table (
  id bigint, email text, note text, created_at timestamp with time zone,
  sent_at timestamp with time zone, send_error text,
  invited_by_name text, sist_innlogget timestamp with time zone
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  return query
    -- Om invitasjonen er tatt i bruk står ikke i tabellen: den leses av at
     -- brukeren faktisk har logget inn. Da kan ingen status bli hengende igjen
     -- og lyve om virkeligheten.
     select i.id, i.email, i.note, i.created_at, i.sent_at, i.send_error,
            p.full_name, u.last_sign_in_at
       from coach_invites i
       left join profiles p on p.id = i.invited_by
       left join auth.users u on lower(u.email) = i.email
      order by i.created_at desc
      limit 100;
end
$function$;

create or replace function public.admin_cancel_invite(p_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  delete from coach_invites where id = p_id;
end
$function$;

-- ---------------------------------------------------------------------------
-- Rettigheter
--
-- Vakten står inne i hver funksjon, men authenticated skal likevel kunne kalle
-- dem - ellers får en vanlig bruker en rettighetsfeil i stedet for et rolig
-- «Bare administrator». anon skal ikke nå dem i det hele tatt.
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'admin_overview()', 'admin_users()', 'admin_teams()', 'admin_activity()',
    'admin_ops()', 'admin_invites()',
    'admin_set_role(uuid, text)', 'admin_set_admin(uuid, boolean)',
    'admin_delete_user(uuid)', 'admin_invite_coach(text, text)',
    'admin_cancel_invite(bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
