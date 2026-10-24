-- Order, deposit/final invoice, and employee production queue schema.
alter table public.orders add column if not exists delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0);
alter table public.invoices drop constraint if exists invoices_order_id_key;
alter table public.invoices add column if not exists invoice_kind text not null default 'final' check (invoice_kind in ('deposit','final'));
alter table public.invoices add column if not exists delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0);
alter table public.invoices add column if not exists deposit_credit numeric(12,2) not null default 0 check (deposit_credit >= 0);
alter table public.invoices add column if not exists amount_due numeric(12,2) not null default 0 check (amount_due >= 0);
update public.invoices set amount_due=greatest(total,0) where amount_due=0 and total>0;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='invoices_amount_due_lte_total') then
    alter table public.invoices add constraint invoices_amount_due_lte_total check(amount_due<=total);
  end if;
  if not exists(select 1 from pg_constraint where conname='invoices_deposit_credit_lte_total') then
    alter table public.invoices add constraint invoices_deposit_credit_lte_total check(deposit_credit<=total);
  end if;
end $$;
create unique index if not exists invoices_order_kind_unique_idx on public.invoices(order_id,invoice_kind);

create table if not exists private.production_staff(
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table private.production_staff enable row level security;
revoke all on private.production_staff from public,anon,authenticated;
grant usage on schema private to authenticated;

drop policy if exists customer_files_select_for_production_staff on storage.objects;
create policy customer_files_select_for_production_staff on storage.objects
for select to authenticated
using(bucket_id='customer-files' and (select private.can_view_production_artwork(name)));

drop function if exists public.create_invoice_from_order(uuid,date,text);
drop function if exists public.create_invoice_from_order(uuid,text,date,text);
drop function if exists private.create_invoice_from_order_impl(uuid,date,text);
CREATE OR REPLACE FUNCTION private.is_current_user_production_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(
    select 1 from private.production_staff s
     where s.user_id = (select auth.uid()) and s.active
  );
$function$


CREATE OR REPLACE FUNCTION private.set_production_staff_access_impl(p_email text, p_enabled boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not private.is_current_user_admin() then
    raise exception 'Administrator access required';
  end if;
  if v_email = '' or position('@' in v_email) < 2 then
    raise exception 'Enter a valid employee account email';
  end if;

  select u.id into v_user_id
    from auth.users u
   where lower(u.email) = v_email
   limit 1;
  if v_user_id is null then
    raise exception 'Employee account not found. Ask the employee to create an account first.';
  end if;

  if coalesce(p_enabled, false) then
    insert into private.production_staff(user_id, active)
    values (v_user_id, true)
    on conflict (user_id) do update set active = true;
  else
    delete from private.production_staff where user_id = v_user_id;
  end if;
  return true;
end;
$function$


CREATE OR REPLACE FUNCTION private.get_production_queue_impl()
 RETURNS TABLE(order_id uuid, order_number text, status text, due_at timestamp with time zone, delivery_method text, customer_name text, product text, quantity integer, size text, material text, print_sides text, finish text, design_service boolean, notes text, artworks jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_current_user_admin()
     and not private.is_current_user_production_staff() then
    raise exception 'Production staff access required';
  end if;

  return query
  select
    o.id, o.order_number, o.status, o.due_at, o.delivery_method,
    coalesce(q.full_name, 'Customer'),
    coalesce(q.product, 'Printing job'),
    coalesce(q.quantity, 1),
    q.size, q.paper, q.print_sides, q.finish, q.design_service, q.notes,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'storage_path', f.storage_path,
        'original_name', f.original_name
      ) order by f.id)
      from public.quote_files f
      where f.quote_id = q.id
    ), '[]'::jsonb)
  from public.orders o
  left join public.quote_requests q on q.id = o.quote_id
  where o.status not in ('completed','cancelled')
  order by o.due_at nulls last, o.created_at;
end;
$function$


