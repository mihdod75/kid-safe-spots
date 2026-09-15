-- Stop watchers from touching their own status: they may only edit label/note.
DROP POLICY IF EXISTS "Users update own label" ON public.beacon_watchers;

REVOKE UPDATE ON public.beacon_watchers FROM authenticated;
GRANT UPDATE (label, note) ON public.beacon_watchers TO authenticated;

CREATE POLICY "Users update own label"
ON public.beacon_watchers
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND status = (
    SELECT w.status FROM public.beacon_watchers w WHERE w.id = beacon_watchers.id
  )
);
