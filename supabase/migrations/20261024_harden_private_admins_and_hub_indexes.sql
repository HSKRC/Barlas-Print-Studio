-- Defense in depth for the private administrator roster.
-- The SECURITY DEFINER admin check runs as the table owner; API users get only
-- a self-row policy, and no table privileges are granted here.
alter table private.admins enable row level security;
drop policy if exists admins_select_own_membership on private.admins;
create policy admins_select_own_membership on private.admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Device pairing secrets and device token hashes stay inaccessible to browser
-- clients. Hub Edge Functions use the service-role client for these operations.
drop policy if exists hub_device_pairs_deny_client_access on public.hub_device_pairs;
create policy hub_device_pairs_deny_client_access on public.hub_device_pairs
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists hub_devices_deny_client_access on public.hub_devices;
create policy hub_devices_deny_client_access on public.hub_devices
  for all to anon, authenticated
  using (false)
  with check (false);

-- Cover foreign keys used by the admin and Hub workflows.
create index if not exists hub_activity_logs_agent_id_idx
  on public.hub_activity_logs(agent_id);
create index if not exists hub_activity_logs_job_id_idx
  on public.hub_activity_logs(job_id);
create index if not exists hub_approvals_job_id_idx
  on public.hub_approvals(job_id);
create index if not exists hub_device_pairs_owner_id_idx
  on public.hub_device_pairs(owner_id);
create index if not exists hub_jobs_agent_id_idx
  on public.hub_jobs(agent_id);
create index if not exists hub_jobs_claimed_device_id_idx
  on public.hub_jobs(claimed_device_id);
create index if not exists hub_workflows_owner_id_idx
  on public.hub_workflows(owner_id);
create index if not exists print_credit_purchases_user_id_idx
  on public.print_credit_purchases(user_id);
create index if not exists print_credit_rewards_redeemed_order_id_idx
  on public.print_credit_rewards(redeemed_order_id);
