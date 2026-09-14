import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  pairing_key: z.string().min(16).max(128),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy_m: z.number().min(0).max(100000).optional(),
  battery_level: z.number().int().min(0).max(100).optional(),
  recorded_at: z.string().datetime().optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export const Route = createFileRoute("/api/public/beacon")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return json({ error: "Invalid payload" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: device, error } = await supabaseAdmin
          .from("devices")
          .select("id")
          .eq("pairing_key", parsed.pairing_key)
          .maybeSingle();

        if (error || !device) return json({ error: "Unknown pairing key" }, 401);

        const recordedAt = parsed.recorded_at ?? new Date().toISOString();

        const insert = await supabaseAdmin.from("locations").insert({
          device_id: device.id,
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          accuracy_m: parsed.accuracy_m ?? null,
          battery_level: parsed.battery_level ?? null,
          recorded_at: recordedAt,
        });
        if (insert.error) return json({ error: "Could not store position" }, 500);

        await supabaseAdmin
          .from("devices")
          .update({
            last_seen_at: recordedAt,
            is_demo: false,
            ...(parsed.battery_level !== undefined
              ? { battery_level: parsed.battery_level }
              : {}),
          })
          .eq("id", device.id);

        return json({ ok: true });
      },
    },
  },
});
