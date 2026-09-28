-- Det Supabase gir gratis, og som en naken Postgres ikke har.
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists vault;
create schema if not exists cron;
create schema if not exists net;

do $$ begin
  create role anon nologin noinherit;         exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin noinherit bypassrls; exception when duplicate_object then null; end $$;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;

create extension if not exists pgcrypto with schema extensions;

-- raw_user_meta_data er med fordi handle_new_user() leser den: innsetting i
-- auth.users er det som oppretter profilen, også i produksjon.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

-- admin_users() leser hvilken innloggingsmetode brukeren har.
create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null
);

-- Den ekte leser request.jwt.claims. Her holder det med subjektet.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- pg_cron, pg_net og Vault finnes ikke utenfor Supabase. Stubbene gjør at
-- migrasjonene kjører gjennom; de skal ikke gjøre noe.
create table if not exists vault.decrypted_secrets (name text primary key, decrypted_secret text);
create or replace function cron.schedule(jobname text, schedule text, command text)
  returns bigint language sql as $$ select 1::bigint $$;
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 5000)
  returns bigint language sql as $$ select 1::bigint $$;
