-- Keep the customer RPC callable through the public API without exposing a
-- SECURITY DEFINER entrypoint in the exposed public schema.
create or replace function private.respond_to_quote_impl(
  p_quote_id bigint,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quote_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select * into q
    from public.quote_requests
   where id = p_quote_id and user_id = auth.uid()
   for update;
  if not found then
    raise exception 'Quote not found';
  end if;
  if q.status <> 'quoted' or q.quoted_total is null then
    raise exception 'Quote is not open';
  end if;
  if q.quote_valid_until is not null and q.quote_valid_until < current_date then
    raise exception 'Quote expired';
  end if;

  update public.quote_requests
     set status = case when p_accept then 'accepted' else 'declined' end,
         customer_responded_at = now(),
         deposit_percent = case when p_accept then case when q.quoted_total < 300 then 100 else 50 end else null end,
         deposit_amount = case when p_accept then round(q.quoted_total * (case when q.quoted_total < 300 then 1 else 0.5 end), 2) else null end,
         deposit_status = case when p_accept then 'awaiting_payment' else 'not_requested' end
   where id = q.id;

  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;

revoke all on function private.respond_to_quote_impl(bigint, boolean) from public, anon, authenticated;
grant execute on function private.respond_to_quote_impl(bigint, boolean) to authenticated, service_role;

create or replace function public.respond_to_quote(
  p_quote_id bigint,
  p_accept boolean
)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.respond_to_quote_impl(p_quote_id, p_accept);
$$;

revoke all on function public.respond_to_quote(bigint, boolean) from public, anon;
grant execute on function public.respond_to_quote(bigint, boolean) to authenticated, service_role;
