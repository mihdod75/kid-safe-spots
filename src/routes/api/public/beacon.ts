import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Android clients send snake_case, camelCase or PascalCase; accept all three.
const num = z.union([z.number(), z.string()]).transform((v) => Number(v));

const rawSchema = z
  .object({
    pairing_key: z.string().optional(),
    pairingKey: z.string().optional(),
    PairingKey: z.string().optional(),
    secret_code: z.string().optional(),
    secretCode: z.string().optional(),
    SecretCode: z.string().optional(),
    latitude: num.optional(),
    Latitude: num.optional(),
    lat: num.optional(),
    longitude: num.optional(),
    Longitude: num.optional(),
    lon: num.optional(),
    lng: num.optional(),
    accuracy_m: num.optional(),
    accuracyM: num.optional(),
    AccuracyM: num.optional(),
    accuracy: num.optional(),
    battery_level: num.optional(),
    batteryLevel: num.optional(),
    BatteryLevel: num.optional(),
    battery: num.optional(),
    recorded_at: z.string().optional(),
    recordedAt: z.string().optional(),
    RecordedAt: z.string().optional(),
  })
  .passthrough();

const bodySchema = rawSchema.transform((v, ctx) => {
  const pairingKey =
    v.pairing_key ?? v.pairingKey ?? v.PairingKey ?? v.secret_code ?? v.secretCode ?? v.SecretCode;
  const latitude = v.latitude ?? v.Latitude ?? v.lat;
  const longitude = v.longitude ?? v.Longitude ?? v.lon ?? v.lng;
  const accuracy = v.accuracy_m ?? v.accuracyM ?? v.AccuracyM ?? v.accuracy;
  const battery = v.battery_level ?? v.batteryLevel ?? v.BatteryLevel ?? v.battery;
  const recordedAt = v.recorded_at ?? v.recordedAt ?? v.RecordedAt;

  const bad = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });

  if (!pairingKey || pairingKey.length < 32 || pairingKey.length > 128)
    bad("pairing_key", "Required, 32-128 characters");
  if (latitude === undefined || Number.isNaN(latitude) || latitude < -90 || latitude > 90)
    bad("latitude", "Required number between -90 and 90");
  if (longitude === undefined || Number.isNaN(longitude) || longitude < -180 || longitude > 180)
    bad("longitude", "Required number between -180 and 180");

  return {
    pairing_key: pairingKey as string,
    latitude: latitude as number,
    longitude: longitude as number,
    accuracy_m:
      accuracy !== undefined && !Number.isNaN(accuracy) ? Math.min(accuracy, 100000) : undefined,
    battery_level:
      battery !== undefined && !Number.isNaN(battery)
        ? Math.max(0, Math.min(100, Math.round(battery)))
        : undefined,
    recorded_at: recordedAt,
  };
});


// How old a reading may be before we fall back to server time.
const MAX_AGE_MS = 5 * 60 * 1000;
// Tolerance for a beacon clock running slightly ahead of ours.
const MAX_SKEW_MS = 2 * 60 * 1000;
// Don't accept more than one position every couple of seconds per beacon.
const MIN_INTERVAL_MS = 2000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export const Route = createFileRoute("/api/public/beacon")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          console.warn("[beacon] 400 malformed JSON body");
          return json({ error: "Body is not valid JSON" }, 400);
        }

        const result = bodySchema.safeParse(body);
        if (!result.success) {
          const issues = result.error.issues.map((issue) => ({
            field: issue.path.join(".") || "(body)",
            message: issue.message,
          }));
          console.warn("[beacon] 400 invalid payload", JSON.stringify(issues));
          return json({ error: "Invalid payload", issues }, 400);
        }
        const parsed = result.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // The beacon's clock is advisory: if it is missing, unparseable or too
        // far from ours, fall back to server time instead of refusing the fix.
        const now = new Date();
        const sent = parsed.recorded_at ? new Date(parsed.recorded_at) : null;
        const sentValid = sent !== null && !Number.isNaN(sent.getTime());
        const ageMs = sentValid ? now.getTime() - sent!.getTime() : 0;
        const withinWindow = sentValid && ageMs <= MAX_AGE_MS && ageMs >= -MAX_SKEW_MS;
        const clockAdjusted = !withinWindow;
        const recordedAt = withinWindow ? sent! : now;

        const { data: beacon, error } = await supabaseAdmin
          .from("beacons")
          .select("id, last_seen_at")
          .eq("secret_code", parsed.pairing_key)
          .maybeSingle();

        if (error || !beacon) return json({ error: "Unknown pairing key" }, 401);

        const lastSeenMs = beacon.last_seen_at
          ? new Date(beacon.last_seen_at).getTime()
          : 0;

        // Throttle: ignore bursts arriving faster than the allowed interval.
        if (lastSeenMs && now.getTime() - lastSeenMs < MIN_INTERVAL_MS) {
          return json({ ok: true, applied: false, note: "throttled" });
        }

        const recordedAtIso = recordedAt.toISOString();

        const insert = await supabaseAdmin.from("beacon_positions").insert({
          beacon_id: beacon.id,
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          accuracy_m: parsed.accuracy_m ?? null,
          battery_level: parsed.battery_level ?? null,
          recorded_at: recordedAtIso,
        });
        if (insert.error) return json({ error: "Could not store position" }, 500);

        // A newer reading already arrived: keep the history row, but don't move
        // the beacon back to this older position.
        const isOutdated = lastSeenMs >= recordedAt.getTime();

        if (!isOutdated) {
          await supabaseAdmin
            .from("beacons")
            .update({
              last_seen_at: recordedAtIso,
              ...(parsed.battery_level !== undefined
                ? { battery_level: parsed.battery_level }
                : {}),
            })
            .eq("id", beacon.id);
        }

        return json({
          ok: true,
          applied: !isOutdated,
          clock_adjusted: clockAdjusted,
          recorded_at: recordedAtIso,
          ...(clockAdjusted
            ? { note: "recorded_at was missing or out of range; server time was used" }
            : {}),
        });
      },
    },
  },
});
