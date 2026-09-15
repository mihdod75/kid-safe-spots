# Remove the flagged beacon directory view

## What the scan flagged

The beacon-name list I added earlier is served by a database view that runs with the creator's permissions. The scanner treats that pattern as a risk, because such a view sidesteps the per-user access rules.

## Fix

Drop the view entirely and let the signed-in beacon list be built on the server instead:

- The page's "browse beacons" list is produced by the server, which checks the caller is signed in and then returns only each beacon's name, battery and last-seen time.
- Secret pairing codes stay unreachable — they are never selected and never leave the server.
- Direct table access for ordinary accounts stays limited to admins and approved followers, exactly as it is now.
- Nothing changes for the Android app or for the admin page.

Then re-run the security scan and mark the finding resolved.

## Technical detail

1. Migration: `DROP VIEW IF EXISTS public.beacon_directory;` (keep the current `beacons` policies: admin read, approved-watcher read via `private.is_watching`).
2. `src/lib/tracking.functions.ts` → `listBeacons` (already behind `requireSupabaseAuth`): replace the `beacon_directory` read with a handler-scoped `await import("@/integrations/supabase/client.server")` and
   `supabaseAdmin.from("beacons").select("id, name, battery_level, last_seen_at").order("name")`.
   The caller is verified by the middleware first; the projection excludes `secret_code`.
3. Watcher rows keep being read with the user-scoped client, so follow status stays per-user.