CREATE OR REPLACE FUNCTION private.can_view_production_artwork(p_storage_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_current_user_production_staff()
    and exists(
      select 1
      from public.quote_files f
      join public.orders o on o.quote_id = f.quote_id
      where f.storage_path = p_storage_path
        and o.status not in ('completed','cancelled')
    );
$function$


CREATE OR REPLACE FUNCTION public.convert_quote_to_order(p_quote_id bigint, p_subtotal numeric, p_gst numeric DEFAULT 0, p_delivery_method text DEFAULT NULL::text, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(order_id uuid, order_number text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  q public.quote_requests%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_existing public.orders%rowtype;
  v_subtotal numeric := greatest(coalesce(p_subtotal,0),0);
  v_gst numeric := greatest(coalesce(p_gst,0),0);
  v_delivery_fee numeric := 0;
  v_total numeric := 0;
begin
  if not private.is_current_user_admin() then
    raise exception 'Not authorized';
  end if;
  if p_due_at is null then
    raise exception 'Set the expected completion date before creating the order';
  end if;

  select * into q
    from public.quote_requests
   where id = p_quote_id
   for update;
  if not found then raise exception 'Quote not found'; end if;
  if q.user_id is null then
    raise exception 'Customer account required before converting this quote to an order';
  end if;
  if q.status <> 'accepted' or q.deposit_status <> 'paid' then
    raise exception 'Customer acceptance and confirmed deposit are required before creating an order';
  end if;

  select * into v_existing from public.orders where quote_id = p_quote_id limit 1;
  if found then return query select v_existing.id, v_existing.order_number; return; end if;

  v_delivery_fee := greatest(coalesce(q.quoted_delivery_fee,0),0);
  v_total := v_subtotal + v_gst + v_delivery_fee;
  if q.quoted_total is not null and abs(v_total - q.quoted_total) > 0.01 then
    raise exception 'Order price must match the accepted quotation';
  end if;
  if coalesce(q.deposit_amount,0) > v_total + 0.01 then
    raise exception 'Confirmed deposit exceeds order total; check the quotation';
  end if;

  insert into public.orders(
    order_number,user_id,quote_id,status,subtotal,gst,delivery_fee,total,delivery_method,due_at
  )
  values(
    '',q.user_id,q.id,'approved',v_subtotal,v_gst,v_delivery_fee,v_total,
    nullif(btrim(coalesce(p_delivery_method,'')),''),
    p_due_at
  )
  returning id, public.orders.order_number into v_order_id, v_order_number;

  insert into public.order_items(order_id,product,description,quantity,unit_price,line_total)
  values(
    v_order_id,q.product,
    concat_ws(' · ',nullif(q.size,''),nullif(q.paper,''),nullif(q.print_sides,''),nullif(q.finish,'')),
    q.quantity,
    case when q.quantity > 0 then round(v_subtotal/q.quantity,2) else 0 end,
    v_subtotal
  );
  if v_delivery_fee > 0 then
    insert into public.order_items(order_id,product,description,quantity,unit_price,line_total)
    values(v_order_id,'Delivery','Delivery fee',1,v_delivery_fee,v_delivery_fee);
  end if;

  update public.quote_requests set status='converted',updated_at=now() where id=q.id;
  return query select v_order_id,v_order_number;
end;
$function$


CREATE OR REPLACE FUNCTION private.create_invoice_from_order_impl(p_order_id uuid, p_invoice_kind text, p_due_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(invoice_id uuid, invoice_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.orders%rowtype;
  v_quote public.quote_requests%rowtype;
  v_invoice public.invoices%rowtype;
  v_name text;
  v_email text;
  v_ratio numeric;
  v_subtotal numeric;
  v_gst numeric;
  v_delivery_fee numeric;
  v_total numeric;
  v_deposit_credit numeric := 0;
  v_amount_due numeric;
  v_status text;
  v_notes text;
begin
  if not private.is_current_user_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_invoice_kind not in ('deposit','final') then
    raise exception 'Invoice type must be deposit or final';
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  select * into v_quote from public.quote_requests where id=v_order.quote_id;
  if not found then raise exception 'Quotation not found'; end if;

  select * into v_invoice from public.invoices
   where order_id=p_order_id and invoice_kind=p_invoice_kind
   limit 1;
  if found then return query select v_invoice.id,v_invoice.invoice_number; return; end if;

  select
    coalesce(nullif(q.full_name,''),nullif(p.full_name,''),nullif(u.raw_user_meta_data->>'full_name',''),u.email,'Customer'),
    coalesce(nullif(q.email,''),u.email)
  into v_name,v_email
  from auth.users u
  left join public.profiles p on p.id=u.id
  left join public.quote_requests q on q.id=v_order.quote_id
  where u.id=v_order.user_id;
  if v_email is null then raise exception 'Customer email not available'; end if;

  if p_invoice_kind='deposit' then
    if v_quote.deposit_status <> 'paid' then
      raise exception 'Confirm the deposit payment before creating the deposit receipt';
    end if;
    v_total := least(greatest(coalesce(v_quote.deposit_amount,0),0),v_order.total);
    if v_total <= 0 or v_order.total <= 0 then raise exception 'Deposit amount is unavailable'; end if;
    v_ratio := v_total / v_order.total;
    v_gst := round(v_order.gst*v_ratio,2);
    v_delivery_fee := round(v_order.delivery_fee*v_ratio,2);
    v_subtotal := v_total-v_gst-v_delivery_fee;
    v_deposit_credit := 0;
    v_amount_due := v_total;
    v_status := 'paid';
    v_notes := coalesce(nullif(trim(p_notes),''),'Deposit received for order '||v_order.order_number);
  else
    v_total := greatest(coalesce(v_order.total,0),0);
    v_deposit_credit := case when v_quote.deposit_status='paid'
      then least(greatest(coalesce(v_quote.deposit_amount,0),0),v_total) else 0 end;
    v_amount_due := greatest(v_total-v_deposit_credit,0);
    v_subtotal := greatest(coalesce(v_order.subtotal,0),0);
    v_gst := greatest(coalesce(v_order.gst,0),0);
    v_delivery_fee := greatest(coalesce(v_order.delivery_fee,0),0);
    v_status := case when v_amount_due=0 then 'paid' else 'draft' end;
    v_notes := coalesce(nullif(trim(p_notes),''),'Final invoice for order '||v_order.order_number);
  end if;

  insert into public.invoices(
    invoice_number,order_id,order_number,user_id,customer_name,customer_email,
    status,issue_date,due_date,subtotal,gst,delivery_fee,total,
    invoice_kind,deposit_credit,amount_due,notes,paid_at
  )
  values(
    '',v_order.id,v_order.order_number,v_order.user_id,v_name,v_email,
    v_status,current_date,p_due_date,v_subtotal,v_gst,v_delivery_fee,v_total,
    p_invoice_kind,v_deposit_credit,v_amount_due,v_notes,
    case when v_status='paid' then now() else null end
  )
  returning * into v_invoice;

  if p_invoice_kind='deposit' then
    v_ratio := v_total/v_order.total;
    insert into public.invoice_items(invoice_id,product,description,quantity,unit_price,line_total)
    select v_invoice.id,oi.product,
      concat_ws(' · ',nullif(oi.description,''),'Deposit'),
      oi.quantity,round(oi.unit_price*v_ratio,2),round(oi.line_total*v_ratio,2)
    from public.order_items oi where oi.order_id=v_order.id;
  else
    insert into public.invoice_items(invoice_id,product,description,quantity,unit_price,line_total)
    select v_invoice.id,oi.product,oi.description,oi.quantity,oi.unit_price,oi.line_total
    from public.order_items oi where oi.order_id=v_order.id;
  end if;

  return query select v_invoice.id,v_invoice.invoice_number;
end;
$function$


CREATE OR REPLACE FUNCTION private.accrue_print_credit_for_invoice(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_invoice public.invoices%rowtype;
  v_order public.orders%rowtype;
  v_product text;
  v_balance numeric(12,2);
  v_remaining numeric(12,2);
  v_reward_number smallint;
begin
  select i.* into v_invoice from public.invoices i where i.id=p_invoice_id;
  if not found or v_invoice.status <> 'paid'
     or v_invoice.invoice_kind <> 'final'
     or v_invoice.subtotal <= 0 then
    return;
  end if;
  select o.* into v_order from public.orders o where o.id=v_invoice.order_id for update;
  if not found or v_order.status <> 'completed' then return; end if;
  select lower(replace(coalesce(q.product,oi.product,''),'_',' '))
    into v_product
    from public.order_items oi
    left join public.quote_requests q on q.id=v_order.quote_id
   where oi.order_id=v_order.id order by oi.id limit 1;
  if coalesce(v_product,'') in ('','design','website','web design','web development') then return; end if;
  insert into public.print_credit_purchases(invoice_id,user_id,qualifying_amount)
  values(v_invoice.id,v_invoice.user_id,v_invoice.subtotal)
  on conflict (invoice_id) do nothing;
  if not found then return; end if;
  insert into public.print_credit_accounts(user_id,qualifying_spend)
  values(v_invoice.user_id,0)
  on conflict (user_id) do nothing;
  select a.qualifying_spend into v_balance
    from public.print_credit_accounts a where a.user_id=v_invoice.user_id for update;
  v_remaining:=v_balance+v_invoice.subtotal;
  v_reward_number:=0;
  while v_remaining>=12000 loop
    v_reward_number:=v_reward_number+1;
    insert into public.print_credit_rewards(user_id,invoice_id,reward_number)
    values(v_invoice.user_id,v_invoice.id,v_reward_number);
    v_remaining:=v_remaining-12000;
  end loop;
  update public.print_credit_accounts set qualifying_spend=v_remaining,updated_at=now()
   where user_id=v_invoice.user_id;
end;
$function$


CREATE OR REPLACE FUNCTION private.accrue_print_credit_on_order_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_invoice_id uuid;
begin
  for v_invoice_id in
    select i.id from public.invoices i
     where i.order_id=new.id and i.status='paid' and i.invoice_kind='final'
  loop
    perform private.accrue_print_credit_for_invoice(v_invoice_id);
  end loop;
  return new;
end;
$function$


revoke all on function private.is_current_user_production_staff() from public,anon;
grant execute on function private.is_current_user_production_staff() to authenticated,service_role;
create or replace function public.is_current_user_production_staff()
returns boolean language sql stable security invoker set search_path=''
as $$ select private.is_current_user_production_staff(); $$;
revoke all on function public.is_current_user_production_staff() from public,anon;
grant execute on function public.is_current_user_production_staff() to authenticated,service_role;

revoke all on function private.set_production_staff_access_impl(text,boolean) from public,anon,authenticated;
grant execute on function private.set_production_staff_access_impl(text,boolean) to authenticated,service_role;
create or replace function public.set_production_staff_access(p_email text,p_enabled boolean)
returns boolean language sql security invoker set search_path=''
as $$ select private.set_production_staff_access_impl(p_email,p_enabled); $$;
revoke all on function public.set_production_staff_access(text,boolean) from public,anon;
grant execute on function public.set_production_staff_access(text,boolean) to authenticated,service_role;

revoke all on function private.get_production_queue_impl() from public,anon,authenticated;
grant execute on function private.get_production_queue_impl() to authenticated,service_role;
create or replace function public.get_production_queue()
returns table(order_id uuid,order_number text,status text,due_at timestamptz,delivery_method text,customer_name text,product text,quantity integer,size text,material text,print_sides text,finish text,design_service boolean,notes text,artworks jsonb)
language sql stable security invoker set search_path=''
as $$ select * from private.get_production_queue_impl(); $$;
revoke all on function public.get_production_queue() from public,anon;
grant execute on function public.get_production_queue() to authenticated,service_role;

revoke all on function private.can_view_production_artwork(text) from public,anon;
grant execute on function private.can_view_production_artwork(text) to authenticated,service_role;

revoke all on function public.convert_quote_to_order(bigint,numeric,numeric,text,timestamptz) from public;
grant execute on function public.convert_quote_to_order(bigint,numeric,numeric,text,timestamptz) to authenticated;

revoke all on function private.create_invoice_from_order_impl(uuid,text,date,text) from public,anon,authenticated;
grant execute on function private.create_invoice_from_order_impl(uuid,text,date,text) to authenticated,service_role;
revoke all on function public.create_invoice_from_order(uuid,text,date,text) from public,anon;
grant execute on function public.create_invoice_from_order(uuid,text,date,text) to authenticated,service_role;

revoke all on function private.accrue_print_credit_for_invoice(uuid) from public,anon,authenticated;
revoke all on function private.accrue_print_credit_on_order_complete() from public,anon,authenticated;