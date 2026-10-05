-- Guest quote hardening, rate limiting and claim workflow
create index if not exists quote_requests_email_created_idx
on public.quote_requests (lower(email), created_at desc);

create or replace function private.enforce_guest_quote_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.quantity < 1 or new.quantity > 1000000 then raise exception 'Invalid quantity'; end if;
  if char_length(new.full_name) > 120
     or char_length(new.email) > 254
     or char_length(coalesce(new.phone,'')) > 50
     or char_length(coalesce(new.size,'')) > 120
     or char_length(coalesce(new.paper,'')) > 120
     or char_length(coalesce(new.finish,'')) > 120
     or char_length(coalesce(new.notes,'')) > 5000 then
    raise exception 'Quote field is too long';
  end if;
  if new.email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Invalid email address';
  end if;
  if new.product not in ('flyer','brochure','card','apparel','mug','banner','website') then
    raise exception 'Invalid product';
  end if;
  if (select auth.role()) = 'anon' then
    if (
      select count(*)
      from public.quote_requests q
      where lower(q.email)=lower(new.email)
        and q.created_at > now()-interval '1 hour'
    ) >= 5 then
      raise exception 'Too many quote requests. Please try again later.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists quote_requests_guest_limit_trg on public.quote_requests;
create trigger quote_requests_guest_limit_trg
before insert on public.quote_requests
for each row execute function private.enforce_guest_quote_limits();

create or replace function private.claim_guest_quote_impl(p_quote_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(coalesce((select auth.jwt()->>'email'),''));
begin
  if v_uid is null or v_email='' then
    raise exception 'Authentication required';
  end if;
  update public.quote_requests
     set user_id=v_uid,
         updated_at=now()
   where id=p_quote_id
     and user_id is null
     and lower(email)=v_email;
  return found;
end;
$$;

revoke all on function private.claim_guest_quote_impl(bigint) from public;
grant usage on schema private to authenticated;
grant execute on function private.claim_guest_quote_impl(bigint) to authenticated;

create or replace function public.claim_guest_quote(p_quote_id bigint)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.claim_guest_quote_impl(p_quote_id);
$$;

revoke all on function public.claim_guest_quote(bigint) from public;
grant execute on function public.claim_guest_quote(bigint) to authenticated;

create or replace function private.submit_guest_quote_impl(
  p_full_name text,
  p_email text,
  p_phone text,
  p_product text,
  p_quantity integer,
  p_size text,
  p_paper text,
  p_print_sides text,
  p_finish text,
  p_design_service boolean,
  p_notes text,
  p_website text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if coalesce(trim(p_website),'')<>'' then
    raise exception 'Unable to submit quote';
  end if;
  insert into public.quote_requests(
    user_id,full_name,email,phone,product,quantity,size,paper,
    print_sides,finish,design_service,notes
  )
  values(
    null,trim(p_full_name),lower(trim(p_email)),nullif(trim(p_phone),''),
    p_product,p_quantity,nullif(trim(p_size),''),nullif(trim(p_paper),''),
    coalesce(nullif(trim(p_print_sides),''),'single'),
    coalesce(nullif(trim(p_finish),''),'standard'),
    coalesce(p_design_service,false),nullif(trim(p_notes),'')
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function private.submit_guest_quote_impl(text,text,text,text,integer,text,text,text,text,boolean,text,text) from public;
grant usage on schema private to anon;
grant execute on function private.submit_guest_quote_impl(text,text,text,text,integer,text,text,text,text,boolean,text,text) to anon;

create or replace function public.submit_guest_quote(
  p_full_name text,
  p_email text,
  p_phone text,
  p_product text,
  p_quantity integer,
  p_size text,
  p_paper text,
  p_print_sides text,
  p_finish text,
  p_design_service boolean,
  p_notes text,
  p_website text default null
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.submit_guest_quote_impl(
    p_full_name,p_email,p_phone,p_product,p_quantity,p_size,p_paper,
    p_print_sides,p_finish,p_design_service,p_notes,p_website
  );
$$;

revoke all on function public.submit_guest_quote(text,text,text,text,integer,text,text,text,text,boolean,text,text) from public;
grant execute on function public.submit_guest_quote(text,text,text,text,integer,text,text,text,text,boolean,text,text) to anon;
