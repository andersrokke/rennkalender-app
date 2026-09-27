-- training_sessions var en logg: hva som ble gjort, i fortid, uten klokkeslett.
-- En trener trenger også å si hva som skal skje - «i morgen kjører vi SG
-- 07-09 og GS 10-12 i Kjusløypa» - og løperen trenger å se det.
--
-- Samme tabell, tre nye kolonner. En økt er planlagt til den er ført, og da
-- står den allerede der med riktig dag, bakke og gren.

alter table public.training_sessions
  add column if not exists start_time time without time zone,
  add column if not exists end_time time without time zone,
  add column if not exists planned boolean not null default false;

-- Delvis indeks: planlagte økter er få og spørres om ofte («hva skjer i
-- morgen»), mens loggen er mange og spørres om per periode.
create index if not exists training_planned_idx
  on public.training_sessions using btree (athlete_id, date) where planned;

-- Treneren planlegger for flere løpere og flere bolker på én gang.
-- p_blocks: [{"discipline":"SG","start":"07:00","end":"09:00"}, ...]
create or replace function public.plan_training(
  p_athletes uuid[],
  p_date date,
  p_slope_id bigint default null,
  p_blocks jsonb default '[]'::jsonb,
  p_venue text default null,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare t uuid; n int := 0; a uuid; b jsonb;
begin
  select team_id into t from profiles where id = auth.uid();
  if t is null or not is_coach_of(t) then
    raise exception 'Bare trener kan planlegge trening';
  end if;
  if jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) = 0 then
    raise exception 'Planen må ha minst én bolk';
  end if;

  foreach a in array p_athletes loop
    if exists (select 1 from profiles p
               where p.id = a and p.team_id = t and p.role = 'athlete') then
      -- Planlegger treneren samme dag på nytt, erstattes planen. Økter som
      -- alt er ført (planned = false) røres ikke.
      delete from training_sessions
       where athlete_id = a and date = p_date and planned;

      for b in select * from jsonb_array_elements(p_blocks) loop
        insert into training_sessions
          (athlete_id, team_id, date, discipline, slope_id, venue,
           start_time, end_time, note, planned, created_by)
        values
          (a, t, p_date, upper(b->>'discipline'), p_slope_id, p_venue,
           nullif(b->>'start','')::time, nullif(b->>'end','')::time,
           p_note, true, auth.uid());
        n := n + 1;
      end loop;
    end if;
  end loop;
  return n;
end
$function$;

revoke all on function public.plan_training(uuid[], date, bigint, jsonb, text, text) from public, anon;
grant execute on function public.plan_training(uuid[], date, bigint, jsonb, text, text) to authenticated, service_role;
