-- Paid deposit receipts and paid invoices must show zero balance due.
do $ begin
  if not exists(select 1 from pg_constraint where conname='invoices_amount_due_lte_total') then
    alter table public.invoices add constraint invoices_amount_due_lte_total check(amount_due<=total);
  end if;
  if not exists(select 1 from pg_constraint where conname='invoices_deposit_credit_lte_total') then
    alter table public.invoices add constraint invoices_deposit_credit_lte_total check(deposit_credit<=total);
  end if;
end $;
CREATE OR REPLACE FUNCTION private.normalize_paid_invoice_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status = 'paid' then new.amount_due := 0; end if;
  return new;
end;
$function$

revoke all on function private.normalize_paid_invoice_balance() from public,anon,authenticated;
drop trigger if exists invoices_normalize_paid_balance on public.invoices;
create trigger invoices_normalize_paid_balance
before insert or update of status,amount_due on public.invoices
for each row execute function private.normalize_paid_invoice_balance();
update public.invoices set amount_due=0 where status='paid' and amount_due<>0;