# Email alert when a beacon wakes up

Followers who opt in get an email when a beacon they follow starts sending again after a quiet period they choose.

## What a follower sees

On the tracker page, under the beacon card, a small "Email me when this beacon wakes up" switch. When it is on, a short line lets them pick the quiet period that counts as "asleep": 5, 15, 30 or 60 minutes (default 5).

When a position arrives after a gap longer than their chosen period, they get one email:

> **Robert is sending again** — Robert started sending its position again at 15:42 after 47 minutes of silence. Open the tracker to see where it is.

No limit beyond the gap rule: each qualifying wake-up sends an email. Followers who leave the switch off get nothing, and anyone who stops following stops getting emails.

## Sender domain

Emails can only be sent from a domain you own — there is no shared or free sender address. The feature will be built either way, but no email actually goes out until a sender domain is set up and verified.

## Technical notes

- New columns on `beacon_watchers`: `notify_wake boolean not null default false` and `notify_gap_minutes integer not null default 5`. Followers may set these on their own row only; since `authenticated` has no UPDATE grant on the table, a new `setWakeAlert` server function (verified caller, scoped to `user_id = auth.uid()`) writes them with the service-role client, same pattern as `relabelBeacon`.
- Detection lives in `src/routes/api/public/beacon.ts`, where the beacon's previous `last_seen_at` is already read. Compute `gapMinutes = (recordedAt - last_seen_at)` before the beacon row is updated. If the reading is applied (not outdated, not throttled) and there was a previous `last_seen_at`, load approved watchers with `notify_wake = true` and `notify_gap_minutes <= gapMinutes`, resolve their email via the service-role admin auth API, and send each one email.
- Sending uses Lovable's managed email API through the scaffolded app-email helper (`sendTemplateEmail`) with a new React Email template `beacon-awake` (beacon name, gap in plain words, wake time, link to the tracker). Idempotency key: `beacon-awake-${beacon.id}-${recordedAtIso}-${watcherId}`, so a retried post never double-sends.
- Sends run after the position is stored and never block the response: a failed send is logged, and the endpoint still returns `ok`. Suppressed recipients (`sent: false`) are treated as normal, not errors.
- Watcher email lookup is capped at a sane batch (e.g. 50 followers per wake-up) to keep the endpoint fast.
- No queue, cron job, or email table — delivery, retries and unsubscribes are handled by Lovable.

## Out of scope

Push notifications, SMS, low-battery alerts, and "beacon went quiet" alerts (the reverse direction) — those would need a scheduled check rather than the arrival of a position.
