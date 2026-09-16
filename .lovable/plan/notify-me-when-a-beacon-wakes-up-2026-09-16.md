# Notify me when a beacon wakes up

Followers who opt in get a phone/desktop notification when a beacon they follow starts sending again after a quiet period they choose.

## What a follower sees

On the tracker page, under the beacon card, a switch: "Notify me when this beacon wakes up". Turning it on asks the browser for notification permission once. Next to it, a short picker for the quiet period that counts as "asleep": 5, 15, 30 or 60 minutes (default 5).

When a position arrives after a gap longer than their chosen period, they get a notification:

> **Robert is sending again** — after 47 minutes of silence. Tap to open the tracker.

Tapping it opens the tracker with that beacon selected. Notifications arrive even when the site is closed, as long as the browser is running. No extra limit: every qualifying wake-up notifies.

Notes on device support: on Android and desktop this works straight away. On iPhone, notifications only work once the site has been added to the home screen — the page will say so instead of failing silently. In the Lovable preview the permission prompt is blocked by the browser, so the switch will tell the user to open the app in its own tab.

## Technical notes

- **Opt-in columns** on `beacon_watchers`: `notify_wake boolean not null default false`, `notify_gap_minutes integer not null default 5`. Written by a new `setWakeAlert` server function (verified caller, scoped to `user_id = auth.uid()`) via the service-role client, same pattern as `relabelBeacon`, since `authenticated` has no UPDATE grant on that table.
- **New table `push_subscriptions`**: `id`, `user_id`, `endpoint` (unique), `p256dh`, `auth`, `user_agent`, `created_at`, `last_used_at`. RLS: users select/delete their own rows; service_role full. Inserts go through a `savePushSubscription` server function rather than a client grant.
- **Client**: a `usePushSubscription` hook registers `public/sw.js` (a plain service worker with `push` and `notificationclick` handlers), calls `PushManager.subscribe` with the VAPID public key, and posts the subscription to the server. Guards for unsupported browsers, iframe (preview), denied permission, and iOS-not-installed, each with its own message.
- **Keys**: a VAPID key pair is generated once and stored as secrets — the public key also exposed as a `VITE_`-prefixed variable for the browser.
- **Sending** happens in `src/routes/api/public/beacon.ts`, which already reads the beacon's previous `last_seen_at`. Compute the gap before updating the row; if the reading is applied (not outdated, not throttled) and a previous `last_seen_at` existed, load approved watchers with `notify_wake = true` and `notify_gap_minutes <= gap`, fetch their push subscriptions, and send each one.
- **Web Push from the edge runtime**: the `web-push` npm package is Node-only and will not run in the app's serverless runtime, so the VAPID JWT (ES256) and the aes128gcm payload encryption are done with the built-in Web Crypto API in a small `src/lib/web-push.server.ts` helper, then POSTed to the subscription endpoint.
- **Cleanup**: a `404`/`410` from a push endpoint deletes that subscription row; other failures are logged only. Sends never block the beacon response — the endpoint still returns `ok` even if notifications fail. Capped at a sane batch (e.g. 100 subscriptions per wake-up).
- No queue, cron job, or email infrastructure involved.

## Out of scope

Email alerts, SMS, low-battery alerts, and "beacon went quiet" alerts (the reverse direction) — the last one needs a scheduled check rather than an arriving position.
