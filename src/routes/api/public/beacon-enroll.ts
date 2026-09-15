import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  enrollment_code: z.string().min(32).max(128),
  pairing_word: z.string().min(4).max(12),
  device_label: z.string().min(1).max(60).optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/beacon-enroll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Body is not valid JSON" }, 400);
        }

        const result = bodySchema.safeParse(body);
        if (!result.success) {
          return json(
            {
              error: "Invalid payload",
              issues: result.error.issues.map((i) => ({
                field: i.path.join(".") || "(body)",
                message: i.message,
              })),
            },
            400,
          );
        }
        const parsed = result.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const hash = await sha256Hex(parsed.enrollment_code);

        const { data: existing } = await supabaseAdmin
          .from("beacon_enrollments")
          .select("id, status")
          .eq("enrollment_code_hash", hash)
          .maybeSingle();

        if (existing) return json({ status: existing.status });

        // Keep the queue small so nobody can flood it with join requests.
        const { count } = await supabaseAdmin
          .from("beacon_enrollments")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .gt("expires_at", new Date().toISOString());
        if ((count ?? 0) >= 25) {
          return json({ error: "Too many pending requests, try again later" }, 429);
        }

        const { error } = await supabaseAdmin.from("beacon_enrollments").insert({
          enrollment_code_hash: hash,
          pairing_word: parsed.pairing_word.toUpperCase(),
          device_label: parsed.device_label ?? "Android phone",
        });
        if (error) return json({ error: "Could not register the request" }, 500);

        return json({ status: "pending" });
      },
    },
  },
});
