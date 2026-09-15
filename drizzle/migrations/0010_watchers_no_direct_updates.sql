-- A follower can no longer update their watcher row directly at all; the
-- server renames on their behalf, so self-approval is structurally impossible.
DROP POLICY IF EXISTS "Users update own label" ON public.beacon_watchers;
REVOKE UPDATE ON public.beacon_watchers FROM authenticated;
REVOKE UPDATE (label, note, status) ON public.beacon_watchers FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.beacon_watchers TO authenticated;
GRANT ALL ON public.beacon_watchers TO service_role;