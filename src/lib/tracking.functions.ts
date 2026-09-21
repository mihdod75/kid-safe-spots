import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BeaconSummary = {
  id: string;
  name: string;
  label: string | null;
  status: "none" | "pending" | "approved" | "declined";
  watcherId: string | null;
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
  trip: {
    /** Metres covered since the beacon last started sending after a quiet spell. */
    distanceM: number;
    /** Timestamp of the first position in that stretch. */
    since: string;
    points: number;
  } | null;
};

/** A quiet spell of this long starts a new "trip". */
const WAKE_GAP_MS = 5 * 60 * 1000;
/** Ignore jitter hops below this — parked phones drift a few metres. */
const MIN_STEP_M = 15;

function metresBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}


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

    // Caller is verified by requireSupabaseAuth above; we only ever project
    // safe columns here (never secret_code).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: beacons, error }, { data: watchers }] = await Promise.all([
      supabaseAdmin
        .from("beacons")
        .select("id, name, battery_level, last_seen_at")
        .order("name"),
      supabase
        .from("beacon_watchers")
        .select("id, beacon_id, label, status")
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
        watcherId: watcher?.id ?? null,
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

    // Everyone, admins included, must be an approved follower to see a position.
    if (watcher?.status !== "approved") {
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


    // Retention keeps at most a day of history, so this is a bounded read.
    const { data: history } = await supabase
      .from("beacon_positions")
      .select("latitude, longitude, accuracy_m, recorded_at")
      .eq("beacon_id", data.beaconId)
      .order("recorded_at", { ascending: false })
      .limit(3000);

    const rows = (history ?? []).slice().reverse();
    const latest = rows.length ? rows[rows.length - 1]! : null;

    // Walk back from the newest point until a quiet spell is found: that is
    // where the current trip started.
    let start = rows.length ? rows.length - 1 : 0;
    while (start > 0) {
      const gap =
        new Date(rows[start]!.recorded_at).getTime() -
        new Date(rows[start - 1]!.recorded_at).getTime();
      if (gap >= WAKE_GAP_MS) break;
      start -= 1;
    }

    let distanceM = 0;
    for (let i = start + 1; i < rows.length; i += 1) {
      const step = metresBetween(rows[i - 1]!, rows[i]!);
      if (step >= MIN_STEP_M) distanceM += step;
    }

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
      trip:
        rows.length > start + 1
          ? {
              distanceM: Math.round(distanceM),
              since: rows[start]!.recorded_at,
              points: rows.length - start,
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
    // Followers have no update rights of their own in the database; the server
    // makes the change, and only ever on this person's own row (label only).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
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
