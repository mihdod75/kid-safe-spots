create extension if not exists pg_cron with schema extensions;

create or replace function private.purge_old_beacon_positions()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.beacon_positions where recorded_at < now() - interval '1 day';
$$;

revoke all on function private.purge_old_beacon_positions() from public, anon, authenticated;

delete from public.beacon_positions where recorded_at < now() - interval '1 day';

select cron.unschedule(jobid) from cron.job where jobname = 'purge-old-beacon-positions';

select cron.schedule(
  'purge-old-beacon-positions',
  '17 * * * *',
  $$select private.purge_old_beacon_positions();$$
);