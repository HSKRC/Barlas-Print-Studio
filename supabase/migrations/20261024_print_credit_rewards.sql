-- Barlas Print Studio customer print credit rewards.
-- Credit accrues from paid print invoice subtotal (GST and delivery excluded).

create table if not exists public.print_credit_accounts (
  user_id uuid primary key references auth.users(id) on delete restrict,
  qualifying_spend numeric(12,2) not null default 0
    check (qualifying_spend >= 0 and qualifying_spend < 12000),
  updated_at timestamptz not null default now()
);

create table if not exists public.print_credit_purchases (
  invoice_id uuid primary key references public.invoices(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  qualifying_amount numeric(12,2) not null check (qualifying_amount > 0),
  recorded_at timestamptz not null default now()
);

create table if not exists public.print_credit_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  reward_number smallint not null check (reward_number > 0),
  amount numeric(8,2) not null default 200 check (amount = 200),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 year'),
  redeemed_at timestamptz,
  redeemed_order_id uuid references public.orders(id) on delete restrict,
  unique (invoice_id, reward_number)
);

create index if not exists print_credit_rewards_user_expiry_idx
  on public.print_credit_rewards(user_id, expires_at);

alter table public.print_credit_accounts enable row level security;
alter table public.print_credit_purchases enable row level security;
alter table public.print_credit_rewards enable row level security;

drop policy if exists print_credit_accounts_owner_or_admin_read on public.print_credit_accounts;
create policy print_credit_accounts_owner_or_admin_read on public.print_credit_accounts
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_current_user_admin()));

drop policy if exists print_credit_purchases_admin_read on public.print_credit_purchases;
create policy print_credit_purchases_admin_read on public.print_credit_purchases
  for select to authenticated
  using ((select private.is_current_user_admin()));

drop policy if exists print_credit_rewards_owner_or_admin_read on public.print_credit_rewards;
create policy print_credit_rewards_owner_or_admin_read on public.print_credit_rewards
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_current_user_admin()));

drop policy if exists print_credit_rewards_admin_update on public.print_credit_rewards;
create policy print_credit_rewards_admin_update on public.print_credit_rewards
  for update to authenticated
  using ((select private.is_current_user_admin()))
  with check ((select private.is_current_user_admin()));

create or replace function private.accrue_print_credit_for_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_order public.orders%rowtype;
  v_product text;
  v_balance numeric(12,2);
  v_remaining numeric(12,2);
  v_reward_number smallint;
begin
  select i.* into v_invoice
    from public.invoices i
   where i.id = p_invoice_id;
  if not found or v_invoice.status <> 'paid' or v_invoice.subtotal <= 0 then
    return;
  end if;

  select o.* into v_order
    from public.orders o
   where o.id = v_invoice.order_id
   for update;
  if not found or v_order.status <> 'completed' then
    return;
  end if;

  select lower(replace(coalesce(q.product, oi.product, ''), '_', ' '))
    into v_product
    from public.order_items oi
    left join public.quote_requests q on q.id = v_order.quote_id
   where oi.order_id = v_order.id
   order by oi.id
   limit 1;
  if coalesce(v_product, '') in ('', 'design', 'website', 'web design', 'web development') then
    return;
  end if;

  -- Idempotency guard: status changes cannot count the same invoice twice.
  insert into public.print_credit_purchases(invoice_id, user_id, qualifying_amount)
  values (v_invoice.id, v_invoice.user_id, v_invoice.subtotal)
  on conflict (invoice_id) do nothing;
  if not found then
    return;
  end if;

  insert into public.print_credit_accounts(user_id, qualifying_spend)
  values (v_invoice.user_id, 0)
  on conflict (user_id) do nothing;

  select a.qualifying_spend into v_balance
    from public.print_credit_accounts a
   where a.user_id = v_invoice.user_id
   for update;

  v_remaining := v_balance + v_invoice.subtotal;
  v_reward_number := 0;
  while v_remaining >= 12000 loop
    v_reward_number := v_reward_number + 1;
    insert into public.print_credit_rewards(user_id, invoice_id, reward_number)
    values (v_invoice.user_id, v_invoice.id, v_reward_number);
    v_remaining := v_remaining - 12000;
  end loop;

  update public.print_credit_accounts
     set qualifying_spend = v_remaining,
         updated_at = now()
   where user_id = v_invoice.user_id;
end;
$$;

create or replace function private.accrue_print_credit_on_invoice_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.accrue_print_credit_for_invoice(new.id);
  return new;
end;
$$;

create or replace function private.accrue_print_credit_on_order_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
begin
  for v_invoice_id in
    select i.id from public.invoices i
     where i.order_id = new.id and i.status = 'paid'
  loop
    perform private.accrue_print_credit_for_invoice(v_invoice_id);
  end loop;
  return new;
end;
$$;

revoke all on function private.accrue_print_credit_for_invoice(uuid) from public, anon, authenticated;
revoke all on function private.accrue_print_credit_on_invoice_change() from public, anon, authenticated;
revoke all on function private.accrue_print_credit_on_order_complete() from public, anon, authenticated;

drop trigger if exists invoices_accrue_print_credit on public.invoices;
create trigger invoices_accrue_print_credit
  after update of status on public.invoices
  for each row
  when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function private.accrue_print_credit_on_invoice_change();

drop trigger if exists orders_accrue_print_credit on public.orders;
create trigger orders_accrue_print_credit
  after update of status on public.orders
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function private.accrue_print_credit_on_order_complete();

grant select on public.print_credit_accounts, public.print_credit_rewards to authenticated;
grant update (redeemed_at, redeemed_order_id) on public.print_credit_rewards to authenticated;
