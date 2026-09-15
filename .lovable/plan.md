# Admin-managed beacons with shared secrets

Beacons are created and their secrets issued only from an admin page. The Android app is configured with an existing secret and posts with it. Any signed-in person who knows a secret can follow that beacon.

## How it will work

1. **Admin page** (visible only to admin accounts): create a beacon with a name, and the page generates its secret. The list shows every beacon, its secret (hidden by default, with show/copy), battery, last seen, and how many people follow it. Admins can rename a beacon, issue a new secret, or delete a beacon with its history.
2. **The Android app** is given an existing secret and posts positions with it. A secret that isn't in the list is rejected — no beacon is ever created by posting, so the database can't be flooded.
3. **Following** — any signed-in person pastes a secret on the tracker page and gives it their own label. The beacon joins their list.
4. **Tracker page** — a switcher over all followed beacons; the selected one shows on the map with battery, last seen and the live badge. "Stop following" removes it from that person's list only.
5. **Issuing a new secret** instantly stops the old one from working; the phone must be reconfigured. Existing followers keep their access.

## Fresh start

The current beacon and its stored positions are left behind. The first admin account is you; the tracker page starts with an empty list and an "Add a beacon" box.

## Security posture

- The secret is still the key to viewing and posting, so it should be shared like a password. It's hidden by default on both pages, sent only over HTTPS, and 64 random characters — guessing is not realistic.
- Only admins mint secrets, so the flooding risk from the previous idea is gone; the posting endpoint rejects unknown secrets and is rate-limited per address.
- A leaked secret is revoked by issuing a new one from the admin page.
- Positions are readable only by people who added that beacon (or an admin), enforced in the database rather than only in the page.
- Admin status is stored in its own roles table and checked server-side, never in the browser.

## Technical notes

- Migration (existing `devices`/`locations` stay in place, unused):
  - `app_role` enum (`admin`, `user`), `user_roles` table, `SECURITY DEFINER` `public.has_role(_user_id, _role)` — the standard separate-table pattern, created before any policy that calls it.
  - `beacons` — `id`, `name`, `secret_code` (unique, 32 random bytes hex, default generated), `battery_level`, `last_seen_at`, `created_by`, `created_at`.
  - `beacon_watchers` — `beacon_id`, `user_id`, `label`, `created_at`, unique pair; the label lives here so each follower names it their own way.
  - `beacon_positions` — `beacon_id`, `latitude`, `longitude`, `accuracy_m`, `battery_level`, `recorded_at`; index on `(beacon_id, recorded_at desc)`.
  - `SECURITY DEFINER` `public.is_watching(_beacon uuid, _user uuid)` to keep policies non-recursive.
  - RLS: beacons and positions SELECT for watchers or admins; all beacon writes admin-only; `beacon_watchers` rows managed by their own `user_id` (admins may read). `secret_code` is never selected by non-admin reads — server functions project columns explicitly. Grants to `authenticated` + `service_role`, no `anon`. `beacon_positions` gets `REPLICA IDENTITY FULL` and joins the realtime publication.
- `src/routes/api/public/beacon.ts`: same JSON contract; `pairing_key` resolves against `beacons.secret_code` via the admin client, 401 on unknown, insert into `beacon_positions`, update battery/last seen. Timestamp tolerance and out-of-order guard unchanged. Adds a simple per-beacon write throttle (ignore posts arriving under a couple of seconds apart).
- `src/lib/tracking.functions.ts`, all behind `requireSupabaseAuth`: `listBeacons`, `getBeacon`, `followBeacon({secretCode, label})` (admin-client lookup by secret, then watcher insert for `context.userId`, generic error when not found), `unfollowBeacon`, `relabelBeacon`. Demo-seeding in `getTracker` is removed.
- `src/lib/admin.functions.ts`, behind `requireSupabaseAuth` + an in-handler `has_role(userId,'admin')` check before loading `supabaseAdmin`: `adminListBeacons` (includes secrets), `adminCreateBeacon`, `adminRenameBeacon`, `adminRotateSecret`, `adminDeleteBeacon`.
- Routes: `src/routes/_authenticated/admin.tsx` (renders "not available" for non-admins as well as being server-guarded) and a reworked `src/routes/_authenticated/tracker.tsx` with the beacon switcher, add-by-secret form, and realtime channel keyed on the selected beacon.
- The first admin row is inserted directly against the database for your account after the migration.
