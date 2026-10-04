-- «Slett kontoen min»: brukeren sletter seg selv, uten å gå veien om
-- administrator. Alt som henger på profilen forsvinner gjennom
-- fremmednøklene (plan, treningslogg, koblinger til foresatte, favoritter,
-- feedback). Det som ikke har fremmednøkkel, ryddes her.
--
-- Et skigymnas eller et lag med grupper blir stående uten eier, så løperne
-- der ikke mister laget sitt. Et vanlig eget lag uten grupper slettes med
-- eieren, slik administrators sletting gjør.

create or replace function public.slett_min_konto()
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare meg uuid := auth.uid(); v_epost text;
begin
  if meg is null then raise exception 'Ikke innlogget'; end if;
  -- Tjenesten må ha en administrator. Den siste kan ikke slette seg selv.
  if exists (select 1 from profiles where id = meg and is_admin)
     and not exists (select 1 from profiles where id <> meg and is_admin) then
    raise exception 'Du er eneste administrator. Gi rollen til en annen før du sletter kontoen.';
  end if;

  select lower(email) into v_epost from auth.users where id = meg;

  -- Tidtakingsradene bærer navnet slik det sto i fila, så de slettes helt i
  -- stedet for bare å miste koblingen.
  delete from timing_runs where athlete_id = meg;
  delete from kodeforsok where user_id = meg;
  delete from coach_invites where lower(email) = v_epost;
  delete from jobbkjoring where navn = 'fis-athlete:' || meg::text;

  delete from teams t
   where t.owner_id = meg and not t.is_school and t.parent_team_id is null
     and not exists (select 1 from teams g where g.parent_team_id = t.id);

  delete from auth.users where id = meg;
end
$function$;
revoke all on function public.slett_min_konto() from public, anon;
grant execute on function public.slett_min_konto() to authenticated, service_role;
