-- Helpers move to a schema the API does not expose.
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION private.is_watching(_beacon uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.beacon_watchers
    WHERE beacon_id = _beacon AND user_id = _user AND status = 'approved'
  )
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_watching(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_watching(uuid, uuid) TO authenticated, service_role;

-- Watcher rows: a person may only edit their own pending row's label/note; the
-- self-referential status comparison that allowed self-approval is gone.
DROP POLICY IF EXISTS "Users update own label" ON public.beacon_watchers;
CREATE POLICY "Users update own label"
ON public.beacon_watchers FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE OR REPLACE FUNCTION public.guard_watcher_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND current_user <> 'service_role'
     AND NOT private.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin can change access status';
  END IF;
  RETURN NEW;
END;
$$;

-- Policies now call the private helpers.
DROP POLICY IF EXISTS "Admins read all watcher rows" ON public.beacon_watchers;
CREATE POLICY "Admins read all watcher rows"
ON public.beacon_watchers FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update watcher rows" ON public.beacon_watchers;
CREATE POLICY "Admins update watcher rows"
ON public.beacon_watchers FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins read enrollments" ON public.beacon_enrollments;
CREATE POLICY "Admins read enrollments"
ON public.beacon_enrollments FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins read positions" ON public.beacon_positions;
CREATE POLICY "Admins read positions"
ON public.beacon_positions FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Approved watchers read positions" ON public.beacon_positions;
CREATE POLICY "Approved watchers read positions"
ON public.beacon_positions FOR SELECT TO authenticated
USING (private.is_watching(beacon_id, auth.uid()));

DROP POLICY IF EXISTS "Admins read beacons" ON public.beacons;
CREATE POLICY "Admins read beacons"
ON public.beacons FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins read all roles" ON public.user_roles;
CREATE POLICY "Admins read all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

-- Signed-in users may list beacon names; column privileges keep secret_code out.
DROP POLICY IF EXISTS "Authenticated read beacon names" ON public.beacons;
CREATE POLICY "Authenticated read beacon names"
ON public.beacons FOR SELECT TO authenticated
USING (true);

-- The public API schema no longer exposes the definer helpers.
DROP FUNCTION IF EXISTS public.list_beacon_names();
DROP FUNCTION IF EXISTS public.is_watching(uuid, uuid);
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- Tighten privileges no policy ever intended to allow.
REVOKE ALL ON public.beacons FROM anon;
REVOKE ALL ON public.beacon_positions FROM anon;
REVOKE ALL ON public.beacon_watchers FROM anon;
REVOKE ALL ON public.beacon_enrollments FROM anon;
REVOKE ALL ON public.user_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.beacons FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.beacon_positions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.beacon_enrollments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.beacon_positions TO authenticated;
GRANT ALL ON public.beacons TO service_role;
GRANT ALL ON public.beacon_positions TO service_role;
GRANT ALL ON public.beacon_watchers TO service_role;
GRANT ALL ON public.beacon_enrollments TO service_role;
GRANT ALL ON public.user_roles TO service_role;