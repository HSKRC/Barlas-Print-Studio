-- Allow the email notification function to look up only active production staff emails.
CREATE OR REPLACE FUNCTION private.get_production_staff_emails_impl()
 RETURNS TABLE(email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_current_user_admin() then
    raise exception 'Administrator access required';
  end if;
  return query
  select u.email::text
    from private.production_staff s
    join auth.users u on u.id=s.user_id
   where s.active and u.email is not null
   order by lower(u.email);
end;
$function$

revoke all on function private.get_production_staff_emails_impl() from public,anon,authenticated;
grant execute on function private.get_production_staff_emails_impl() to authenticated,service_role;
CREATE OR REPLACE FUNCTION public.get_production_staff_emails()
 RETURNS TABLE(email text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from private.get_production_staff_emails_impl();
$function$

revoke all on function public.get_production_staff_emails() from public,anon;
grant execute on function public.get_production_staff_emails() to authenticated,service_role;