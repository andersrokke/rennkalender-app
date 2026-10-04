-- Vakt for de planlagte jobbene. Edge-funksjonene kan kalles av alle som har
-- den offentlige nøkkelen, og den ligger i nettsiden. Uten en sperre kunne
-- hvem som helst sette i gang hentingene om og om igjen - mot FIS, iSonen og
-- basen. Hver jobb får derfor en minste avstand mellom kjøringene.

create table if not exists public.jobbkjoring (
  navn text primary key,
  sist timestamptz not null default now()
);
alter table public.jobbkjoring enable row level security;
revoke all on public.jobbkjoring from anon, authenticated;

-- Tar jobben hvis det har gått lenge nok siden sist. Atomisk: to samtidige
-- kall får ikke begge ja.
create or replace function public.ta_jobb(p_navn text, p_sekunder integer)
 returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare n int;
begin
  insert into jobbkjoring (navn, sist) values (p_navn, now())
  on conflict (navn) do update set sist = now()
    where jobbkjoring.sist < now() - make_interval(secs => p_sekunder);
  get diagnostics n = row_count;
  -- Gamle nøkler per bruker ryddes, så tabellen ikke vokser.
  delete from jobbkjoring where sist < now() - interval '7 days';
  return n > 0;
end
$function$;
revoke all on function public.ta_jobb(text, integer) from public, anon, authenticated;
grant execute on function public.ta_jobb(text, integer) to service_role;
