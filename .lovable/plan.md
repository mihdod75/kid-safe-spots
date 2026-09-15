# Deleting a beacon clears it from every follower

## What you reported

After deleting "Robert" and registering a new phone under the same name, you could still see its position. Checked in the database: that only works because you were signed in as the administrator — an admin can open any beacon without being an approved follower. An ordinary account correctly had to ask for approval again, so no follower ever inherited access to the new phone.

## What changes

When a beacon is deleted, it disappears from every follower's list, and anyone who had it open is told it was removed instead of being left looking at a stale card.

The follow records for a deleted beacon are already removed automatically by the database (verified: the follower link is set to cascade on delete). What is missing is the page reacting to it, so this work is on the viewing page:

- A follower whose open beacon was deleted sees a short "This beacon was removed" message, the card and map close, and the list refreshes.
- The list refreshes on its own, so a deleted beacon drops off without a manual page reload.
- The admin page confirms deletion with a warning that all followers lose access, and says how many followers are affected.

## Open question (not blocking)

Whether an admin should also need to be an approved follower to view a beacon. Left as is for now — admins keep full visibility. Say the word and I will change it.

## Technical notes

- `src/routes/_authenticated/tracker.tsx`: the "beacon is gone" effect (snapshot returns `null`, or access is lost) also clears the selection, removes the cached snapshot, drops the live badge and shows a toast; the beacons list keeps a background refresh interval.
- `src/routes/_authenticated/admin.tsx`: delete confirmation text names the beacon and its follower count, using the count already returned by `adminListBeacons`.
- No database or policy changes: `beacon_watchers.beacon_id` and `beacon_positions.beacon_id` already use `ON DELETE CASCADE`, so follow rows and history vanish with the beacon.
