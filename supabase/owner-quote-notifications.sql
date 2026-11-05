
create extension if not exists pg_net;
create extension if not exists pg_cron;
create table private.quote_email_outbox (
 quote_id bigint primary key references public.quote_requests(id) on delete cascade,
 token uuid not null default gen_random_uuid(), sent_at timestamptz, email_id text,
 attempts integer not null default 0, last_attempt_at timestamptz, created_at timestamptz not null default now()
);
alter table private.quote_email_outbox enable row level security;
grant usage on schema private to service_role;
grant select,update on private.quote_email_outbox to service_role;
create function public.get_quote_email_notification(p_quote_id bigint,p_token uuid) returns jsonb
language sql security invoker set search_path='' as $$
select jsonb_build_object('sent',o.sent_at is not null,'quote',jsonb_build_object('id',q.id,'full_name',q.full_name,'email',q.email,'phone',q.phone,'product',q.product,'quantity',q.quantity,'size',q.size,'paper',q.paper,'print_sides',q.print_sides,'finish',q.finish,'design_service',q.design_service,'notes',q.notes))
from private.quote_email_outbox o join public.quote_requests q on q.id=o.quote_id where o.quote_id=p_quote_id and o.token=p_token
$$;
revoke all on function public.get_quote_email_notification(bigint,uuid) from public,anon,authenticated;
grant execute on function public.get_quote_email_notification(bigint,uuid) to service_role;
create function public.complete_quote_email_notification(p_quote_id bigint,p_token uuid,p_email_id text) returns void
language sql security invoker set search_path='' as $$
update private.quote_email_outbox set sent_at=now(),email_id=p_email_id where quote_id=p_quote_id and token=p_token and sent_at is null
$$;
revoke all on function public.complete_quote_email_notification(bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_quote_email_notification(bigint,uuid,text) to service_role;
create function private.dispatch_quote_email_notifications() returns void language plpgsql security definer set search_path='' as $$
declare item record;
begin
for item in select * from private.quote_email_outbox where sent_at is null and attempts<12 and (last_attempt_at is null or last_attempt_at<now()-interval '5 minutes') order by created_at limit 30 for update skip locked loop
perform net.http_post(url:='https://yyxobksldeifjlxjovak.supabase.co/functions/v1/notify-new-quote',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('quote_id',item.quote_id,'token',item.token),timeout_milliseconds:=10000);
update private.quote_email_outbox set attempts=attempts+1,last_attempt_at=now() where quote_id=item.quote_id;
end loop;
end $$;
revoke all on function private.dispatch_quote_email_notifications() from public,anon,authenticated;
create function private.enqueue_quote_email_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
insert into private.quote_email_outbox(quote_id) values(new.id);
perform private.dispatch_quote_email_notifications();
return new;
end $$;
revoke all on function private.enqueue_quote_email_notification() from public,anon,authenticated;
create trigger quote_requests_notify_owner after insert on public.quote_requests for each row execute function private.enqueue_quote_email_notification();
select cron.schedule('bps-quote-email-retry','*/5 * * * *','select private.dispatch_quote_email_notifications()');
