# Phones ask to join, an admin approves, the secret is issued

The Android app requests enrolment. An admin approves it from an admin page, which generates the beacon's secret. The phone collects that secret once and stores it privately, then posts positions with it. Nobody can add a beacon by flooding the database — nothing exists until an admin says yes.

## How it will work

1. **The phone asks to join.** On first run it generates a random enrolment code and a short 6-character pairing word to show on screen, then sends a join request with a device label (phone model, chosen name).
2. **The admin page** lists pending requests with their pairing word and when they arrived. The admin can approve (a beacon is created and its secret generated) or reject. Requests expire on their own after 24 hours.
3. **The phone collects the secret.** It keeps asking with its enrolment code; once approved, the reply hands over the secret exactly once and the enrolment code stops working. The phone stores the secret privately and posts positions with it from then on.
4. **The admin page** also manages existing beacons: rename, see battery / last seen / follower count, issue a new secret (the phone must re-enrol), and delete a beacon with its history.
5. **Asking to follow a beacon.** A signed-in person opens the tracker page and sees the list of registered beacons by name only — no positions, no secrets. They request access to one, optionally with a short note. The admin page shows those requests and approves or declines them. Once approved, the beacon appears in their list with map, battery, last seen and the live badge; a switcher moves between approved beacons. The admin can revoke access later, and a person can stop following at any time.

## Fresh start

The current beacon and its stored positions are left behind. Your account becomes the first admin. The tracker page starts with an empty list.

## Security posture

- Nothing is created without an admin approval, so the flooding concern is gone. Join requests themselves are rate-limited per address and capped, and carry no location data.
- The pairing word shown on the phone lets the admin confirm they are approving the right device, not an impostor request that arrived at the same moment.
- The secret (64 random characters) is handed out once, over HTTPS, and after that only ever shown on the admin page behind a "show" toggle. It never reaches the tracker page at all — following no longer depends on knowing it.
- A leaked or lost secret is revoked by issuing a new one; the phone re-enrols.
- Viewing is granted person by person by an admin, and can be revoked. The beacon list everyone can see carries names only, never positions.
- Positions are readable only by approved followers of that beacon or an admin, enforced in the database. Admin status lives in its own roles table and is checked server-side.


## Technical notes

- Migration (existing `devices`/`locations` stay in place, unused):
  - `app_role` enum + `user_roles` table + `SECURITY DEFINER` `public.has_role(_user_id, _role)`, created before any policy that calls it.
  - `beacon_enrollments` — `id`, `enrollment_code_hash` (sha-256 of the phone's code), `pairing_word`, `device_label`, `status` (`pending`/`approved`/`rejected`/`claimed`), `beacon_id`, `requested_at`, `expires_at`, `claimed_at`.
  - `beacons` — `id`, `name`, `secret_code_hash`, `secret_code` (kept so admins can re-display it), `battery_level`, `last_seen_at`, `approved_by`, `created_at`.
  - `beacon_watchers` — `beacon_id`, `user_id`, `label`, `status` (`pending`/`approved`/`declined`), `requested_at`, `decided_at`, `decided_by`, `note`; unique pair.
  - `beacon_positions` — `beacon_id`, `latitude`, `longitude`, `accuracy_m`, `battery_level`, `recorded_at`; index on `(beacon_id, recorded_at desc)`, `REPLICA IDENTITY FULL`, added to the realtime publication.
  - `SECURITY DEFINER` `public.is_watching(_beacon, _user)` (approved rows only) keeps policies non-recursive. RLS: enrolments admin-only; positions SELECT for approved watchers or admins; beacons SELECT for any authenticated user but server functions project `id, name` only for non-admins, so the secret never leaves the server; beacon writes admin-only; a person may insert their own `pending` watcher row and delete their own row, but only an admin may set `status` (a trigger blocks self-approval). Grants to `authenticated` + `service_role`, no `anon`.
- Public routes under `src/routes/api/public/` (all using the admin client server-side, all input validated with Zod):
  - `POST beacon-enroll` — `{ enrollment_code, pairing_word, device_label }`, inserts a pending row, returns `{ status: "pending" }`.
  - `POST beacon-enroll-status` — `{ enrollment_code }`, returns `pending` / `rejected` / `{ status: "approved", secret_code }` once, then marks the enrolment claimed.
  - `beacon.ts` — unchanged JSON contract; resolves `pairing_key` against `beacons.secret_code`, 401 on unknown, inserts the position, updates battery/last seen, keeps the timestamp tolerance and out-of-order guard, plus a short per-beacon write throttle.
- `src/lib/admin.functions.ts`, behind `requireSupabaseAuth` with an in-handler `has_role(userId,'admin')` check before `supabaseAdmin` is loaded: `listEnrollments`, `approveEnrollment`, `rejectEnrollment`, `adminListBeacons`, `adminRenameBeacon`, `adminRotateSecret`, `adminDeleteBeacon`, `listAccessRequests`, `decideAccessRequest`, `revokeAccess`.
- `src/lib/tracking.functions.ts`, behind `requireSupabaseAuth`: `listAvailableBeacons` (names plus this person's request status), `listMyBeacons`, `getBeacon`, `requestAccess({beaconId, note})`, `stopFollowing`, `relabelBeacon`. Demo-seeding in `getTracker` is removed.
- Routes: `src/routes/_authenticated/admin.tsx` (pending enrolments, access requests, beacon management — server-guarded and hidden from non-admins) and a reworked `src/routes/_authenticated/tracker.tsx` with the approved-beacon switcher, a "Browse beacons" section for requesting access, pending-request state, and the realtime channel keyed on the selected beacon.
- The first admin row is inserted directly against the database for your account after the migration.

