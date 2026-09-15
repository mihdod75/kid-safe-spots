# Make the approval reply repeatable for the phone

## What the records show

The beacon "Robert" was created at 07:12:47 and the phone's join request was marked
claimed at 07:12:53 — six seconds later. That means the page did send the approval
answer, secret included, and the phone collected it.

Everything the phone asks after that gets a different, much smaller answer, because the
secret is handed over exactly once and the join request is then closed:

```text
first poll after approval   {"status":"approved","beacon_name":"Robert","secret_code":"<64 hex characters>"}
every later poll            {"status":"claimed"}
```

So if the app stored nothing on that first answer, or treats anything other than
"approved" as "still waiting", it will never see the approval again. No positions have
arrived yet either, which fits: the phone has no usable secret.

## The change

Keep answering "approved" with the same secret for as long as the join request is alive
(24 hours from the request), instead of only the first time. Repeating the same answer is
harmless — it is the same phone, with the same one-time join code — and it makes the
handover survive an app restart, a dropped connection, or a retry.

After the 24-hour window the request closes for good and the phone must ask to join
again, exactly as today.

## Technical notes

- `src/routes/api/public/beacon-enroll-status.ts`: when the row is `claimed`, look up the
  linked beacon and return the same `approved` payload as long as `expires_at` is in the
  future; keep `claimed_at` as the moment of the first handover. Past `expires_at`, return
  `{"status":"expired"}`.
- Approved rows keep marking themselves claimed on first delivery, so the admin page still
  shows which phones have picked up their secret.
- Nothing else changes: the pending / rejected / unknown replies, the admin flow, and the
  position endpoint stay as they are.

## After the change

Publish, then let the phone poll once. It should get the approved answer with the secret
and start posting positions; the tracker page will show the first fix live.
