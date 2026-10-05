-- Admin quote-to-order workflow
create unique index if not exists orders_quote_unique_idx
on public.orders(quote_id)
where quote_id is not null;

create or replace function public.convert_quote_to_order(
  p_quote_id bigint,
  p_subtotal numeric,
  p_gst numeric default 0,
  p_delivery_method text default null,
  p_due_at timestamptz default null
)
returns table(order_id uuid, order_number text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  q public.quote_requests%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_existing public.orders%rowtype;
  v_subtotal numeric := greatest(coalesce(p_subtotal,0),0);
  v_gst numeric := greatest(coalesce(p_gst,0),0);
begin
  if not private.is_current_user_admin() then
    raise exception 'Not authorized';
  end if;

  select *
    into q
    from public.quote_requests
   where id = p_quote_id
   for update;

  if not found then
    raise exception 'Quote not found';
  end if;

  if q.user_id is null then
    raise exception 'Customer account required before converting this quote to an order';
  end if;

  select *
    into v_existing
    from public.orders
   where quote_id = p_quote_id
   limit 1;

  if found then
    return query select v_existing.id, v_existing.order_number;
    return;
  end if;

  insert into public.orders(
    order_number,
    user_id,
    quote_id,
    status,
    subtotal,
    gst,
    total,
    delivery_method,
    due_at
  )
  values(
    '',
    q.user_id,
    q.id,
    'approved',
    v_subtotal,
    v_gst,
    v_subtotal + v_gst,
    nullif(btrim(coalesce(p_delivery_method,'')),''),
    p_due_at
  )
  returning id, public.orders.order_number
  into v_order_id, v_order_number;

  insert into public.order_items(
    order_id,
    product,
    description,
    quantity,
    unit_price,
    line_total
  )
  values(
    v_order_id,
    q.product,
    concat_ws(' · ',
      nullif(q.size,''),
      nullif(q.paper,''),
      nullif(q.print_sides,''),
      nullif(q.finish,'')
    ),
    q.quantity,
    case when q.quantity > 0 then round(v_subtotal / q.quantity, 2) else 0 end,
    v_subtotal
  );

  update public.quote_requests
     set status = 'converted',
         updated_at = now()
   where id = q.id;

  return query select v_order_id, v_order_number;
end;
$$;

revoke all on function public.convert_quote_to_order(bigint,numeric,numeric,text,timestamptz) from public;
grant execute on function public.convert_quote_to_order(bigint,numeric,numeric,text,timestamptz) to authenticated;
