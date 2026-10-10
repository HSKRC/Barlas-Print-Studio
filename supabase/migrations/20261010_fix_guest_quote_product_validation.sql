-- Keep guest quote validation aligned with the products offered in quote.html.
create or replace function private.enforce_guest_quote_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.quantity < 1 or new.quantity > 1000000 then
    raise exception 'Invalid quantity';
  end if;

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

  if new.product not in (
    'flyer','brochure','card','apparel','mug','poster','stickers','banner',
    'vinyl','window_graphics','one_way_vision','frosted_film','signage',
    'stationery','design','website'
  ) then
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
