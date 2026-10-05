-- Quote response fields shown in Admin and Customer Account
alter table public.quote_requests
  add column if not exists quoted_subtotal numeric,
  add column if not exists quoted_gst numeric,
  add column if not exists quoted_total numeric,
  add column if not exists quoted_delivery text,
  add column if not exists quote_message text,
  add column if not exists quote_valid_until date,
  add column if not exists quoted_at timestamptz;

alter table public.quote_requests
  add constraint quote_requests_quoted_amounts_nonnegative
  check (
    (quoted_subtotal is null or quoted_subtotal >= 0)
    and (quoted_gst is null or quoted_gst >= 0)
    and (quoted_total is null or quoted_total >= 0)
  ) not valid;

alter table public.quote_requests
  validate constraint quote_requests_quoted_amounts_nonnegative;
