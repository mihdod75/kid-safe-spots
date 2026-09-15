import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z
  .object({
    enrollment_code: z.string().min(32).max(128).optional(),
    pairing_word: z.string().min(4).max(12).optional(),
    device_label: z.string().min(1).max(60).optional(),
    enrollmentCode: z.string().min(32).max(128).optional(),
    pairingWord: z.string().min(4).max(12).optional(),
    deviceLabel: z.string().min(1).max(60).optional(),
    EnrollmentCode: z.string().min(32).max(128).optional(),
    PairingWord: z.string().min(4).max(12).optional(),
    DeviceLabel: z.string().min(1).max(60).optional(),
  })
  .transform((value, context) => {
    const enrollmentCode =
      value.enrollment_code ?? value.enrollmentCode ?? value.EnrollmentCode;
    const pairingWord = value.pairing_word ?? value.pairingWord ?? value.PairingWord;
    const deviceLabel = value.device_label ?? value.deviceLabel ?? value.DeviceLabel;

    if (!enrollmentCode) {
      context.addIssue({
        code: "custom",
        path: ["enrollment_code"],
        message: "Required",
      });
    }
    if (!pairingWord) {
      context.addIssue({
        code: "custom",
        path: ["pairing_word"],
        message: "Required",
      });
    }

    return { enrollmentCode, pairingWord, deviceLabel };
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
          const issues = result.error.issues.map((i) => ({
            field: i.path.join(".") || "(body)",
            message: i.message,
          }));
          const receivedFields =
            body && typeof body === "object" && !Array.isArray(body)
              ? Object.keys(body)
              : [];
          console.warn(
            "[beacon-enroll] 400 invalid payload",
            JSON.stringify({ issues, receivedFields }),
          );
          return json(
            {
              error: "Invalid payload",
              issues,
            },
            400,
          );
        }
        const parsed = result.data;

        if (!parsed.enrollmentCode || !parsed.pairingWord) {
          return json({ error: "Invalid payload" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const hash = await sha256Hex(parsed.enrollmentCode);

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
          pairing_word: parsed.pairingWord.toUpperCase(),
          device_label: parsed.deviceLabel ?? "Android phone",
        });
        if (error) return json({ error: "Could not register the request" }, 500);

        return json({ status: "pending" });
      },
    },
  },
});
