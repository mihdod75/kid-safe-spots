# Find out why the beacon app gets "bad request"

## What the logs show

Since 15:11 today, every position sent by the Android app to
`https://kid-safe-spots.lovable.app/api/public/beacon` was refused with a 400
("bad request"). No other errors: the tracker page itself loads fine and is
still showing the simulated child.

The endpoint refuses a message for one of three reasons, and right now it does
not say which one:

1. A field is missing or has the wrong shape (for example `recorded_at` absent,
   or sent as a number instead of an ISO date text, or latitude sent as text).
2. The reading is older than 5 minutes.
3. The reading is dated more than 2 minutes in the future (phone clock ahead).

The most common cause for a brand-new app is number 1 with `recorded_at`.

## Plan

1. Make the refusal message explain itself: the reply will name the exact
   problem, e.g. which field is missing or malformed, or "reading too old by
   X seconds". Nothing sensitive is exposed — no keys, no database detail.
2. Record each refusal in the server log with the same reason, so the cause is
   visible here without you having to read the phone's response.
3. Send a few test messages myself against the live endpoint — one correct,
   one missing `recorded_at`, one with an old timestamp — to confirm the new
   messages are accurate.
4. Report back the exact reason your app is being refused, with the corrected
   body to send.

## Technical notes

- File: `src/routes/api/public/beacon.ts`.
- Replace the bare `catch { return json({ error: "Invalid payload" }, 400) }`
  with `safeParse` and map `error.issues` to `{ error, issues: [{path, message}] }`.
- Include the measured age in the "too old" / "in the future" responses.
- `console.warn` each 400 with reason + age (never the pairing key).
- No schema, auth, or database changes.
