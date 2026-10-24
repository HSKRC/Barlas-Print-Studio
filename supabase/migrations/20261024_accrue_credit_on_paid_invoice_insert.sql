-- Catch fully prepaid final invoices created after an order was completed.
-- The helper ignores deposit receipts and is idempotent per invoice.
drop trigger if exists invoices_accrue_print_credit on public.invoices;
create trigger invoices_accrue_print_credit
after insert or update of status on public.invoices
for each row execute function private.accrue_print_credit_on_invoice_change();