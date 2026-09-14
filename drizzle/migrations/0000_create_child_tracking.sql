-- Parent profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Parents insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Parents update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Tracked child devices
CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_name text NOT NULL DEFAULT 'My child',
  pairing_key text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  battery_level int,
  last_seen_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX devices_owner_idx ON public.devices(owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents read own devices" ON public.devices
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Parents insert own devices" ON public.devices
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Parents update own devices" ON public.devices
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Parents delete own devices" ON public.devices
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- Reported positions
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy_m double precision,
  battery_level int,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX locations_device_time_idx ON public.locations(device_id, recorded_at DESC);

GRANT SELECT ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents read own device locations" ON public.locations
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.devices d
      WHERE d.id = locations.device_id AND d.owner_id = auth.uid()
    )
  );