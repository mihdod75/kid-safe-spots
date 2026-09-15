import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  enrollment_code: z.string().min(32).max(128),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/beacon-enroll-status")({
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
        if (!result.success) return json({ error: "Invalid payload" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const hash = await sha256Hex(result.data.enrollment_code);

        const { data: enrollment } = await supabaseAdmin
          .from("beacon_enrollments")
          .select("id, status, beacon_id, expires_at")
          .eq("enrollment_code_hash", hash)
          .maybeSingle();

        if (!enrollment) return json({ status: "unknown" }, 404);

        if (enrollment.status === "rejected") return json({ status: "rejected" });
        if (enrollment.status === "claimed") return json({ status: "claimed" });
        if (enrollment.status !== "approved") {
          if (new Date(enrollment.expires_at).getTime() < Date.now())
            return json({ status: "expired" });
          return json({ status: "pending" });
        }

        const { data: beacon } = await supabaseAdmin
          .from("beacons")
          .select("id, name, secret_code")
          .eq("id", enrollment.beacon_id!)
          .maybeSingle();
        if (!beacon) return json({ error: "Beacon missing" }, 500);

        // The secret is handed over exactly once; the enrolment code dies here.
        await supabaseAdmin
          .from("beacon_enrollments")
          .update({ status: "claimed", claimed_at: new Date().toISOString() })
          .eq("id", enrollment.id);

        return json({
          status: "approved",
          beacon_name: beacon.name,
          secret_code: beacon.secret_code,
        });
      },
    },
  },
});
