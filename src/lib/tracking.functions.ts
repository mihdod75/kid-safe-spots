import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BeaconSummary = {
  id: string;
  name: string;
  label: string | null;
  status: "none" | "pending" | "approved" | "declined";
};

export type BeaconSnapshot = {
  beacon: {
    id: string;
    name: string;
    label: string | null;
    batteryLevel: number | null;
    lastSeenAt: string | null;
  };
  position: {
    latitude: number;
    longitude: number;
    accuracyM: number | null;
    recordedAt: string;
  } | null;
};

// Keep database details server-side; the browser only ever sees a safe message.
export function failSafely(error: unknown, userMessage: string): never {
  console.error(userMessage, error);
  throw new Error(userMessage);
}

export const listBeacons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BeaconSummary[]> => {
    const { supabase, userId } = context;

    await supabase.from("profiles").upsert({ id: userId }, { onConflict: "id" });

    const [{ data: beacons, error }, { data: watchers }] = await Promise.all([
      supabase
        .from("beacons")
        .select("id, name, battery_level, last_seen_at")
        .order("name"),
      supabase
        .from("beacon_watchers")
        .select("beacon_id, label, status")
        .eq("user_id", userId),
    ]);
    if (error) failSafely(error, "Could not load the beacon list.");


    const byBeacon = new Map(
      (watchers ?? []).map((w) => [w.beacon_id, w] as const),
    );

    return (beacons ?? []).map((b) => {
      const watcher = byBeacon.get(b.id);
      return {
        id: b.id,
        name: b.name,
        label: watcher?.label ?? null,
        status: (watcher?.status as BeaconSummary["status"]) ?? "none",
      };
    });
  });

export const getBeacon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { beaconId: string }) => {
    if (!data?.beaconId) throw new Error("Missing beacon.");
    return { beaconId: data.beaconId };
  })
  .handler(async ({ data, context }): Promise<BeaconSnapshot | null> => {
    const { supabase, userId } = context;

    const { data: watcher } = await supabase
      .from("beacon_watchers")
      .select("label, status")
      .eq("beacon_id", data.beaconId)
      .eq("user_id", userId)
      .maybeSingle();

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = Boolean(roleRow);

    if (watcher?.status !== "approved" && !isAdmin) {
      throw new Error("You do not have access to this beacon.");
    }

    const { data: beacon, error } = await supabase
      .from("beacons")
      .select("id, name, battery_level, last_seen_at")
      .eq("id", data.beaconId)
      .maybeSingle();
    if (error) failSafely(error, "Could not load this beacon.");
    // The beacon was removed (or is no longer visible) — let the page recover.
    if (!beacon) return null;


    const { data: latest } = await supabase
      .from("beacon_positions")
      .select("latitude, longitude, accuracy_m, recorded_at")
      .eq("beacon_id", data.beaconId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      beacon: {
        id: beacon.id,
        name: beacon.name,
        label: watcher?.label ?? null,
        batteryLevel: beacon.battery_level,
        lastSeenAt: beacon.last_seen_at,
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

export const requestAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { beaconId: string; note?: string }) => {
    if (!data?.beaconId) throw new Error("Missing beacon.");
    const note = (data.note ?? "").trim().slice(0, 200);
    return { beaconId: data.beaconId, note: note || null };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("beacon_watchers").insert({
      beacon_id: data.beaconId,
      user_id: context.userId,
      status: "pending",
      note: data.note,
    });
    if (error) failSafely(error, "Could not send the request.");
    return { ok: true };
  });

export const stopFollowing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { beaconId: string }) => {
    if (!data?.beaconId) throw new Error("Missing beacon.");
    return { beaconId: data.beaconId };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("beacon_watchers")
      .delete()
      .eq("beacon_id", data.beaconId)
      .eq("user_id", context.userId);
    if (error) failSafely(error, "Could not remove this beacon.");
    return { ok: true };
  });

export const relabelBeacon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { beaconId: string; label: string }) => {
    const label = data.label.trim();
    if (!label || label.length > 60)
      throw new Error("Please enter a name (max 60 characters).");
    return { beaconId: data.beaconId, label };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("beacon_watchers")
      .update({ label: data.label })
      .eq("beacon_id", data.beaconId)
      .eq("user_id", context.userId);
    if (error) failSafely(error, "Could not save the name.");
    return { ok: true };
  });

export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: Boolean(data) };

  });
