-- The guard runs SECURITY DEFINER, so current_user is the function owner, never
-- 'service_role'. Check the request role from the JWT instead.
CREATE OR REPLACE FUNCTION public.guard_watcher_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  request_role text := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), ''),
    session_user
  );
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND request_role <> 'service_role'
     AND NOT private.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin can change access status';
  END IF;
  RETURN NEW;
END;
$$;
