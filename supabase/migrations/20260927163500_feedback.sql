-- Tilbakemeldinger fra brukerne: forslag til nye funksjoner og feilmeldinger.
--
-- Valget sto mellom å sende rett på e-post og å lagre i basen. Basen vant, og
-- e-posten kom i tillegg: en e-post er varsling, ikke lagring. Den kan bli
-- liggende ulest, den kan ikke søkes i, og den kan ikke vise brukeren at
-- forslaget er mottatt og hva som skjedde med det. Raden i basen kan alt dette,
-- og varselet er bare et puff om at raden finnes.
--
-- Derfor: innsendingen lykkes selv om e-posten feiler. Se notify_feedback().

-- ---------------------------------------------------------------------------
-- Administrator
--
-- user_role-enumen (coach/athlete/parent) beskriver hva folk gjør i idretten,
-- ikke hvem som drifter appen. En fjerde verdi der ville tvunget seg inn i
-- hver eneste RLS-regel som i dag sier role = 'athlete'. Et eget flagg holder
-- de to spørsmålene fra hverandre.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$function$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  -- Hvilken del av appen det gjelder, og hvilken nettleser det ble sendt fra.
  -- Begge deler er triage-hjelp: en feil som bare finnes på én skjerm eller i
  -- én nettleser er en helt annen jobb enn en som finnes overalt.
  area text,
  user_agent text,
  status text not null default 'new',
  admin_note text,
  constraint feedback_kind_check check (kind = any (array['idea', 'bug'])),
  constraint feedback_status_check
    check (status = any (array['new', 'planned', 'doing', 'done', 'declined'])),
  constraint feedback_title_len check (char_length(btrim(title)) between 3 and 140),
  constraint feedback_body_len check (body is null or char_length(body) <= 4000),
  constraint feedback_agent_len check (user_agent is null or char_length(user_agent) <= 400)
);

create index if not exists feedback_author_idx
  on public.feedback using btree (author_id, created_at desc);
-- Triage-lista leses sortert på status; ubehandlede først.
create index if not exists feedback_status_idx
  on public.feedback using btree (status, created_at desc);

create or replace function public.feedback_touch()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  return new;
end
$function$;

drop trigger if exists feedback_touch_trg on public.feedback;
create trigger feedback_touch_trg before update on public.feedback
  for each row execute function public.feedback_touch();

-- ---------------------------------------------------------------------------
-- Rettigheter
-- ---------------------------------------------------------------------------
alter table public.feedback enable row level security;

revoke all on table public.feedback from anon;
grant select, insert, update, delete on table public.feedback to authenticated;
grant all on table public.feedback to service_role;

-- Alle innloggede kan sende inn, men bare i eget navn og alltid som ubehandlet.
-- Uten with check kunne en bruker sendt inn noe merket 'done' med et
-- administratornotat på, og dermed skrevet i triage-kolonnene.
drop policy if exists "feedback insert own" on public.feedback;
create policy "feedback insert own" on public.feedback as permissive for insert to authenticated
  with check (author_id = auth.uid() and status = 'new' and admin_note is null);

-- Man ser sine egne, så man kan følge hva som skjedde med forslaget.
drop policy if exists "feedback read own" on public.feedback;
create policy "feedback read own" on public.feedback as permissive for select to authenticated
  using (author_id = auth.uid());

drop policy if exists "feedback read all admin" on public.feedback;
create policy "feedback read all admin" on public.feedback as permissive for select to authenticated
  using (is_admin());

-- Bare administrator kan endre status og skrive notat. Innsenderen kan ikke
-- rette sin egen rad: teksten er et dokument på hva som faktisk ble meldt.
drop policy if exists "feedback triage admin" on public.feedback;
create policy "feedback triage admin" on public.feedback as permissive for update to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "feedback delete admin" on public.feedback;
create policy "feedback delete admin" on public.feedback as permissive for delete to authenticated
  using (is_admin());

-- ---------------------------------------------------------------------------
-- Varsling
--
-- pg_net poster asynkront, så innsendingen venter ikke på e-posten. Feiler
-- kallet likevel - mangler vault-hemmelighetene, er edge-funksjonen nede -
-- fanges det her. Raden er det som betyr noe, varselet er det som haster.
-- ---------------------------------------------------------------------------
create or replace function public.notify_feedback()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.invoke_edge_function(
    'feedback-notify', jsonb_build_object('id', new.id), 20000);
  return new;
exception when others then
  raise warning 'notify_feedback(%): fikk ikke sendt varsel: %', new.id, sqlerrm;
  return new;
end
$function$;

revoke all on function public.notify_feedback() from public, anon, authenticated, service_role;

drop trigger if exists feedback_notify_trg on public.feedback;
create trigger feedback_notify_trg after insert on public.feedback
  for each row execute function public.notify_feedback();

-- ---------------------------------------------------------------------------
-- Første administrator
--
-- Adressen står her fordi den allerede er forfatter på hver commit i repoet,
-- og fordi varslene ellers ikke har noe sted å gå. Flere administratorer
-- settes med: update profiles set is_admin = true where id = '...';
-- ---------------------------------------------------------------------------
update public.profiles p set is_admin = true
  from auth.users u
 where u.id = p.id and lower(u.email) = 'anders.rokke@gmail.com';
