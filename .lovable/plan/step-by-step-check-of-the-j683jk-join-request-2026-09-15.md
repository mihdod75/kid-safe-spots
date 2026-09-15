# Step-by-step check of the J683JK join request

## What the records already show

- The two earlier requests (FCBWHU 06:24, T5TRC5 06:31) were approved and the phone did collect its secret both times.
- You then deleted those beacons, so the secret the phone is still holding belongs to nothing. Any position it sends now is refused.
- There are currently zero beacons registered.

## What happens next

1. You send the new join request from the phone (pairing word J683JK, enrolment code starting a8b4999...).
2. I read the records and confirm: the request arrived, it is the only pending one for that phone, and the pairing word shown matches J683JK.
3. You approve it on the Admin page and I confirm a beacon was created and the secret was handed to the phone exactly once.
4. I watch for the first position and confirm it was stored with a sensible time, battery and accuracy.
5. At each step, if something is refused I report the exact reason and the smallest fix.

## Important

Once a beacon is deleted, the phone must enrol again from scratch — its stored secret cannot be reused. If you prefer to keep a phone but change its secret, use "issue a new secret" on the Admin page and let the phone re-enrol, rather than deleting the beacon.

No code or database changes are part of this step; it is a verification pass. If a step fails, I will come back with a fix plan for that specific failure.
