import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { failSafely } from "@/lib/tracking.functions";

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) => {
    if (!data?.endpoint || !/^https:\/\//.test(data.endpoint) || data.endpoint.length > 2000)
      throw new Error("Invalid subscription.");
    if (!data.p256dh || !data.auth) throw new Error("Invalid subscription.");
    return {
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
      userAgent: (data.userAgent ?? "").slice(0, 200) || null,
    };
  })
  .handler(async ({ data, context }) => {
    // The table has no INSERT grant for signed-in users; the verified caller's
    // own row is written server-side instead.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) failSafely(error, "Could not turn on notifications.");
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { endpoint: string }) => {
    if (!data?.endpoint) throw new Error("Invalid subscription.");
    return { endpoint: data.endpoint };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    if (error) failSafely(error, "Could not turn off notifications.");
    return { ok: true };
  });

export const getWakeAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { beaconId: string }) => {
    if (!data?.beaconId) throw new Error("Missing beacon.");
    return { beaconId: data.beaconId };
  })
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("beacon_watchers")
      .select("notify_wake, notify_gap_minutes")
      .eq("beacon_id", data.beaconId)
      .eq("user_id", context.userId)
      .maybeSingle();

    return {
      notifyWake: row?.notify_wake ?? false,
      gapMinutes: row?.notify_gap_minutes ?? 5,
    };
  });

export const setWakeAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { beaconId: string; notifyWake: boolean; gapMinutes: number }) => {
    if (!data?.beaconId) throw new Error("Missing beacon.");
    if (![5, 15, 30, 60].includes(data.gapMinutes)) throw new Error("Invalid quiet period.");
    return {
      beaconId: data.beaconId,
      notifyWake: Boolean(data.notifyWake),
      gapMinutes: data.gapMinutes,
    };
  })
  .handler(async ({ data, context }) => {
    // Followers hold no update rights on the table; the server writes only this
    // person's own row, and only these two preference columns.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("beacon_watchers")
      .update({ notify_wake: data.notifyWake, notify_gap_minutes: data.gapMinutes })
      .eq("beacon_id", data.beaconId)
      .eq("user_id", context.userId);
    if (error) failSafely(error, "Could not save the notification setting.");
    return { ok: true };
  });
