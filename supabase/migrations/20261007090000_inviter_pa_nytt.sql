-- Administrator kan sende en trenerinvitasjon på nytt.
--
-- Lenken i invitasjonen virker én gang og har kort levetid, så en trener som
-- venter noen dager står igjen uten vei inn. admin_invite_coach() kan sende
-- på nytt, men skriver over notatet og laget invitasjonen pekte på. Denne
-- beholder dem, og virker også for en bruker som ble invitert av en
-- hovedtrener eller som mangler invitasjonsrad.
--
-- Vakter: bare administrator, bare adresser som aldri har logget inn, og
-- ikke oftere enn hvert minutt per adresse.
create or replace function public.admin_resend_invite(p_email text)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_email text := lower(btrim(p_email)); v_id bigint; v_sist timestamptz;
begin
  if not is_admin() then raise exception 'Bare administrator'; end if;
  if position('@' in v_email) < 2 then
    raise exception 'Ikke en e-postadresse: %', p_email;
  end if;
  if exists (select 1 from auth.users
              where lower(email) = v_email and last_sign_in_at is not null) then
    raise exception 'Personen har allerede logget inn';
  end if;

  select sent_at into v_sist from coach_invites where email = v_email;
  if v_sist > now() - interval '1 minute' then
    raise exception 'Invitasjonen ble nettopp sendt. Vent et minutt.';
  end if;

  insert into coach_invites (email, invited_by)
  values (v_email, auth.uid())
  on conflict (email)
    do update set created_at = now(), sent_at = null, send_error = null
  returning id into v_id;

  perform invoke_edge_function('invite-coach', jsonb_build_object('id', v_id), 20000);
  return v_id;
end
$function$;

revoke all on function public.admin_resend_invite(text) from public, anon;
grant execute on function public.admin_resend_invite(text) to authenticated, service_role;
