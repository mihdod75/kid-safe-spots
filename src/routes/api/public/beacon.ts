import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  pairing_key: z.string().min(16).max(128),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy_m: z.number().min(0).max(100000).optional(),
  battery_level: z.number().int().min(0).max(100).optional(),
  recorded_at: z.string().optional(),
});

// How old a reading may be before we refuse it (replay protection).
const MAX_AGE_MS = 5 * 60 * 1000;
// Tolerance for a beacon clock running slightly ahead of ours.
const MAX_SKEW_MS = 2 * 60 * 1000;

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
        if (clockAdjusted && parsed.recorded_at) {
          console.warn(
            `[beacon] clock adjusted: recorded_at="${parsed.recorded_at}" off by ${Math.round(ageMs / 1000)}s`,
          );
        }

        const { data: device, error } = await supabaseAdmin
          .from("devices")
          .select("id, last_seen_at")
          .eq("pairing_key", parsed.pairing_key)
          .maybeSingle();

        if (error || !device) return json({ error: "Unknown pairing key" }, 401);

        const recordedAtIso = recordedAt.toISOString();

        const insert = await supabaseAdmin.from("locations").insert({
          device_id: device.id,
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          accuracy_m: parsed.accuracy_m ?? null,
          battery_level: parsed.battery_level ?? null,
          recorded_at: recordedAtIso,
        });
        if (insert.error) return json({ error: "Could not store position" }, 500);

        // A newer reading already arrived: keep the history row, but don't move
        // the device back to this older position.
        const isOutdated =
          device.last_seen_at !== null &&
          new Date(device.last_seen_at).getTime() >= recordedAt.getTime();

        if (!isOutdated) {
          await supabaseAdmin
            .from("devices")
            .update({
              last_seen_at: recordedAtIso,
              is_demo: false,
              ...(parsed.battery_level !== undefined
                ? { battery_level: parsed.battery_level }
                : {}),
            })
            .eq("id", device.id);
        }

        return json({ ok: true, applied: !isOutdated });
      },
    },
  },
});
