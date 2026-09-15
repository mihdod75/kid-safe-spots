# Admins can approve their own beacon requests

## What changes

On the tracker page, when you are an admin and you have asked to follow a beacon, the pending card gains an **Approve** button (and a **Decline** option). One tap grants you access and the beacon appears in your list immediately, without going to the Admin page.

Non-admins see the pending card exactly as before.

## How it works

- The pending state on the tracker page already knows the beacon and the request; it now also knows whether you are an admin (that check already exists on the page).
- Approving calls the same approval action the Admin page uses, so the same rules and audit fields apply (who decided, when).
- After approving, the beacon list and the selected beacon refresh so the map opens right away.

## Technical notes

- `src/routes/_authenticated/tracker.tsx`: in the pending/declined branch, when `adminQuery.data?.isAdmin`, render Approve / Decline buttons wired to `decideAccessRequest` via `useServerFn`, then invalidate the beacons query and select the beacon.
- `decideAccessRequest` takes a `watcherId`. The tracker's beacon list needs to expose the watcher row id for pending entries — extend `listBeacons` in `src/lib/tracking.functions.ts` to include `watcherId` alongside the existing status.
- No database or policy changes: `decideAccessRequest` already runs admin-verified and self-approval by an admin is permitted server-side.
