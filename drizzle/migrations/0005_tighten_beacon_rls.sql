-- Watchers may only edit their own label/note, never their own status.
REVOKE UPDATE ON public.beacon_watchers FROM authenticated;
GRANT UPDATE (label, note) ON public.beacon_watchers TO authenticated;

DROP POLICY IF EXISTS "Users update own label" ON public.beacon_watchers;
CREATE POLICY "Users update own label" ON public.beacon_watchers
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status IN ('pending','approved','declined'));

CREATE POLICY "Admins update watcher rows" ON public.beacon_watchers
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Beacons: never expose the secret to ordinary signed-in users.
REVOKE SELECT ON public.beacons FROM authenticated;
GRANT SELECT (id, name, battery_level, last_seen_at, created_at) ON public.beacons TO authenticated;

DROP POLICY IF EXISTS "Signed-in users list beacons" ON public.beacons;
CREATE POLICY "Signed-in users list beacon names" ON public.beacons
  FOR SELECT TO authenticated USING (true);
