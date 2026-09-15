REVOKE ALL ON FUNCTION public.guard_watcher_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_watching(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_beacon_names() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_watching(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_beacon_names() TO authenticated;