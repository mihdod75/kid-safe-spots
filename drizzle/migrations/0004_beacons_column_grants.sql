REVOKE SELECT ON public.beacons FROM authenticated;
GRANT SELECT (id, name, battery_level, last_seen_at, created_at) ON public.beacons TO authenticated;
