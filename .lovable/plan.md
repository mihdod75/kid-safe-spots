# Fix the two security issues, then publish

## What's wrong today

1. **People could approve their own access request.** The rule that lets someone rename a beacon they follow also lets them flip their own request to "approved". A safety guard already blocks most of this, but the rule itself is too broad.
2. **Beacon secrets are readable by any signed-in account.** The list of beacons is open to every signed-in user and includes the secret code that phones use to send positions. The app pages don't show it, but the data itself is reachable.

## The fix

- Narrow the follower rule so a person can only change their own label/note — never their own status. Status changes stay admin-only.
- Stop exposing the beacons table directly. Signed-in users get a safe view with only id, name, battery and last-seen; the secret stays available to admins only, through the existing admin page.
- Re-check the scan afterwards and clear the two findings.

## Then publish

Publish the app so the live address serves the new beacon flow, which makes the phone's join request work instead of returning "NotFound".

## Technical notes

- New migration `drizzle/migrations/0005_tighten_beacon_rls.sql`:
  - Replace `Users update own label` on `beacon_watchers` with a policy whose `WITH CHECK` also requires `status = (select status from ... old row)` — enforced via the existing `guard_watcher_status` trigger plus restricting the policy to owner rows only.
  - Drop `Signed-in users list beacons` on `public.beacons`; add `public.beacons_public` (security_invoker view or security-definer function) exposing `id, name, battery_level, last_seen_at`, granted to `authenticated`. Keep admin SELECT on `public.beacons` via `has_role(auth.uid(),'admin')`.
  - Re-grant appropriately; admin server functions use the admin client and are unaffected.
- Update `src/lib/tracking.functions.ts` (`listBeacons`, `getBeacon`) to read from the safe source.
- Run the security scan, mark the two findings fixed, verify the build, then publish.
