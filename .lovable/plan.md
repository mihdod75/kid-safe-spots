# Beacons unlocked by their own secret code

Change the model from "one child per account" to "beacons that anyone signed in can follow if they know the beacon's secret code".

## How it will work

1. **A beacon is created** from the app. It gets a name (the child's name) and its own long secret code. The person who creates it starts following it automatically.
2. **The phone app** sends positions using that same secret code — nothing else changes in the sending format.
3. **Anyone else** (a second parent, a grandparent) signs in, pastes the secret code, and that beacon is added to their list. No code, no access.
4. **The watch list** — the tracker page shows all beacons a person follows, with a switcher; picking one shows its map, battery and last-seen. Someone can also stop following a beacon, which just removes it from their list.
5. **Rotating the code** still works: a new code is issued, the phone app must be updated, and existing followers keep their access (they were already added).

The same code both sends positions and grants viewing, as chosen.

## Fresh start

The current beacon and its stored positions are left behind; the page starts with an empty list and a "Create a beacon" / "Add with a code" choice. No demo child is auto-created any more — a new beacon simply waits for its first signal.

## Technical notes

- New tables (the existing `devices`/`locations` stay in place, unused, since columns can't be dropped safely):
  - `beacons` — `id`, `name`, `secret_code` (unique, 48 random bytes hex, default generated), `battery_level`, `last_seen_at`, `created_by`, `created_at`.
  - `beacon_watchers` — `beacon_id`, `user_id`, `created_at`, unique pair.
  - `beacon_positions` — `beacon_id`, `latitude`, `longitude`, `accuracy_m`, `battery_level`, `recorded_at`.
- RLS: a `SECURITY DEFINER` helper `public.is_watching(_beacon uuid, _user uuid)` avoids recursive policy checks. Watchers may SELECT their beacons and positions; only a watcher may update the beacon name or rotate its code; `beacon_watchers` rows are readable/insertable/deletable by the row's own `user_id`. Grants to `authenticated` + `service_role` in the same migration; no `anon` access. `beacon_positions` added to the realtime publication with `REPLICA IDENTITY FULL` so the live badge keeps working.
- Server functions in `src/lib/tracking.functions.ts` (all behind `requireSupabaseAuth`): `listBeacons`, `getBeacon({beaconId})`, `createBeacon({name})` (insert + self-watch via admin client), `followBeacon({secretCode})` (admin-client lookup by code, then insert watcher row for `context.userId`), `unfollowBeacon`, `renameBeacon`, `rotateSecret`. Old `getTracker` demo-seeding logic is removed.
- `src/routes/api/public/beacon.ts` keeps the same JSON contract but resolves `pairing_key` against `beacons.secret_code` and writes to `beacon_positions`; timestamp tolerance, out-of-order guard and 401 behaviour unchanged.
- `src/routes/_authenticated/tracker.tsx`: beacon switcher plus empty state with the two actions; realtime channel keyed on the selected beacon id; secret shown hidden-by-default with Show/Copy/Rotate, as today.
