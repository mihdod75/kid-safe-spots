-- Roles ------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Beacons ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beacons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Beacon',
  secret_code text NOT NULL UNIQUE,
  battery_level integer,
  last_seen_at timestamptz,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.beacons TO authenticated;
GRANT ALL ON public.beacons TO service_role;
ALTER TABLE public.beacons ENABLE ROW LEVEL SECURITY;

-- Enrollments ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beacon_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_code_hash text NOT NULL UNIQUE,
  pairing_word text NOT NULL,
  device_label text NOT NULL DEFAULT 'Android phone',
  status text NOT NULL DEFAULT 'pending',
  beacon_id uuid REFERENCES public.beacons(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  claimed_at timestamptz,
  CONSTRAINT beacon_enrollments_status_check
    CHECK (status IN ('pending','approved','rejected','claimed'))
);

GRANT SELECT ON public.beacon_enrollments TO authenticated;
GRANT ALL ON public.beacon_enrollments TO service_role;
ALTER TABLE public.beacon_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read enrollments" ON public.beacon_enrollments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Watchers ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beacon_watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beacon_id uuid NOT NULL REFERENCES public.beacons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'pending',
  note text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  CONSTRAINT beacon_watchers_status_check
    CHECK (status IN ('pending','approved','declined')),
  UNIQUE (beacon_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.beacon_watchers TO authenticated;
GRANT ALL ON public.beacon_watchers TO service_role;
ALTER TABLE public.beacon_watchers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_watching(_beacon uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.beacon_watchers
    WHERE beacon_id = _beacon AND user_id = _user AND status = 'approved'
  )
$$;

CREATE POLICY "Watchers read own rows" ON public.beacon_watchers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all watcher rows" ON public.beacon_watchers
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users request access" ON public.beacon_watchers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "Users update own label" ON public.beacon_watchers
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users drop own row" ON public.beacon_watchers
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Only admins may change the approval status.
CREATE OR REPLACE FUNCTION public.guard_watcher_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin can change access status';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER beacon_watchers_guard_status
  BEFORE UPDATE ON public.beacon_watchers
  FOR EACH ROW EXECUTE FUNCTION public.guard_watcher_status();

-- Beacon read policies (need is_watching) ------------------------------------
CREATE POLICY "Signed-in users list beacons" ON public.beacons
  FOR SELECT TO authenticated USING (true);

-- Positions -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beacon_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beacon_id uuid NOT NULL REFERENCES public.beacons(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy_m double precision,
  battery_level integer,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beacon_positions_beacon_recorded_idx
  ON public.beacon_positions (beacon_id, recorded_at DESC);

GRANT SELECT ON public.beacon_positions TO authenticated;
GRANT ALL ON public.beacon_positions TO service_role;
ALTER TABLE public.beacon_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved watchers read positions" ON public.beacon_positions
  FOR SELECT TO authenticated USING (public.is_watching(beacon_id, auth.uid()));
CREATE POLICY "Admins read positions" ON public.beacon_positions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.beacon_positions REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.beacon_positions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
