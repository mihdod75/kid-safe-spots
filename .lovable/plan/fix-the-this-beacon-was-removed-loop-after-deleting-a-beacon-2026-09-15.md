# Fix the "This beacon was removed" loop after deleting a beacon

## What happens now

As an admin you delete a beacon and switch to the tracker. The page shows the removal notice over and over and still says "Tracking / Live", until you reload. On another device (fresh load) it looks correct.

## Why

The tracker keeps its own cached list of beacons from before the deletion. When it discovers the open beacon is gone it clears the selection — but the still-stale list immediately re-selects that same beacon, which is fetched again, found gone again, and the notice fires again. Each round also re-runs because the effect depends on values that change on every render, so the cycle never settles.

## The fix (tracker page only)

- Remember which beacon ids have already been reported as removed, and never auto-select them again.
- Show the removal notice once per beacon, not once per check.
- When a beacon turns out to be gone: clear the selection, drop its cached data, hide the live badge and the tracking card, and refresh the beacon list from the server so the stale entry disappears.
- Let the effect depend only on stable values so it cannot re-trigger itself.

## Technical notes

In `src/routes/_authenticated/tracker.tsx`:

- Add a `useRef<Set<string>>` of "gone" beacon ids.
- Selection effect: filter `approved` against that set before auto-selecting, so a stale list entry can't re-select a deleted beacon.
- Gone-beacon effect: guard on `!goneRef.current.has(selectedId)`; inside, add the id to the set, `queryClient.removeQueries({ queryKey: ["beacon", id] })`, `setSelectedId(null)`, `setLive(false)`, one `toast.info`, and `queryClient.invalidateQueries({ queryKey: ["beacons"] })`.
- Replace the unstable `listQuery` dependency with `queryClient` (stable) in the dependency array.
- Clear ids from the set when a subsequent list fetch no longer contains them, so a re-created beacon with a new id is unaffected.

No database or server-function changes.
