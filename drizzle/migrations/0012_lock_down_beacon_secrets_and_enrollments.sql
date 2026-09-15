-- 1. Ensure the beacon secret is never selectable by ordinary signed-in users
REVOKE ALL ON public.beacons FROM authenticated;
REVOKE ALL ON public.beacons FROM anon;
GRANT SELECT (id, name, battery_level, last_seen_at, created_at) ON public.beacons TO authenticated;
GRANT ALL ON public.beacons TO service_role;

DROP POLICY IF EXISTS "Authenticated read beacon names" ON public.beacons;
CREATE POLICY "Authenticated browse beacon names"
ON public.beacons
FOR SELECT
TO authenticated
USING (true);

-- Explicit admin-only write policies (writes stay privileged; no grants to authenticated)
DROP POLICY IF EXISTS "Admins insert beacons" ON public.beacons;
CREATE POLICY "Admins insert beacons"
ON public.beacons
FOR INSERT
TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins update beacons" ON public.beacons;
CREATE POLICY "Admins update beacons"
ON public.beacons
FOR UPDATE
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins delete beacons" ON public.beacons;
CREATE POLICY "Admins delete beacons"
ON public.beacons
FOR DELETE
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role));

-- 2. Enrollment codes: never expose the code hash, keep row access admin-only
REVOKE ALL ON public.beacon_enrollments FROM authenticated;
REVOKE ALL ON public.beacon_enrollments FROM anon;
GRANT SELECT (id, pairing_word, device_label, status, beacon_id, requested_at, expires_at, claimed_at)
  ON public.beacon_enrollments TO authenticated;
GRANT ALL ON public.beacon_enrollments TO service_role;

DROP POLICY IF EXISTS "Admins manage enrollments" ON public.beacon_enrollments;
CREATE POLICY "Admins manage enrollments"
ON public.beacon_enrollments
FOR UPDATE
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins delete enrollments" ON public.beacon_enrollments;
CREATE POLICY "Admins delete enrollments"
ON public.beacon_enrollments
FOR DELETE
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role));
