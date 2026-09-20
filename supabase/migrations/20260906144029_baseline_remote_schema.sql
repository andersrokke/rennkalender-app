-- Baseline: hele produksjonsskjemaet for prosjektet hggzbixirdaamvkjvgul (Rennkalender).
--
-- Denne filen er en squash av de 19 migrasjonene som ble kjørt direkte mot produksjon
-- fra 2026-09-06 til 2026-09-15, og som aldri fantes som filer. Versjonsnummeret er
-- med vilje satt likt den første av dem (20260906144029), slik at `supabase db push`
-- ser den som allerede anvendt i produksjon og ikke prøver å kjøre den på nytt.
--
-- Alt etter dette punktet skal komme som nye migrasjonsfiler via `supabase db diff`.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.athlete_status as enum ('planned', 'entered', 'wish', 'reserve', 'unavailable');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_role as enum ('coach', 'athlete', 'parent');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Sequences
-- ---------------------------------------------------------------------------
create sequence if not exists public.race_entries_id_seq as bigint increment by 1 start with 1 no cycle;
create sequence if not exists public.race_signups_id_seq as bigint increment by 1 start with 1 no cycle;
create sequence if not exists public.races_id_seq as integer increment by 1 start with 1 no cycle;
create sequence if not exists public.timing_runs_id_seq as bigint increment by 1 start with 1 no cycle;
create sequence if not exists public.venues_id_seq as integer increment by 1 start with 1 no cycle;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.venues (
  id integer default nextval('public.venues_id_seq'::regclass) not null,
  name text not null,
  country character(3) not null,
  lat double precision,
  lng double precision
);

create table if not exists public.races (
  id integer default nextval('public.races_id_seq'::regclass) not null,
  fis_event_id integer,
  start_date date not null,
  end_date date not null,
  venue_id integer,
  place text not null,
  host_nation character(3) not null,
  organiser_nation character(3),
  category text not null,
  events text not null,
  gender text not null,
  note text,
  season text default '2027'::text not null,
  created_at timestamp with time zone default now(),
  isonen_id text,
  isonen_title text,
  signup_deadline timestamp with time zone,
  max_attendees integer
);

create table if not exists public.teams (
  id uuid default gen_random_uuid() not null,
  name text not null,
  club text,
  owner_id uuid not null,
  invite_code text default encode(extensions.gen_random_bytes(6), 'hex'::text),
  created_at timestamp with time zone default now()
);

create table if not exists public.profiles (
  id uuid not null,
  full_name text,
  role user_role default 'athlete'::user_role not null,
  team_id uuid,
  fis_code text,
  birth_year integer,
  gender character(1),
  created_at timestamp with time zone default now(),
  onboarded boolean default false not null,
  home_city text,
  plan_settings jsonb default '{"entry": 350, "hotel": 1200, "kmRate": 3.5, "maxGap": 2}'::jsonb not null,
  lang text default 'no'::text not null,
  theme text default 'light'::text not null,
  link_code text default encode(extensions.gen_random_bytes(4), 'hex'::text),
  is_test boolean default false not null
);

