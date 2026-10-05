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
  v_quote public.quote_requests%rowtype;
  v_order public.orders%rowtype;
begin
  if not private.is_current_user_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into v_quote
  from public.quote_requests
  where id = p_quote_id
  for update;

  if not found then raise exception 'Quote not found'; end if;
  if v_quote.user_id is null then raise exception 'Customer account required'; end if;

  select * into v_order
  from public.orders
  where quote_id = p_quote_id;

  if found then
    return query select v_order.id, v_order.order_number;
    return;
  end if;

  insert into public.orders(
    user_id, quote_id, status, subtotal, gst, total, delivery_method, due_at
  )
  values(
    v_quote.user_id, v_quote.id, 'approved',
    greatest(coalesce(p_subtotal,0),0),
    greatest(coalesce(p_gst,0),0),
    greatest(coalesce(p_subtotal,0),0)+greatest(coalesce(p_gst,0),0),
    nullif(trim(p_delivery_method),''),
    p_due_at
  )
  returning * into v_order;

  insert into public.order_items(
    order_id, product, description, quantity, unit_price, line_total
  )
  values(
    v_order.id,
    v_quote.product,
    concat_ws(' · ',nullif(v_quote.size,''),nullif(v_quote.paper,''),nullif(v_quote.print_sides,''),nullif(v_quote.finish,'')),
    v_quote.quantity,
    case when v_quote.quantity > 0 then greatest(coalesce(p_subtotal,0),0)/v_quote.quantity else 0 end,
    greatest(coalesce(p_subtotal,0),0)
  );

  update public.quote_requests
  set status='converted', updated_at=now()
  where id=p_quote_id;

  return query select v_order.id, v_order.order_number;
end;
$$;

revoke all on function public.convert_quote_to_order(bigint,numeric,numeric,text,timestamptz) from public;
grant execute on function public.convert_quote_to_order(bigint,numeric,numeric,text,timestamptz) to authenticated;
