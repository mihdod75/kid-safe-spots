import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TrackerSnapshot = {
  device: {
    id: string;
    childName: string;
    pairingKey: string;
    batteryLevel: number | null;
    lastSeenAt: string | null;
    isDemo: boolean;
  };
  position: {
    latitude: number;
    longitude: number;
    accuracyM: number | null;
    recordedAt: string;
  } | null;
};

const DEMO_START = { lat: 44.4396, lng: 26.0963 }; // Bucharest

// Keep database details server-side; the browser only ever sees a safe message.
function failSafely(error: unknown, userMessage: string): never {
  console.error(userMessage, error);
  throw new Error(userMessage);
}

export const getTracker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrackerSnapshot> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabase.from("profiles").upsert({ id: userId }, { onConflict: "id" });

    let { data: device } = await supabase
      .from("devices")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!device) {
      const inserted = await supabase
        .from("devices")
        .insert({ owner_id: userId, child_name: "Demo child", is_demo: true })
        .select("*")
        .single();
      if (inserted.error) failSafely(inserted.error, "Could not set up the tracker.");
      device = inserted.data;
    }

    let { data: latest } = await supabase
      .from("locations")
      .select("*")
      .eq("device_id", device.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // While no real beacon is paired, keep the demo device gently moving so the
    // map, battery and last-seen all behave like the real thing.
    if (device.is_demo) {
      const stale =
        !latest || Date.now() - new Date(latest.recorded_at).getTime() > 15_000;
      if (stale) {
        const base = latest
          ? { lat: latest.latitude, lng: latest.longitude }
          : DEMO_START;
        const nextLat = base.lat + (Math.random() - 0.5) * 0.0009;
        const nextLng = base.lng + (Math.random() - 0.5) * 0.0012;
        const battery = Math.max(
          15,
          (device.battery_level ?? 92) - (Math.random() < 0.3 ? 1 : 0),
        );
        const nowIso = new Date().toISOString();

        const created = await supabaseAdmin
          .from("locations")
          .insert({
            device_id: device.id,
            latitude: nextLat,
            longitude: nextLng,
            accuracy_m: 8 + Math.random() * 22,
            battery_level: battery,
            recorded_at: nowIso,
          })
          .select("*")
          .single();
        if (created.error) throw created.error;
        latest = created.data;

        const updated = await supabase
          .from("devices")
          .update({ battery_level: battery, last_seen_at: nowIso })
          .eq("id", device.id)
          .select("*")
          .single();
        if (!updated.error) device = updated.data;
      }
    }

    return {
      device: {
        id: device.id,
        childName: device.child_name,
        pairingKey: device.pairing_key,
        batteryLevel: device.battery_level,
        lastSeenAt: device.last_seen_at,
        isDemo: device.is_demo,
      },
      position: latest
        ? {
            latitude: latest.latitude,
            longitude: latest.longitude,
            accuracyM: latest.accuracy_m,
            recordedAt: latest.recorded_at,
          }
        : null,
    };
  });

export const renameChild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { deviceId: string; childName: string }) => {
    const name = data.childName.trim();
    if (!name || name.length > 60) throw new Error("Please enter a name (max 60 characters).");
    return { deviceId: data.deviceId, childName: name };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("devices")
      .update({ child_name: data.childName })
      .eq("id", data.deviceId)
      .eq("owner_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const regeneratePairingKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { deviceId: string }) => {
    if (!data?.deviceId) throw new Error("Missing device.");
    return { deviceId: data.deviceId };
  })
  .handler(async ({ data, context }) => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

    const { data: updated, error } = await context.supabase
      .from("devices")
      .update({ pairing_key: key })
      .eq("id", data.deviceId)
      .eq("owner_id", context.userId)
      .select("pairing_key")
      .single();
    if (error) throw error;
    return { pairingKey: updated.pairing_key };
  });
