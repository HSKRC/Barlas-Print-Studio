-- Automatically link all unclaimed guest quotes to a verified account with the same email.
create or replace function private.claim_guest_quotes_impl()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(trim(coalesce((select auth.jwt()->>'email'), '')));
  v_confirmed boolean := false;
  v_count integer := 0;
begin
  if v_uid is null or v_email = '' then
    raise exception 'Sign in required';
  end if;

  select (u.email_confirmed_at is not null)
    into v_confirmed
    from auth.users as u
   where u.id = v_uid
     and lower(u.email) = v_email;

  if not coalesce(v_confirmed, false) then
    raise exception 'Confirm the email address on your account before linking guest quotes';
  end if;

  update public.quote_requests
     set user_id = v_uid,
         updated_at = now()
   where user_id is null
     and lower(trim(email)) = v_email;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.claim_guest_quotes_impl() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.claim_guest_quotes_impl() to authenticated, service_role;

create or replace function public.claim_guest_quotes()
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.claim_guest_quotes_impl();
$$;

revoke all on function public.claim_guest_quotes() from public, anon;
grant execute on function public.claim_guest_quotes() to authenticated, service_role;