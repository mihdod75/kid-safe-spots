# Instant map updates when a position arrives

Today the page asks the server for a new position every 15 seconds, so a fresh
point from the phone can take up to 15 seconds to show. Instead, the page will
be notified the moment a position is saved and move the marker right away.

## What changes for you

- A new position from the beacon app appears on the map within about a second,
  together with the updated battery and "last seen" time.
- A small "Live" indicator near the status card shows the page is connected and
  listening; it falls back quietly to the periodic check if the live connection
  drops.
- The regular check still runs, but less often (every 60 seconds) as a safety
  net. The "Refresh now" and "Re-center" buttons stay as they are.

## Technical notes

- Migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.locations;`
  and set `REPLICA IDENTITY FULL` on the table so update payloads carry the row.
  Existing RLS already scopes reads to the owning parent, so a subscriber only
  receives rows for their own devices.
- `src/routes/_authenticated/tracker.tsx`: inside a `useEffect` keyed on the
  device id, open one `supabase.channel('locations-<deviceId>')` subscribed to
  `postgres_changes` INSERT on `public.locations` filtered by
  `device_id=eq.<id>`; on each event call `queryClient.invalidateQueries({ queryKey: ['tracker'] })`.
  Tear the channel down with `supabase.removeChannel(channel)` on unmount/id
  change to avoid reconnection loops.
- Track the `subscribe()` status to drive the "Live" badge; lower
  `refetchInterval` from 15s to 60s.
- Demo mode: the demo nudge only happens when the server is queried, so with a
  60s interval the simulated child moves once a minute instead of every 15s.
  Real beacon positions are unaffected.
