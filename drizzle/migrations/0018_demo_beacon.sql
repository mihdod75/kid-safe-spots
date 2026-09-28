-- lovable-cron-fallback-reviewed: user explicitly requires a demo beacon emitting every 10-30s continuously
ALTER TABLE public.beacons ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION private.tick_demo_beacons()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
  last_pos record;
  new_lat double precision;
  new_lon double precision;
  batt integer;
BEGIN
  FOR b IN SELECT id, last_seen_at, battery_level FROM public.beacons WHERE is_demo LOOP
    IF b.last_seen_at IS NOT NULL
       AND now() - b.last_seen_at < make_interval(secs => 10 + floor(random() * 21)) THEN
      CONTINUE;
    END IF;

    SELECT latitude, longitude INTO last_pos
    FROM public.beacon_positions WHERE beacon_id = b.id
    ORDER BY recorded_at DESC LIMIT 1;

    IF last_pos IS NULL OR b.last_seen_at IS NULL OR now() - b.last_seen_at > interval '10 minutes' THEN
      new_lat := 47.140 + random() * 0.045;
      new_lon := 27.550 + random() * 0.080;
    ELSE
      new_lat := least(greatest(last_pos.latitude + (random() - 0.5) * 0.0014, 47.130), 47.195);
      new_lon := least(greatest(last_pos.longitude + (random() - 0.5) * 0.0020, 27.540), 27.640);
    END IF;

    batt := coalesce(b.battery_level, 100) - (CASE WHEN random() < 0.05 THEN 1 ELSE 0 END);
    IF batt < 15 THEN batt := 100; END IF;

    INSERT INTO public.beacon_positions (beacon_id, latitude, longitude, accuracy_m, battery_level, recorded_at)
    VALUES (b.id, new_lat, new_lon, 5 + random() * 20, batt, now());

    UPDATE public.beacons SET last_seen_at = now(), battery_level = batt WHERE id = b.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.tick_demo_beacons() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('tick-demo-beacons', '10 seconds', 'SELECT private.tick_demo_beacons()');