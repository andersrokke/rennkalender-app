-- Testbrukere for Rennkalender.
--
-- Kjøres automatisk av `supabase db reset` mot et lokalt prosjekt.
-- Den samme fila kan limes inn i SQL-editoren i produksjon for å gjenopprette
-- testbrukerne hvis de blir slettet. Fila er idempotent: brukere som allerede
-- finnes blir stående urørt, med rennene og treningene sine i behold.
--
-- Fem brukere på @test.rennkalender, alle med passordet Testpassord1! og
-- profiles.is_test = true:
--
--   trener@test.rennkalender     Test Trener      trener, eier laget Testlaget
--   lukas@test.rennkalender      Lukas Testløper  løper i Testlaget, FIS 423032
--   storm@test.rennkalender      Storm Testløper  løper i Testlaget, FIS 423033
--   forelder@test.rennkalender   Test Forelder    forelder, koblet til Lukas
--   svensk@test.rennkalender     Svensk Åkare     løper uten lag (solo)
--
-- Slett dem igjen med scripts/drop-test-users.sql før ekte brukere slippes inn.

-- ---------------------------------------------------------------------------
-- Hjelpefunksjon: oppretter en auth-bruker med passord hvis den ikke finnes.
-- handle_new_user-triggeren lager profilraden.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.seed_test_user(
  p_email text,
  p_full_name text,
  p_role public.user_role,
  p_password text default 'Testpassord1!'
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  if v_id is not null then
    return v_id;
  end if;

  v_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', p_full_name, 'role', p_role::text),
    now(), now(), '', '', '', ''
  );

  -- Uten identitetsraden finner GoTrue ingen bruker å logge inn med passord.
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id, v_id::text, 'email',
    jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true, 'phone_verified', false),
    now(), now(), now()
  );

  return v_id;
end
$$;

do $$
declare
  v_coach uuid;
  v_lukas uuid;
  v_storm uuid;
  v_parent uuid;
  v_swede uuid;
  v_team uuid;
begin
  v_coach  := pg_temp.seed_test_user('trener@test.rennkalender',   'Test Trener',     'coach');
  v_lukas  := pg_temp.seed_test_user('lukas@test.rennkalender',    'Lukas Testløper', 'athlete');
  v_storm  := pg_temp.seed_test_user('storm@test.rennkalender',    'Storm Testløper', 'athlete');
  v_parent := pg_temp.seed_test_user('forelder@test.rennkalender', 'Test Forelder',   'parent');
  v_swede  := pg_temp.seed_test_user('svensk@test.rennkalender',   'Svensk Åkare',    'athlete');

  -- Laget. Eies av treneren, og cascades bort sammen med ham.
  select id into v_team from public.teams where name = 'Testlaget' and owner_id = v_coach;
  if v_team is null then
    insert into public.teams (name, club, owner_id)
    values ('Testlaget', 'Testklubben', v_coach)
    returning id into v_team;
  end if;

  -- Profiler. Merkes som test slik at drop-test-users.sql finner dem igjen.
  update public.profiles set is_test = true, onboarded = true, role = 'coach',   team_id = v_team where id = v_coach;
  update public.profiles set is_test = true, onboarded = true, role = 'athlete', team_id = v_team,
    fis_code = '423032', birth_year = 2007, gender = 'M', home_city = 'hafjell' where id = v_lukas;
  update public.profiles set is_test = true, onboarded = true, role = 'athlete', team_id = v_team,
    fis_code = '423033', birth_year = 2007, gender = 'M', home_city = 'hafjell' where id = v_storm;
  update public.profiles set is_test = true, onboarded = true, role = 'parent'  where id = v_parent;
  update public.profiles set is_test = true, onboarded = true, role = 'athlete' where id = v_swede;

  -- Forelderen er koblet til Lukas.
  insert into public.guardians (parent_id, athlete_id)
  values (v_parent, v_lukas)
  on conflict do nothing;
end
$$;
