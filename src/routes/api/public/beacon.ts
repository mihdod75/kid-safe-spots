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

        const recordedAt = new Date(parsed.recorded_at);
        const ageMs = Date.now() - recordedAt.getTime();
        if (ageMs > MAX_AGE_MS) {
          const seconds = Math.round(ageMs / 1000);
          console.warn(`[beacon] 400 reading too old by ${seconds}s`);
          return json(
            {
              error: `Reading too old: recorded_at is ${seconds}s in the past (max ${MAX_AGE_MS / 1000}s)`,
              age_seconds: seconds,
              server_time: new Date().toISOString(),
            },
            400,
          );
        }
        if (ageMs < -MAX_SKEW_MS) {
          const seconds = Math.round(-ageMs / 1000);
          console.warn(`[beacon] 400 reading ${seconds}s in the future`);
          return json(
            {
              error: `Reading in the future: recorded_at is ${seconds}s ahead of server time (max ${MAX_SKEW_MS / 1000}s)`,
              ahead_seconds: seconds,
              server_time: new Date().toISOString(),
            },
            400,
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
