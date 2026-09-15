# Beacons identified by a secret the phone generates

Change the model from "one child per account" to "the Android app creates a secret, and this page shows every beacon whose secret you know".

## How it will work

1. **The phone generates a secret** with its "Generate secret" button and starts posting positions with it. The first position creates the beacon automatically — nothing needs to be set up here first.
2. **On this page** a signed-in person pastes a secret and gives it a label (e.g. "Ana"). That beacon is added to their list.
3. **The list** shows every beacon they've added: name, battery, last seen, and a switcher; picking one shows it on the map. Several people can follow the same beacon — each just needs the secret.
4. **Removing** a beacon from the list only stops following it; the phone keeps sending.
5. **No demo child** is created any more. A beacon added before its first position shows "waiting for the first signal".

## Fresh start

The current beacon and its stored positions are left behind; the page starts with an empty list and an "Add a beacon" box asking for the secret and a name.

## What the risks are, and how the plan handles them

- **The secret is the whole lock.** Anyone who sees it can both follow the child and post fake positions. Mitigated by: minimum 32 characters of real randomness generated on the phone, never shown on this page, sent only over HTTPS. Not mitigated: if it leaks (screenshot, chat message), access is permanent until the phone generates a new one.
- **Guessing a secret.** With 32+ random characters, guessing is not realistic. The add-a-beacon form and the posting endpoint both get rate limiting so someone can't try codes in bulk, and both answer the same way whether or not a code exists.
- **Anyone can create a beacon just by posting.** That's the point of the phone-generated flow, but it means unlimited rows could be created. The endpoint accepts a new beacon only with a well-formed secret, and each new beacon is capped on how many positions it stores per minute.
- **No way to revoke.** Because the phone owns the secret, rotation means generating a new one in the app; the old beacon then goes silent and can be removed from the list. Worth adding a "stop following" and, later, an owner-only kick-out if you want that.
- **Position history is personal data.** Reads stay scoped by the database to people who have added that beacon; the page's own checks are not the only barrier.

## Technical notes



- New tables (existing `devices`/`locations` stay in place, unused, since columns can't be dropped safely):
  - `beacons` — `id`, `secret_code` (unique, phone-supplied, 32–128 chars), `battery_level`, `last_seen_at`, `first_seen_at`, `created_at`.
  - `beacon_watchers` — `beacon_id`, `user_id`, `label`, `created_at`, unique pair. The name lives here, so each follower can label it their own way.
  - `beacon_positions` — `beacon_id`, `latitude`, `longitude`, `accuracy_m`, `battery_level`, `recorded_at`.
- RLS: `SECURITY DEFINER` helper `public.is_watching(_beacon uuid, _user uuid)` avoids recursive policy checks. Watchers may SELECT their beacons and positions; `beacon_watchers` rows are readable/insertable/updatable/deletable by the row's own `user_id`. Inserts into `beacons`/`beacon_positions` happen only through the admin client in the ingest route. Grants to `authenticated` + `service_role`; no `anon`. `beacon_positions` gets `REPLICA IDENTITY FULL` and joins the realtime publication so the live badge keeps working.
- `src/routes/api/public/beacon.ts`: same JSON contract, `pairing_key` now treated as the phone's secret. Looks up `beacons.secret_code`; if absent, creates the beacon row (upsert on the secret), then inserts the position and updates battery/last seen. Secret must be at least 32 characters so a guessed value can't claim a beacon. Timestamp tolerance, out-of-order guard and error shapes unchanged.
- Server functions in `src/lib/tracking.functions.ts`, all behind `requireSupabaseAuth`: `listBeacons`, `getBeacon({beaconId})`, `addBeacon({secretCode, label})` (admin-client lookup or create-on-first-add, then insert a watcher row for `context.userId`), `removeBeacon`, `renameBeacon` (updates the watcher's label). The old `getTracker` demo-seeding logic is removed.
- `src/routes/_authenticated/tracker.tsx`: beacon switcher plus empty state with the add-a-secret form; realtime channel keyed on the selected beacon id; the secret is not displayed on the page any more (the phone holds it), so the show/copy/rotate controls go away.
