# Child location tracking page

A private page where a signed-in parent sees their child's position on a Google map, with battery level and last-seen time. Built so the Android beacon app can start sending real positions later.

## What the parent sees

1. **Sign in** — email and password. Only signed-in parents see any map.
2. **Map page** — Google map centred on the child's latest position, with a marker.
3. **Status card** — child's name, battery percentage, and "last seen 2 minutes ago". The card turns to a warning look when the position is older than 10 minutes or the battery is low.
4. **Auto refresh** — the page checks for a newer position every 15 seconds, and there is a manual refresh button.
5. **Empty state** — if no position has arrived yet, the map shows a friendly "waiting for the first signal" message instead of a blank grey square.

## The beacon side

Since the Android app isn't decided yet, this page is built to work both ways:

- **Demo mode now** — each parent account gets one sample child whose position moves slightly, so the map, marker, battery and last-seen all work immediately.
- **Ready for the real app later** — a secure web address is created that the Android app can send positions to. Each child device gets its own secret pairing key shown on the page; the Android app sends that key with every position, and positions with a wrong or missing key are rejected. Nothing else changes on this page when the real app starts sending.

## Accounts and privacy

- Parent accounts with email and password; each parent only ever sees their own children's positions, enforced in the database, not just in the page.
- The page itself is not reachable without signing in.

## Technical notes

- Backend: Lovable Cloud (database + auth).
- Tables: `profiles` (parent display name), `devices` (child name, owner parent, hashed pairing key, battery, last_seen), `locations` (device, latitude, longitude, accuracy, battery, recorded_at). Row-level security scopes every read to `auth.uid()`; grants issued for `authenticated` in the same migration.
- Map: Google Maps connector (Lovable-managed), Maps JavaScript API loaded with `loading=async` + callback, `google.maps.Marker`, no `mapId`.
- Ingest: `src/routes/api/public/beacon.ts` POST handler — validates body with Zod, looks up the device by pairing key hash using the admin client, inserts a location row, updates the device's battery/last_seen. Returns 401 on a bad key.
- Reads: authenticated `createServerFn` with `requireSupabaseAuth`; map page lives under `src/routes/_authenticated/`, with a public landing + `/auth` sign-in route at top level.
- Demo positions are inserted by the migration and nudged by a small client-side simulation flag, removed once real data arrives.

## Out of scope for now

Multiple children switching, history trail, and safe-zone alerts — the data model leaves room for all three.
