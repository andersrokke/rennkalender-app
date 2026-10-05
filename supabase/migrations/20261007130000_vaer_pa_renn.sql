-- Været på renndagen, for renn løperne har kjørt.
--
-- Hentes fra Open-Meteo sitt historiske arkiv av edge-funksjonen race-weather.
-- Tallene er beregnet vær for stedets koordinater, ikke en måling i bakken:
-- gode nok til å si «kaldt og snø» eller «mildt og vind», ikke til å si føret.
--
-- Nøkkelen er sted, nasjon og dato slik de står i fis_results, så samme renndag
-- hentes én gang uansett hvor mange løpere som kjørte.
create table if not exists public.race_weather (
  place text not null,
  nation text not null default '',
  race_date date not null,
  lat double precision,
  lng double precision,
  elevation numeric,
  temp_morgen numeric,      -- kl. 09 lokal tid
  temp_middag numeric,      -- kl. 12
  temp_min numeric,         -- kl. 07-15
  temp_max numeric,
  nedbor_mm numeric,        -- sum kl. 07-15
  sno_cm numeric,           -- snøfall, sum kl. 07-15
  vind_ms numeric,          -- snitt kl. 08-14
  sky_pct integer,          -- snitt kl. 08-14
  vaerkode integer,         -- WMO-kode kl. 11
  funnet boolean not null default true,   -- false: stedet ble ikke funnet, ikke prøv hver natt
  fetched_at timestamptz not null default now(),
  primary key (place, nation, race_date)
);

alter table public.race_weather enable row level security;
revoke all on public.race_weather from anon, authenticated;
grant select on public.race_weather to authenticated;
drop policy if exists "race_weather read" on public.race_weather;
create policy "race_weather read" on public.race_weather for select to authenticated using (true);

-- Renndager som mangler vær. Arkivet ligger noen dager etter, så de ferskeste
-- venter. Steder som ikke ble funnet prøves på nytt etter en måned.
create or replace function public.vaer_mangler(p_antall integer default 200)
returns table (place text, nation text, race_date date)
language sql stable security definer set search_path to 'public'
as $function$
  select distinct f.place, coalesce(f.nation, ''), f.race_date
    from fis_results f
   where f.place is not null and f.race_date >= date '2023-07-01'
     and f.race_date < current_date - 6
     and not exists (select 1 from race_weather w
                      where w.place = f.place and w.nation = coalesce(f.nation, '') and w.race_date = f.race_date
                        and (w.funnet or w.fetched_at > now() - interval '30 days'))
   order by 3 desc
   limit greatest(1, least(p_antall, 500))
$function$;
revoke all on function public.vaer_mangler(integer) from public, anon, authenticated;
grant execute on function public.vaer_mangler(integer) to service_role;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning 'pg_cron er ikke tilgjengelig, hopper over planlegging av race-weather';
    return;
  end if;
  -- 05:40 UTC, etter at nattens resultater er hentet.
  execute $sql$select cron.schedule('race-weather-daily', '40 5 * * *',
    $job$select public.invoke_edge_function('race-weather', '{}'::jsonb, 120000)$job$)$sql$;
end
$$;

-- Føret på renndagen, ført av løper eller trener.
--
-- Vær kan hentes; føret kan ikke. Den som var der vet om det var is, saltet
-- eller løst. Én rad per renndag, delt av alle som kjørte: fører én løper
-- føret, ser lagkameratene og treneren det samme. Siste som skriver gjelder.
create table if not exists public.race_conditions (
  place text not null,
  nation text not null default '',
  race_date date not null,
  fore text not null check (fore in ('ice', 'salted', 'hard', 'grippy', 'soft', 'slush', 'powder', 'artificial')),
  note text check (note is null or char_length(note) <= 200),
  set_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (place, nation, race_date)
);

-- Bare den som kjørte rennet, eller treneren til en som gjorde det, kan føre.
-- Foreldre leser, men fører ikke.
create or replace function public.kan_fore_renn(p_place text, p_nation text, p_date date)
returns boolean
language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from fis_results f
      join profiles p on p.fis_code = f.fis_code
     where f.place = p_place and coalesce(f.nation, '') = p_nation and f.race_date = p_date
       and ((p.id = auth.uid() and p.role = 'athlete') or (p.team_id is not null and is_coach_of(p.team_id))))
$function$;
revoke all on function public.kan_fore_renn(text, text, date) from public, anon;
grant execute on function public.kan_fore_renn(text, text, date) to authenticated, service_role;

alter table public.race_conditions enable row level security;
revoke all on public.race_conditions from anon, authenticated;
grant select, insert, update, delete on public.race_conditions to authenticated;
drop policy if exists "race_conditions read" on public.race_conditions;
create policy "race_conditions read" on public.race_conditions for select to authenticated using (true);
drop policy if exists "race_conditions write" on public.race_conditions;
create policy "race_conditions write" on public.race_conditions for all to authenticated
  using (kan_fore_renn(place, nation, race_date))
  with check (kan_fore_renn(place, nation, race_date) and set_by = auth.uid());
