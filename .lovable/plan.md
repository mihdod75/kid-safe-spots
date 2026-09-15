# Fix "Enrolment submission failed: NotFound"

## What is happening

The join-request address exists and works, but only in the preview version of the site. I tested both:

- preview address: accepted the request (success)
- live address `https://kid-safe-spots.lovable.app/api/public/beacon-enroll`: "not found"

The published site is still the older version, from before the new join-and-approve flow was built. Your phone posts to the live address, so it gets "NotFound".

## The fix

Publish the app again. That puts the three phone-facing addresses on the live site:

- `/api/public/beacon-enroll` — the phone asks to join
- `/api/public/beacon-enroll-status` — the phone collects its secret once approved
- `/api/public/beacon` — the phone posts positions

## After publishing

1. Send the join request again from the phone; it should come back as "pending".
2. Open the Admin page, check the short code shown on the phone matches, give the beacon a name and approve it.
3. The phone's next status check receives the secret (once only) and can start posting positions.
4. On the tracker page, request access to that beacon and approve the request from Admin, and the map starts updating live.

## Note while testing

If you want to try the phone against the preview first, point it at
`https://id-preview--dba904b8-c3c9-4e5e-9c9f-78d7213139c5.lovable.app` — it already runs the new flow.
