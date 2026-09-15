import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  pairing_key: z.string().min(32).max(128),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy_m: z.number().min(0).max(100000).optional(),
  battery_level: z.number().int().min(0).max(100).optional(),
  recorded_at: z.string().optional(),
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