create table if not exists public.guardians (
  parent_id uuid not null,
  athlete_id uuid not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.team_races (
  id uuid default gen_random_uuid() not null,
  team_id uuid not null,
  race_id integer not null,
  coach_note text,
  entry_deadline date,
  travel_info text,
  created_by uuid,
  created_at timestamp with time zone default now()
);

create table if not exists public.athlete_races (
  id uuid default gen_random_uuid() not null,
  athlete_id uuid not null,
  race_id integer not null,
  team_id uuid,
  status athlete_status default 'planned'::athlete_status not null,
  athlete_note text,
  coach_note text,
  updated_at timestamp with time zone default now(),
  assigned_by uuid,
  assigned_at timestamp with time zone
);

create table if not exists public.race_plan_details (
  athlete_id uuid not null,
  race_id integer not null,
  travel_mode text default 'car'::text not null,
  flight_cost numeric,
  nights_override integer,
  starts_override integer,
  note text,
  updated_at timestamp with time zone default now()
);

create table if not exists public.race_signups (
  id bigint default nextval('public.race_signups_id_seq'::regclass) not null,
  race_id integer not null,
  counted_at timestamp with time zone default now() not null,
  participants integer not null,
  teams integer default 0
);

create table if not exists public.race_entries (
  id bigint default nextval('public.race_entries_id_seq'::regclass) not null,
  race_id integer not null,
  discipline text not null,
  class_name text,
  club text,
  fis_code text,
  points numeric,
  fetched_at timestamp with time zone default now(),
  batch timestamp with time zone not null
);

create table if not exists public.entry_reminders (
  athlete_id uuid not null,
  race_id integer not null,
  sent_at timestamp with time zone default now(),
  certainty text not null,
  sent_to text
);

create table if not exists public.follows (
  user_id uuid not null,
  fis_code text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.fis_lists (
  list_id integer not null,
  list_no integer,
  season_code integer,
  name text,
  published date,
  imported_at timestamp with time zone default now(),
  athletes integer
);

create table if not exists public.fis_list_athletes (
  fis_code text not null,
  list_id integer,
  competitor_id text,
  last_name text,
  first_name text,
  nation text,
  gender character(1),
  birth_year integer,
  club text,
  dh numeric,
  sl numeric,
  gs numeric,
  sg numeric,
  ac numeric,
  dh_pos integer,
  sl_pos integer,
  gs_pos integer,
  sg_pos integer,
  ac_pos integer,
  name_key text
);

create table if not exists public.fis_athletes (
  fis_code text not null,
  competitor_id text,
  name text,
  club text,
  nation text,
  birth_year integer,
  updated_at timestamp with time zone default now()
);

create table if not exists public.fis_points (
  fis_code text not null,
  list_id integer not null,
  list_label text,
  season text,
  discipline text not null,
  points numeric,
  rank integer,
  base_list boolean default false,
  fetched_at timestamp with time zone default now()
);

create table if not exists public.fis_results (
  fis_code text not null,
  fis_race_id integer not null,
  race_date date,
  place text,
  discipline text,
  nation text,
  category text,
  category_name text,
  "position" text,
  fis_points numeric,
  cup_points numeric,
  fetched_at timestamp with time zone default now()
);

create table if not exists public.fis_cup_standings (
  cup text not null,
  season text not null,
  gender character(1) not null,
  discipline text not null,
  competitor_id text not null,
  fis_code text,
  name text,
  nation text,
  rank integer,
  points numeric,
  fetched_at timestamp with time zone default now()
);

create table if not exists public.training_sessions (
  id uuid default gen_random_uuid() not null,
  athlete_id uuid not null,
  team_id uuid,
  date date not null,
  discipline text not null,
  gates integer,
  runs integer,
  snow text,
  weather text,
  temp_c numeric,
  venue text,
  minutes integer,
  rpe integer,
  note text,
  created_by uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.timing_imports (
  id uuid default gen_random_uuid() not null,
  team_id uuid not null,
  uploaded_by uuid,
  filename text,
  session_date date,
  discipline text,
  venue text,
  note text,
  rows_total integer default 0,
  rows_mapped integer default 0,
  raw_headers text[],
  created_at timestamp with time zone default now()
);

create table if not exists public.timing_runs (
  id bigint default nextval('public.timing_runs_id_seq'::regclass) not null,
  import_id uuid not null,
  team_id uuid not null,
  athlete_id uuid,
  source_name text not null,
  bib text,
  run_no integer,
  run_time_ms integer,
  run_time_text text,
  status text,
  splits_ms integer[],
  started_at timestamp with time zone,
  extra jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.timing_aliases (
  team_id uuid not null,
  source_name text not null,
  athlete_id uuid not null,
  created_by uuid,
  created_at timestamp with time zone default now()
);

alter sequence public.race_entries_id_seq owned by public.race_entries.id;
alter sequence public.race_signups_id_seq owned by public.race_signups.id;
alter sequence public.races_id_seq owned by public.races.id;
alter sequence public.timing_runs_id_seq owned by public.timing_runs.id;
alter sequence public.venues_id_seq owned by public.venues.id;

-- ---------------------------------------------------------------------------
-- Primary keys, unique keys, checks
-- ---------------------------------------------------------------------------
alter table public.athlete_races add constraint athlete_races_pkey primary key (id);
alter table public.entry_reminders add constraint entry_reminders_pkey primary key (athlete_id, race_id);
alter table public.fis_athletes add constraint fis_athletes_pkey primary key (fis_code);
alter table public.fis_cup_standings add constraint fis_cup_standings_pkey primary key (cup, season, gender, discipline, competitor_id);
alter table public.fis_list_athletes add constraint fis_list_athletes_pkey primary key (fis_code);
alter table public.fis_lists add constraint fis_lists_pkey primary key (list_id);
alter table public.fis_points add constraint fis_points_pkey primary key (fis_code, list_id, discipline);
alter table public.fis_results add constraint fis_results_pkey primary key (fis_code, fis_race_id);
alter table public.follows add constraint follows_pkey primary key (user_id, fis_code);
alter table public.guardians add constraint guardians_pkey primary key (parent_id, athlete_id);
alter table public.profiles add constraint profiles_pkey primary key (id);
alter table public.race_entries add constraint race_entries_pkey primary key (id);
alter table public.race_plan_details add constraint race_plan_details_pkey primary key (athlete_id, race_id);
alter table public.race_signups add constraint race_signups_pkey primary key (id);
alter table public.races add constraint races_pkey primary key (id);
alter table public.team_races add constraint team_races_pkey primary key (id);
alter table public.teams add constraint teams_pkey primary key (id);
alter table public.timing_aliases add constraint timing_aliases_pkey primary key (team_id, source_name);
alter table public.timing_imports add constraint timing_imports_pkey primary key (id);
alter table public.timing_runs add constraint timing_runs_pkey primary key (id);
alter table public.training_sessions add constraint training_sessions_pkey primary key (id);
alter table public.venues add constraint venues_pkey primary key (id);

alter table public.athlete_races add constraint athlete_races_athlete_id_race_id_key unique (athlete_id, race_id);
alter table public.fis_athletes add constraint fis_athletes_competitor_id_key unique (competitor_id);
alter table public.profiles add constraint profiles_link_code_key unique (link_code);
alter table public.races add constraint races_fis_event_id_key unique (fis_event_id);
alter table public.races add constraint races_isonen_id_key unique (isonen_id);
alter table public.team_races add constraint team_races_team_id_race_id_key unique (team_id, race_id);
alter table public.teams add constraint teams_invite_code_key unique (invite_code);
alter table public.venues add constraint venues_name_key unique (name);

alter table public.entry_reminders add constraint entry_reminders_certainty_check check ((certainty = any (array['missing'::text, 'unknown'::text])));
alter table public.profiles add constraint profiles_gender_check check ((gender = any (array['W'::bpchar, 'M'::bpchar])));
alter table public.profiles add constraint profiles_lang_check check ((lang = any (array['no'::text, 'sv'::text, 'en'::text])));
alter table public.profiles add constraint profiles_theme_check check ((theme = any (array['light'::text, 'dark'::text])));
alter table public.race_plan_details add constraint race_plan_details_travel_mode_check check ((travel_mode = any (array['bus'::text, 'car'::text, 'flight'::text])));
alter table public.races add constraint races_gender_check check ((gender = any (array['W'::text, 'M'::text, 'W M'::text])));
alter table public.timing_imports add constraint timing_imports_discipline_check check ((discipline = any (array['SL'::text, 'GS'::text, 'SG'::text, 'DH'::text, 'FREE'::text])));
alter table public.training_sessions add constraint training_sessions_discipline_check check ((discipline = any (array['SL'::text, 'GS'::text, 'SG'::text, 'DH'::text, 'FREE'::text, 'COND'::text])));
alter table public.training_sessions add constraint training_sessions_rpe_check check (((rpe >= 1) and (rpe <= 10)));
alter table public.training_sessions add constraint training_sessions_snow_check check ((snow = any (array['ice'::text, 'hard'::text, 'grippy'::text, 'soft'::text, 'slush'::text, 'powder'::text, 'artificial'::text])));
alter table public.training_sessions add constraint training_sessions_weather_check check ((weather = any (array['sun'::text, 'cloudy'::text, 'flat_light'::text, 'snow'::text, 'fog'::text, 'rain'::text, 'wind'::text])));

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------
alter table public.athlete_races add constraint athlete_races_assigned_by_fkey foreign key (assigned_by) references public.profiles(id);
alter table public.athlete_races add constraint athlete_races_athlete_id_fkey foreign key (athlete_id) references public.profiles(id) on delete cascade;
alter table public.athlete_races add constraint athlete_races_race_id_fkey foreign key (race_id) references public.races(id) on delete cascade;
alter table public.athlete_races add constraint athlete_races_team_id_fkey foreign key (team_id) references public.teams(id) on delete cascade;
alter table public.entry_reminders add constraint entry_reminders_athlete_id_fkey foreign key (athlete_id) references public.profiles(id) on delete cascade;
alter table public.entry_reminders add constraint entry_reminders_race_id_fkey foreign key (race_id) references public.races(id) on delete cascade;
alter table public.fis_list_athletes add constraint fis_list_athletes_list_id_fkey foreign key (list_id) references public.fis_lists(list_id);
alter table public.fis_points add constraint fis_points_fis_code_fkey foreign key (fis_code) references public.fis_athletes(fis_code) on delete cascade;
alter table public.fis_results add constraint fis_results_fis_code_fkey foreign key (fis_code) references public.fis_athletes(fis_code) on delete cascade;
alter table public.follows add constraint follows_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.guardians add constraint guardians_athlete_id_fkey foreign key (athlete_id) references public.profiles(id) on delete cascade;
alter table public.guardians add constraint guardians_parent_id_fkey foreign key (parent_id) references public.profiles(id) on delete cascade;
alter table public.profiles add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
alter table public.profiles add constraint profiles_team_id_fkey foreign key (team_id) references public.teams(id) on delete set null;
alter table public.race_entries add constraint race_entries_race_id_fkey foreign key (race_id) references public.races(id) on delete cascade;
alter table public.race_plan_details add constraint race_plan_details_athlete_id_fkey foreign key (athlete_id) references public.profiles(id) on delete cascade;
alter table public.race_plan_details add constraint race_plan_details_race_id_fkey foreign key (race_id) references public.races(id) on delete cascade;
alter table public.race_signups add constraint race_signups_race_id_fkey foreign key (race_id) references public.races(id) on delete cascade;
alter table public.races add constraint races_venue_id_fkey foreign key (venue_id) references public.venues(id);
alter table public.team_races add constraint team_races_created_by_fkey foreign key (created_by) references public.profiles(id);
alter table public.team_races add constraint team_races_race_id_fkey foreign key (race_id) references public.races(id) on delete cascade;
alter table public.team_races add constraint team_races_team_id_fkey foreign key (team_id) references public.teams(id) on delete cascade;
alter table public.teams add constraint teams_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete cascade;
alter table public.timing_aliases add constraint timing_aliases_athlete_id_fkey foreign key (athlete_id) references public.profiles(id) on delete cascade;
alter table public.timing_aliases add constraint timing_aliases_created_by_fkey foreign key (created_by) references public.profiles(id);
alter table public.timing_aliases add constraint timing_aliases_team_id_fkey foreign key (team_id) references public.teams(id) on delete cascade;
alter table public.timing_imports add constraint timing_imports_team_id_fkey foreign key (team_id) references public.teams(id) on delete cascade;
alter table public.timing_imports add constraint timing_imports_uploaded_by_fkey foreign key (uploaded_by) references public.profiles(id);
alter table public.timing_runs add constraint timing_runs_athlete_id_fkey foreign key (athlete_id) references public.profiles(id) on delete set null;
alter table public.timing_runs add constraint timing_runs_import_id_fkey foreign key (import_id) references public.timing_imports(id) on delete cascade;
alter table public.timing_runs add constraint timing_runs_team_id_fkey foreign key (team_id) references public.teams(id) on delete cascade;
alter table public.training_sessions add constraint training_sessions_athlete_id_fkey foreign key (athlete_id) references public.profiles(id) on delete cascade;
alter table public.training_sessions add constraint training_sessions_created_by_fkey foreign key (created_by) references public.profiles(id);
alter table public.training_sessions add constraint training_sessions_team_id_fkey foreign key (team_id) references public.teams(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists cup_standings_fis on public.fis_cup_standings using btree (fis_code);
create index if not exists fis_list_athletes_name on public.fis_list_athletes using btree (name_key);
create index if not exists fis_list_athletes_nation on public.fis_list_athletes using btree (nation);
create index if not exists race_entries_race on public.race_entries using btree (race_id, discipline, batch desc);
create index if not exists race_signups_race_time on public.race_signups using btree (race_id, counted_at desc);
create index if not exists races_start_idx on public.races using btree (start_date);
create index if not exists timing_runs_athlete on public.timing_runs using btree (athlete_id, started_at desc);
create index if not exists timing_runs_import on public.timing_runs using btree (import_id);
create index if not exists timing_runs_unmapped on public.timing_runs using btree (team_id) where (athlete_id is null);
create index if not exists training_athlete_date on public.training_sessions using btree (athlete_id, date desc);
create index if not exists training_team_date on public.training_sessions using btree (team_id, date desc);

-- ---------------------------------------------------------------------------
-- Functions
--
-- Alle er SECURITY DEFINER med `set search_path to 'public'`. Rettighetene
-- nederst i denne seksjonen er viktige: standardrettighetene i Supabase gir
-- `anon` EXECUTE paa alt nytt, og produksjon har den rettigheten trukket
-- tilbake. Uten revoke-linjene blir et lokalt skjema mer aapent enn produksjon.
-- ---------------------------------------------------------------------------

create or replace function public.assign_race(p_race_id integer, p_athletes uuid[])
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare t uuid; n int := 0; a uuid;
begin
  select team_id into t from profiles where id = auth.uid();
  if t is null or not is_coach_of(t) then raise exception 'Bare trener kan tildele renn'; end if;
  foreach a in array p_athletes loop
    if exists (select 1 from profiles p where p.id = a and p.team_id = t and p.role = 'athlete') then
      insert into athlete_races (athlete_id, race_id, team_id, status, assigned_by, assigned_at)
      values (a, p_race_id, t, 'planned', auth.uid(), now())
      on conflict (athlete_id, race_id) do update
        -- leave status alone: wish, unavailable and entered all stand
        set assigned_by = auth.uid(), assigned_at = now();
      n := n + 1;
    end if;
  end loop;
  return n;
end $function$;

create or replace function public.can_see_fis(code text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from profiles p where p.fis_code = code
    and (p.id = auth.uid() or (p.team_id is not null and p.team_id = my_team()) or is_guardian_of(p.id)))
$function$;

create or replace function public.entry_gaps()
 returns table(athlete_id uuid, athlete_name text, email text, fis_code text, race_id integer, place text, start_date date, deadline timestamp with time zone, certainty text, guardian_emails text[])
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with latest as (
    select race_id, max(batch) as b from race_entries group by race_id
  ), entered as (
    select e.race_id, e.fis_code from race_entries e join latest l
      on l.race_id = e.race_id and l.b = e.batch where e.fis_code is not null
  )
  select p.id, p.full_name, u.email, p.fis_code, r.id, r.place, r.start_date, r.signup_deadline,
    case when l.race_id is null then 'unknown' else 'missing' end,
    array(select gu.email from guardians g join auth.users gu on gu.id = g.parent_id where g.athlete_id = p.id)
  from athlete_races ar
  join profiles p on p.id = ar.athlete_id
  join auth.users u on u.id = p.id
  join races r on r.id = ar.race_id
  left join latest l on l.race_id = r.id
  where ar.status in ('planned','entered')
    and r.signup_deadline is not null
    and r.signup_deadline between now() and now() + interval '24 hours'
    and not exists (select 1 from entered e where e.race_id = r.id and e.fis_code = p.fis_code)
    and not exists (select 1 from entry_reminders er where er.athlete_id = p.id and er.race_id = r.id)
$function$;

create or replace function public.fis_lookup(code text)
 returns table(fis_code text, first_name text, last_name text, club text, nation text, birth_year integer, sl numeric, gs numeric, sg numeric, dh numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select fis_code, first_name, last_name, club, nation, birth_year, sl, gs, sg, dh from fis_list_athletes where fis_code = code
$function$;

create or replace function public.friend_entries()
 returns table(fis_code text, first_name text, last_name text, club text, race_id integer, place text, start_date date, end_date date, discipline text, class_name text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with latest as (
    select race_id, discipline, max(batch) as b from race_entries group by race_id, discipline
  )
  select e.fis_code, a.first_name, a.last_name, a.club, r.id, r.place, r.start_date, r.end_date, e.discipline, e.class_name
  from follows f
  join race_entries e on e.fis_code = f.fis_code
  join latest l on l.race_id = e.race_id and l.discipline = e.discipline and l.b = e.batch
  join races r on r.id = e.race_id
  left join fis_list_athletes a on a.fis_code = f.fis_code
  where f.user_id = auth.uid()
  order by r.start_date
$function$;

create or replace function public.friends_per_race()
 returns table(race_id integer, friends integer, names text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with fe as (select distinct race_id, fis_code, first_name from friend_entries())
  select race_id, count(*)::int, string_agg(coalesce(first_name, fis_code), ', ') from fe group by race_id
$function$;

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email),
          coalesce((new.raw_user_meta_data->>'role')::user_role, 'athlete'));
  return new;
end $function$;

create or replace function public.is_coach_of(t uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from profiles where id = auth.uid() and role='coach' and team_id = t)
      or exists (select 1 from teams where id = t and owner_id = auth.uid())
$function$;

create or replace function public.is_guardian_of(a uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from guardians where parent_id = auth.uid() and athlete_id = a)
$function$;

create or replace function public.join_team(code text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare t uuid;
begin
  select id into t from teams where invite_code = code;
  if t is null then raise exception 'Ugyldig invitasjonskode'; end if;
  update profiles set team_id = t where id = auth.uid();
  return t;
end $function$;

create or replace function public.link_guardian(code text)
 returns table(athlete_id uuid, full_name text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare a_id uuid; a_name text;
begin
  select id, profiles.full_name into a_id, a_name from profiles where link_code = lower(trim(code)) and role = 'athlete';
  if a_id is null then raise exception 'Ugyldig kode'; end if;
  if a_id = auth.uid() then raise exception 'Du kan ikke koble deg til deg selv'; end if;
  insert into guardians(parent_id, athlete_id) values (auth.uid(), a_id) on conflict do nothing;
  update profiles set role = 'parent', onboarded = true where id = auth.uid() and role <> 'coach';
  return query select a_id, a_name;
end $function$;

create or replace function public.log_training(p_athletes uuid[], p_date date, p_discipline text, p_gates integer default null::integer, p_runs integer default null::integer, p_snow text default null::text, p_weather text default null::text, p_temp numeric default null::numeric, p_venue text default null::text, p_minutes integer default null::integer, p_note text default null::text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare t uuid; n int := 0; a uuid;
begin
  select team_id into t from profiles where id = auth.uid();
  if t is null or not is_coach_of(t) then raise exception 'Bare trener kan registrere for laget'; end if;
  foreach a in array p_athletes loop
    if exists (select 1 from profiles p where p.id = a and p.team_id = t and p.role = 'athlete') then
      insert into training_sessions (athlete_id, team_id, date, discipline, gates, runs, snow, weather, temp_c, venue, minutes, note, created_by)
      values (a, t, p_date, p_discipline, p_gates, p_runs, p_snow, p_weather, p_temp, p_venue, p_minutes, p_note, auth.uid());
      n := n + 1;
    end if;
  end loop;
  return n;
end $function$;

create or replace function public.map_timing_name(p_team uuid, p_source text, p_athlete uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n int;
begin
  if not is_coach_of(p_team) then raise exception 'Bare trener kan koble navn'; end if;
  if not exists (select 1 from profiles where id = p_athlete and team_id = p_team and role = 'athlete')
    then raise exception 'Løperen er ikke i laget'; end if;
  insert into timing_aliases (team_id, source_name, athlete_id, created_by)
  values (p_team, p_source, p_athlete, auth.uid())
  on conflict (team_id, source_name) do update set athlete_id = excluded.athlete_id, created_by = auth.uid();
  update timing_runs set athlete_id = p_athlete
   where team_id = p_team and source_name = p_source and athlete_id is distinct from p_athlete;
  get diagnostics n = row_count;
  update timing_imports i set rows_mapped = (select count(*) from timing_runs r where r.import_id = i.id and r.athlete_id is not null)
   where i.team_id = p_team;
  return n;
end $function$;

create or replace function public.my_children()
 returns table(athlete_id uuid, full_name text, fis_code text, birth_year integer, gender character, team_id uuid, team_name text, club text, races integer, race_days integer, next_race date, next_place text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.id, p.full_name, p.fis_code, p.birth_year, p.gender, p.team_id, t.name, t.club,
    (select count(*)::int from athlete_races ar where ar.athlete_id = p.id and ar.status in ('planned','entered')),
    (select coalesce(sum(r.end_date - r.start_date + 1),0)::int from athlete_races ar join races r on r.id = ar.race_id
       where ar.athlete_id = p.id and ar.status in ('planned','entered')),
    (select min(r.start_date) from athlete_races ar join races r on r.id = ar.race_id
       where ar.athlete_id = p.id and ar.status in ('planned','entered') and r.start_date >= current_date),
    (select r.place from athlete_races ar join races r on r.id = ar.race_id
       where ar.athlete_id = p.id and ar.status in ('planned','entered') and r.start_date >= current_date
       order by r.start_date limit 1)
  from guardians g join profiles p on p.id = g.athlete_id
  left join teams t on t.id = p.team_id
  where g.parent_id = auth.uid()
  order by p.full_name $function$;

create or replace function public.my_cup_standings()
 returns table(fis_code text, name text, cup text, season text, discipline text, rank integer, points numeric, field integer, updated timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with mine as (
    select fis_code from profiles where id = auth.uid() and fis_code is not null
    union select fis_code from follows where user_id = auth.uid()
  ), field as (
    select cup, season, gender, discipline, count(*)::int as n from fis_cup_standings group by 1,2,3,4
  )
  select s.fis_code, s.name, s.cup, s.season, s.discipline, s.rank, s.points, f.n, s.fetched_at
  from fis_cup_standings s join mine m on m.fis_code = s.fis_code
  join field f on f.cup=s.cup and f.season=s.season and f.gender=s.gender and f.discipline=s.discipline
  order by s.season desc, s.cup, case s.discipline when 'ALL' then 0 else 1 end, s.discipline
$function$;

create or replace function public.my_guardians()
 returns table(parent_id uuid, full_name text, since timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select g.parent_id, p.full_name, g.created_at from guardians g join profiles p on p.id = g.parent_id
  where g.athlete_id = auth.uid() $function$;

create or replace function public.my_role()
 returns user_role
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select role from profiles where id = auth.uid()
$function$;

create or replace function public.my_team()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select team_id from profiles where id = auth.uid()
$function$;

create or replace function public.predicted_start(p_race_id integer, p_discipline text, p_fis_code text)
 returns table(entries integer, with_points integer, rank_by_points integer, draw_group integer, predicted_bib integer, my_points numeric, gap_to_draw numeric)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare b timestamptz; dg int; mypts numeric;
begin
  select max(batch) into b from race_entries where race_id = p_race_id and discipline = p_discipline;
  if b is null then return; end if;
  dg := case when p_discipline in ('DH','SG') then 30 else 15 end;
  select re.points into mypts from race_entries re where re.race_id=p_race_id and re.discipline=p_discipline and re.batch=b and re.fis_code=p_fis_code limit 1;
  if mypts is null then
    select case p_discipline when 'SL' then sl when 'GS' then gs when 'SG' then sg when 'DH' then dh end into mypts from fis_list_athletes where fis_code=p_fis_code;
  end if;
  return query
  with ent as (select coalesce(re.points, 999) as pts, re.fis_code from race_entries re where re.race_id=p_race_id and re.discipline=p_discipline and re.batch=b),
  ranked as (select pts, fis_code, row_number() over (order by pts, fis_code) as rn from ent)
  select (select count(*)::int from ent),
         (select count(*)::int from ent where pts < 999),
         (select rn::int from ranked where fis_code = p_fis_code),
         dg,
         (select case when rn <= dg then null else rn::int end from ranked where fis_code = p_fis_code),
         mypts,
         (select case when rn <= dg then 0 else round(mypts - (select pts from ranked where rn = dg), 2) end from ranked where fis_code = p_fis_code);
end $function$;

create or replace function public.revoke_guardian(parent uuid)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  delete from guardians where athlete_id = auth.uid() and parent_id = parent $function$;

create or replace function public.team_race_athletes()
 returns table(race_id integer, athlete_id uuid, full_name text, status athlete_status, assigned boolean, birth_year integer, gender character, fis_code text, sl numeric, gs numeric, sg numeric, dh numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select r.id, p.id, p.full_name, ar.status, ar.assigned_by is not null,
         p.birth_year, p.gender, p.fis_code, f.sl, f.gs, f.sg, f.dh
  from team_races tr
  join races r on r.id = tr.race_id
  join profiles p on p.team_id = tr.team_id and p.role = 'athlete'
  left join athlete_races ar on ar.athlete_id = p.id and ar.race_id = r.id
  left join fis_list_athletes f on f.fis_code = p.fis_code
  where is_coach_of(tr.team_id)
  order by r.start_date, p.full_name
$function$;

create or replace function public.timing_stats(p_from date default null::date, p_to date default null::date)
 returns table(athlete_id uuid, full_name text, session_date date, discipline text, venue text, runs integer, finished integer, dnf integer, best_ms integer, median_ms integer, spread_ms integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with scope as (
    select id, full_name from profiles p
    where p.id = auth.uid() or is_guardian_of(p.id)
       or (p.team_id is not null and is_coach_of(p.team_id) and p.role = 'athlete')
  )
  select s.id, s.full_name, i.session_date, i.discipline, i.venue,
         count(*)::int,
         count(*) filter (where r.run_time_ms is not null)::int,
         count(*) filter (where r.status is not null and r.status <> 'OK')::int,
         min(r.run_time_ms)::int,
         (percentile_cont(0.5) within group (order by r.run_time_ms))::int,
         (max(r.run_time_ms) - min(r.run_time_ms))::int
  from scope s
  join timing_runs r on r.athlete_id = s.id
  join timing_imports i on i.id = r.import_id
  where (p_from is null or i.session_date >= p_from)
    and (p_to is null or i.session_date <= p_to)
  group by 1,2,3,4,5 order by 3 desc, 2
$function$;

create or replace function public.training_summary(p_from date default null::date, p_to date default null::date)
 returns table(athlete_id uuid, full_name text, discipline text, sessions integer, gates bigint, runs bigint, minutes bigint, days integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with scope as (
    select id, full_name from profiles p
    where p.id = auth.uid()
       or is_guardian_of(p.id)
       or (p.team_id is not null and is_coach_of(p.team_id) and p.role = 'athlete')
  )
  select s.id, s.full_name, t.discipline,
         count(*)::int, coalesce(sum(t.gates),0), coalesce(sum(t.runs),0),
         coalesce(sum(t.minutes),0), count(distinct t.date)::int
  from scope s join training_sessions t on t.athlete_id = s.id
  where t.date >= coalesce(p_from, case when extract(month from current_date) >= 7
        then make_date(extract(year from current_date)::int, 7, 1)
        else make_date(extract(year from current_date)::int - 1, 7, 1) end)
    and t.date <= coalesce(p_to, current_date)
  group by 1,2,3 order by 2,3
$function$;

create or replace function public.training_weekly(p_weeks integer default 26)
 returns table(athlete_id uuid, full_name text, week date, discipline text, gates bigint, sessions integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with scope as (
    select id, full_name from profiles p
    where p.id = auth.uid() or is_guardian_of(p.id)
       or (p.team_id is not null and is_coach_of(p.team_id) and p.role = 'athlete')
  )
  select s.id, s.full_name, date_trunc('week', t.date)::date, t.discipline,
         coalesce(sum(t.gates),0), count(*)::int
  from scope s join training_sessions t on t.athlete_id = s.id
  where t.date >= current_date - (p_weeks * 7)
  group by 1,2,3,4 order by 3
$function$;

create or replace function public.unassign_race(p_race_id integer, p_athletes uuid[])
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare t uuid; n int;
begin
  select team_id into t from profiles where id = auth.uid();
  if t is null or not is_coach_of(t) then raise exception 'Bare trener kan fjerne tildeling'; end if;

  -- nothing but the coach's proposal: drop the row
  delete from athlete_races ar using profiles p
   where ar.athlete_id = p.id and p.team_id = t
     and ar.race_id = p_race_id and ar.athlete_id = any(p_athletes)
     and ar.assigned_by is not null
     and ar.status = 'planned'
     and ar.athlete_note is null;
  get diagnostics n = row_count;

  -- the athlete has said something: keep the row, withdraw the assignment
  update athlete_races ar set assigned_by = null, assigned_at = null
    from profiles p
   where ar.athlete_id = p.id and p.team_id = t
     and ar.race_id = p_race_id and ar.athlete_id = any(p_athletes)
     and ar.assigned_by is not null;
  return n;
end $function$;

create or replace function public.unlink_guardian(child uuid)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  delete from guardians where parent_id = auth.uid() and athlete_id = child $function$;

-- Function privileges: produksjon har EXECUTE trukket tilbake fra anon/public.
-- entry_gaps og handle_new_user kalles bare av cron/edge (service_role) og trigger.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    if f.proname in ('entry_gaps', 'handle_new_user') then
      execute format('revoke all on function %s from authenticated', f.sig);
      execute format('grant execute on function %s to service_role', f.sig);
    else
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Views
--
-- security_invoker=on er avgjorende: uten den kjorer viewet med eierens
-- rettigheter og RLS paa underliggende tabeller blir omgaatt.
-- team_season brukes ikke av appen (per 2026-09-20), men beholdes her slik at
-- baseline er identisk med produksjon. Sletting behandles som egen migrasjon.
-- ---------------------------------------------------------------------------
create or replace view public.race_signup_latest with (security_invoker=on) as
 with latest as (
         select distinct on (race_signups.race_id) race_signups.race_id,
            race_signups.participants,
            race_signups.counted_at
           from race_signups
          order by race_signups.race_id, race_signups.counted_at desc
        ), week as (
         select distinct on (race_signups.race_id) race_signups.race_id,
            race_signups.participants as participants_7d
           from race_signups
          where race_signups.counted_at <= (now() - '7 days'::interval)
          order by race_signups.race_id, race_signups.counted_at desc
        )
 select l.race_id,
    l.participants,
    l.counted_at,
    w.participants_7d,
    l.participants - coalesce(w.participants_7d, l.participants) as delta_7d
   from latest l
     left join week w on w.race_id = l.race_id;

create or replace view public.team_season with (security_invoker=on) as
 select tr.team_id,
    r.id,
    r.fis_event_id,
    r.start_date,
    r.end_date,
    r.venue_id,
    r.place,
    r.host_nation,
    r.organiser_nation,
    r.category,
    r.events,
    r.gender,
    r.note,
    r.season,
    r.created_at,
    tr.coach_note,
    tr.entry_deadline,
    tr.travel_info,
    ( select count(*) as count
           from athlete_races ar
          where ar.race_id = r.id and ar.team_id = tr.team_id and (ar.status = any (array['planned'::athlete_status, 'entered'::athlete_status]))) as athletes_going
   from team_races tr
     join races r on r.id = tr.race_id;

-- ---------------------------------------------------------------------------
-- Trigger on auth.users
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.athlete_races enable row level security;
alter table public.entry_reminders enable row level security;
alter table public.fis_athletes enable row level security;
alter table public.fis_cup_standings enable row level security;
alter table public.fis_list_athletes enable row level security;
alter table public.fis_lists enable row level security;
alter table public.fis_points enable row level security;
alter table public.fis_results enable row level security;
alter table public.follows enable row level security;
alter table public.guardians enable row level security;
alter table public.profiles enable row level security;
alter table public.race_entries enable row level security;
alter table public.race_plan_details enable row level security;
alter table public.race_signups enable row level security;
alter table public.races enable row level security;
alter table public.team_races enable row level security;
alter table public.teams enable row level security;
alter table public.timing_aliases enable row level security;
alter table public.timing_imports enable row level security;
alter table public.timing_runs enable row level security;
alter table public.training_sessions enable row level security;
alter table public.venues enable row level security;

-- ---------------------------------------------------------------------------
-- Policies (39 stk, alle permissive)
-- ---------------------------------------------------------------------------
drop policy if exists "athlete_races read" on public.athlete_races;
create policy "athlete_races read" on public.athlete_races as permissive for select to authenticated
  using (((athlete_id = auth.uid()) or is_coach_of(team_id) or is_guardian_of(athlete_id)));

drop policy if exists "athlete_races athlete write" on public.athlete_races;
create policy "athlete_races athlete write" on public.athlete_races as permissive for insert to authenticated
  with check ((athlete_id = auth.uid()));

drop policy if exists "athlete_races athlete update" on public.athlete_races;
create policy "athlete_races athlete update" on public.athlete_races as permissive for update to authenticated
  using ((athlete_id = auth.uid()));

drop policy if exists "athlete_races athlete delete" on public.athlete_races;
create policy "athlete_races athlete delete" on public.athlete_races as permissive for delete to authenticated
  using ((athlete_id = auth.uid()));

drop policy if exists "athlete_races coach write" on public.athlete_races;
create policy "athlete_races coach write" on public.athlete_races as permissive for all to authenticated
  using (is_coach_of(team_id))
  with check (is_coach_of(team_id));

drop policy if exists "reminders own" on public.entry_reminders;
create policy "reminders own" on public.entry_reminders as permissive for select to authenticated
  using (((athlete_id = auth.uid()) or is_guardian_of(athlete_id)));

drop policy if exists "fis_athletes read" on public.fis_athletes;
create policy "fis_athletes read" on public.fis_athletes as permissive for select to authenticated
  using (can_see_fis(fis_code));

drop policy if exists "cup read" on public.fis_cup_standings;
create policy "cup read" on public.fis_cup_standings as permissive for select to authenticated
  using (true);

drop policy if exists "cup read anon" on public.fis_cup_standings;
create policy "cup read anon" on public.fis_cup_standings as permissive for select to anon
  using (true);

drop policy if exists "fis_list self" on public.fis_list_athletes;
create policy "fis_list self" on public.fis_list_athletes as permissive for select to authenticated
  using (can_see_fis(fis_code));

drop policy if exists "fis_lists read" on public.fis_lists;
create policy "fis_lists read" on public.fis_lists as permissive for select to authenticated
  using (true);

drop policy if exists "fis_points read" on public.fis_points;
create policy "fis_points read" on public.fis_points as permissive for select to authenticated
  using (can_see_fis(fis_code));

drop policy if exists "fis_results read" on public.fis_results;
create policy "fis_results read" on public.fis_results as permissive for select to authenticated
  using (can_see_fis(fis_code));

drop policy if exists "follows own" on public.follows;
create policy "follows own" on public.follows as permissive for all to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

drop policy if exists "guardians read" on public.guardians;
create policy "guardians read" on public.guardians as permissive for select to authenticated
  using (((parent_id = auth.uid()) or (athlete_id = auth.uid())));

drop policy if exists "guardians insert" on public.guardians;
create policy "guardians insert" on public.guardians as permissive for insert to authenticated
  with check ((athlete_id = auth.uid()));

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles as permissive for select to authenticated
  using (((id = auth.uid()) or ((team_id is not null) and (team_id = my_team())) or is_guardian_of(id)));

drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles as permissive for update to authenticated
  using ((id = auth.uid()));

drop policy if exists "profiles coach update" on public.profiles;
create policy "profiles coach update" on public.profiles as permissive for update to authenticated
  using (is_coach_of(team_id));

drop policy if exists "entries read" on public.race_entries;
create policy "entries read" on public.race_entries as permissive for select to authenticated
  using (true);

drop policy if exists "plan details own" on public.race_plan_details;
create policy "plan details own" on public.race_plan_details as permissive for all to authenticated
  using ((athlete_id = auth.uid()))
  with check ((athlete_id = auth.uid()));

drop policy if exists "plan details coach or guardian read" on public.race_plan_details;
create policy "plan details coach or guardian read" on public.race_plan_details as permissive for select to authenticated
  using ((is_guardian_of(athlete_id) or (exists ( select 1
   from profiles p
  where ((p.id = race_plan_details.athlete_id) and (p.team_id is not null) and is_coach_of(p.team_id))))));

drop policy if exists "signups read" on public.race_signups;
create policy "signups read" on public.race_signups as permissive for select to authenticated
  using (true);

drop policy if exists "signups read anon" on public.race_signups;
create policy "signups read anon" on public.race_signups as permissive for select to anon
  using (true);

drop policy if exists "races read" on public.races;
create policy "races read" on public.races as permissive for select to authenticated
  using (true);

drop policy if exists "team_races read" on public.team_races;
create policy "team_races read" on public.team_races as permissive for select to authenticated
  using (((team_id = my_team()) or is_coach_of(team_id) or (exists ( select 1
   from (guardians g
     join profiles p on ((p.id = g.athlete_id)))
  where ((g.parent_id = auth.uid()) and (p.team_id = team_races.team_id))))));

drop policy if exists "team_races write" on public.team_races;
create policy "team_races write" on public.team_races as permissive for all to authenticated
  using (is_coach_of(team_id))
  with check (is_coach_of(team_id));

drop policy if exists "teams read" on public.teams;
create policy "teams read" on public.teams as permissive for select to authenticated
  using (((owner_id = auth.uid()) or (id = my_team())));

drop policy if exists "teams insert" on public.teams;
create policy "teams insert" on public.teams as permissive for insert to authenticated
  with check ((owner_id = auth.uid()));

drop policy if exists "teams update" on public.teams;
create policy "teams update" on public.teams as permissive for update to authenticated
  using (is_coach_of(id));

drop policy if exists "aliases coach" on public.timing_aliases;
create policy "aliases coach" on public.timing_aliases as permissive for all to authenticated
  using (is_coach_of(team_id))
  with check (is_coach_of(team_id));

drop policy if exists "imports coach" on public.timing_imports;
create policy "imports coach" on public.timing_imports as permissive for all to authenticated
  using (is_coach_of(team_id))
  with check (is_coach_of(team_id));

drop policy if exists "imports own" on public.timing_imports;
create policy "imports own" on public.timing_imports as permissive for select to authenticated
  using ((exists ( select 1
   from timing_runs r
  where ((r.import_id = timing_imports.id) and ((r.athlete_id = auth.uid()) or is_guardian_of(r.athlete_id))))));

drop policy if exists "runs coach" on public.timing_runs;
create policy "runs coach" on public.timing_runs as permissive for all to authenticated
  using (is_coach_of(team_id))
  with check (is_coach_of(team_id));

drop policy if exists "runs own" on public.timing_runs;
create policy "runs own" on public.timing_runs as permissive for select to authenticated
  using (((athlete_id = auth.uid()) or is_guardian_of(athlete_id)));

drop policy if exists "training own" on public.training_sessions;
create policy "training own" on public.training_sessions as permissive for all to authenticated
  using ((athlete_id = auth.uid()))
  with check ((athlete_id = auth.uid()));

drop policy if exists "training coach" on public.training_sessions;
create policy "training coach" on public.training_sessions as permissive for all to authenticated
  using ((exists ( select 1
   from profiles p
  where ((p.id = training_sessions.athlete_id) and (p.team_id is not null) and is_coach_of(p.team_id)))))
  with check ((exists ( select 1
   from profiles p
  where ((p.id = training_sessions.athlete_id) and (p.team_id is not null) and is_coach_of(p.team_id)))));

drop policy if exists "training guardian read" on public.training_sessions;
create policy "training guardian read" on public.training_sessions as permissive for select to authenticated
  using (is_guardian_of(athlete_id));

drop policy if exists "venues read" on public.venues;
create policy "venues read" on public.venues as permissive for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Grants
--
-- Dette er de samme rettighetene som Supabase sine default privileges gir, men
-- skrevet ut eksplisitt slik at de er synlige i git og ikke avhenger av at
-- default privileges er identiske i et lokalt prosjekt.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
