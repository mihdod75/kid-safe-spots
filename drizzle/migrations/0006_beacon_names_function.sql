-- Ordinary users no longer read the beacons table directly.
DROP POLICY IF EXISTS "Signed-in users list beacon names" ON public.beacons;

CREATE POLICY "Admins read beacons" ON public.beacons
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Safe projection: names and status only, never the secret.
CREATE OR REPLACE FUNCTION public.list_beacon_names()
RETURNS TABLE (
  id uuid,
  name text,
  battery_level integer,
  last_seen_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.name, b.battery_level, b.last_seen_at
  FROM public.beacons b
  ORDER BY b.name
$$;

REVOKE ALL ON FUNCTION public.list_beacon_names() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_beacon_names() TO authenticated;
