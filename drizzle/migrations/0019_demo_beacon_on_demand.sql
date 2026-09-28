SELECT cron.unschedule('tick-demo-beacons');

CREATE OR REPLACE FUNCTION public.tick_demo_beacons()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT private.tick_demo_beacons(); $$;

REVOKE ALL ON FUNCTION public.tick_demo_beacons() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_demo_beacons() TO service_role;