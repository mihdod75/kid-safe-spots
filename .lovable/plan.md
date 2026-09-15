# Pending-request badge on the Admin button

## What you get

While you are on the tracker as an admin, the "Admin" button shows a small red number whenever something is waiting for you: new phone join requests plus new follow requests, added together. The number updates on its own roughly every 20 seconds and when you come back to the tab, and disappears once nothing is pending.

## Details

- Counts only currently pending items: join requests that have not expired, and access requests still awaiting a decision.
- Shown only to admins (the button itself is admin-only already).
- Caps the display at "9+" so the button stays compact.
- Non-admins see no change.

## Technical notes

- `src/lib/admin.functions.ts`: add `pendingAdminCounts` — an admin-guarded server function returning `{ enrollments: number, accessRequests: number }` using `head: true, count: "exact"` queries on `beacon_enrollments` (status pending, `expires_at > now`) and `beacon_watchers` (status pending). Returns zeros for non-admins instead of throwing.
- `src/routes/_authenticated/tracker.tsx`: a `useQuery(["admin-pending"])` enabled when `adminQuery.data?.isAdmin`, `refetchInterval: 20_000`, `refetchOnWindowFocus: true`; render the total as an absolutely positioned badge on the Admin `Link` button using existing destructive/primary tokens, with an accessible label such as "3 requests waiting".
