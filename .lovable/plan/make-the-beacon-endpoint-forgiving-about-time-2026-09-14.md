# Make the beacon endpoint forgiving about time

## What's happening

Two separate problems:

1. **The error you pasted comes from your Android app, not from this website.** `The converter specified on 'LocationBeacon.Models.BeaconPayload.RecordedAt' is not compatible with the type 'System.String'` is a .NET serialization error — the app fails before it ever sends the request. A date/time converter is attached to a property declared as text.
2. **The website was rejecting readings anyway.** The server log shows readings arriving about 5.4 hours out of date, plus some with a missing or badly formatted time field. Those came back as errors.

## What will change on the website

- The time field becomes **optional**. If your app doesn't send it, the server uses its own clock.
- If a sent time is clearly out of step with the server (more than a few minutes either way), the server **records the position using its own clock** instead of refusing it, and says so in the reply.
- Only genuinely late-but-plausible readings (within the normal window) still keep their own timestamp and their existing "don't overwrite a newer position" behaviour.
- The reply gains a short note when the phone's clock was ignored, so you can spot a clock problem without digging into logs.

Result: your app can post just key, latitude, longitude and battery, and the position will show on the map.

## On your Android side

Simplest fix for the .NET error: send the time as a plain string in ISO form (`2026-09-14T15:24:00Z`), or drop the field entirely now that it's optional.

## Technical details

- `src/routes/api/public/beacon.ts`: `recorded_at` becomes `z.string().optional()` with a manual `Date` parse (accepts ISO with or without offset). Unparseable, absent, older than 5 min, or more than 2 min ahead → fall back to `new Date()` and set `clock_adjusted: true` in the response instead of returning 400.
- Keep 400 only for malformed JSON and invalid key/latitude/longitude/battery values; keep 401 for an unknown pairing key.
- Keep the existing outdated-reading guard based on the effective timestamp.
- Publish afterwards so the live address serves the new behaviour.
