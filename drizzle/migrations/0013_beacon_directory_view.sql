CREATE OR REPLACE VIEW public.beacon_directory
WITH (security_invoker = off) AS
SELECT id, name, battery_level, last_seen_at
FROM public.beacons;

ALTER VIEW public.beacon_directory OWNER TO postgres;

REVOKE ALL ON public.beacon_directory FROM PUBLIC;
GRANT SELECT ON public.beacon_directory TO authenticated;
GRANT SELECT ON public.beacon_directory TO service_role;

DROP POLICY IF EXISTS "Authenticated browse beacon names" ON public.beacons;

CREATE POLICY "Approved watchers read their beacon"
ON public.beacons
FOR SELECT
TO authenticated
USING (private.is_watching(id, auth.uid()));
