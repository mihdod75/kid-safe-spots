import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EnrollmentRow = {
  id: string;
  pairingWord: string;
  deviceLabel: string;
  status: string;
  requestedAt: string;
  expiresAt: string;
};

export type AdminBeaconRow = {
  id: string;
  name: string;
  secretCode: string;
  batteryLevel: number | null;
  lastSeenAt: string | null;
  followers: number;
  createdAt: string;
};

export type AccessRequestRow = {
  id: string;
  beaconId: string;
  beaconName: string;
  userEmail: string;
  note: string | null;
  status: string;
  requestedAt: string;
};

function fail(error: unknown, message: string): never {
  console.error(message, error);
  throw new Error(message);
}

async function adminClient(context: { supabase: any; userId: string }) {
  const { data: roleRow } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) throw new Error("Forbidden");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function randomSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const pendingAdminCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ enrollments: number; accessRequests: number }> => {
    let admin;
    try {
      admin = await adminClient(context);
    } catch {
      return { enrollments: 0, accessRequests: 0 };
    }

    const [enroll, watchers] = await Promise.all([
      admin
        .from("beacon_enrollments")
        .select("id", { head: true, count: "exact" })
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString()),
      admin
        .from("beacon_watchers")
        .select("id", { head: true, count: "exact" })
        .eq("status", "pending"),
    ]);

    return {
      enrollments: enroll.count ?? 0,
      accessRequests: watchers.count ?? 0,
    };
  });

export const listEnrollments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EnrollmentRow[]> => {
    const admin = await adminClient(context);
    const { data, error } = await admin
      .from("beacon_enrollments")
      .select("id, pairing_word, device_label, status, requested_at, expires_at")
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("requested_at", { ascending: false });
    if (error) fail(error, "Could not load the join requests.");
    return (data ?? []).map((e) => ({
      id: e.id,
      pairingWord: e.pairing_word,
      deviceLabel: e.device_label,
      status: e.status,
      requestedAt: e.requested_at,
      expiresAt: e.expires_at,
    }));
  });

export const approveEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { enrollmentId: string; name: string }) => {
    const name = data.name.trim();
    if (!name || name.length > 60) throw new Error("Please enter a name (max 60 characters).");
    return { enrollmentId: data.enrollmentId, name };
  })
  .handler(async ({ data, context }) => {
    const admin = await adminClient(context);

    const { data: enrollment } = await admin
      .from("beacon_enrollments")
      .select("id, status")
      .eq("id", data.enrollmentId)
      .maybeSingle();
    if (!enrollment || enrollment.status !== "pending")
      throw new Error("This request is no longer pending.");

    const { data: beacon, error } = await admin
      .from("beacons")
      .insert({
        name: data.name,
        secret_code: randomSecret(),
        approved_by: context.userId,
      })
      .select("id")
      .single();
    if (error) fail(error, "Could not create the beacon.");

    const updated = await admin
      .from("beacon_enrollments")
      .update({ status: "approved", beacon_id: beacon.id })
      .eq("id", data.enrollmentId);
    if (updated.error) fail(updated.error, "Could not approve the request.");

    return { ok: true };
  });

export const rejectEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { enrollmentId: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await adminClient(context);
    const { error } = await admin
      .from("beacon_enrollments")
      .update({ status: "rejected" })
      .eq("id", data.enrollmentId);
    if (error) fail(error, "Could not reject the request.");
    return { ok: true };
  });

export const adminListBeacons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminBeaconRow[]> => {
    const admin = await adminClient(context);
    const { data, error } = await admin
      .from("beacons")
      .select("id, name, secret_code, battery_level, last_seen_at, created_at")
      .order("created_at", { ascending: false });
    if (error) fail(error, "Could not load the beacons.");

    const { data: watchers } = await admin
      .from("beacon_watchers")
      .select("beacon_id")
      .eq("status", "approved");

    const counts = new Map<string, number>();
    for (const w of watchers ?? [])
      counts.set(w.beacon_id, (counts.get(w.beacon_id) ?? 0) + 1);

    return (data ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      secretCode: b.secret_code,
      batteryLevel: b.battery_level,
      lastSeenAt: b.last_seen_at,
      followers: counts.get(b.id) ?? 0,
      createdAt: b.created_at,
    }));
  });

export const adminRenameBeacon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { beaconId: string; name: string }) => {
    const name = data.name.trim();
    if (!name || name.length > 60) throw new Error("Please enter a name (max 60 characters).");
    return { beaconId: data.beaconId, name };
  })
  .handler(async ({ data, context }) => {
    const admin = await adminClient(context);
    const { error } = await admin
      .from("beacons")
      .update({ name: data.name })
      .eq("id", data.beaconId);
    if (error) fail(error, "Could not rename the beacon.");
    return { ok: true };
  });

export const adminRotateSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { beaconId: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await adminClient(context);
    const { error } = await admin
      .from("beacons")
      .update({ secret_code: randomSecret() })
      .eq("id", data.beaconId);
    if (error) fail(error, "Could not create a new secret.");
    return { ok: true };
  });

export const adminDeleteBeacon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { beaconId: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await adminClient(context);
    const { error } = await admin.from("beacons").delete().eq("id", data.beaconId);
    if (error) fail(error, "Could not delete the beacon.");
    return { ok: true };
  });

export const listAccessRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccessRequestRow[]> => {
    const admin = await adminClient(context);
    const { data, error } = await admin
      .from("beacon_watchers")
      .select("id, beacon_id, user_id, note, status, requested_at, beacons(name)")
      .eq("status", "pending")
      .order("requested_at", { ascending: false });
    if (error) fail(error, "Could not load the access requests.");

    const rows = data ?? [];
    const emails = new Map<string, string>();
    for (const row of rows) {
      if (emails.has(row.user_id)) continue;
      const { data: user } = await admin.auth.admin.getUserById(row.user_id);
      emails.set(row.user_id, user?.user?.email ?? "unknown");
    }

    return rows.map((r: any) => ({
      id: r.id,
      beaconId: r.beacon_id,
      beaconName: r.beacons?.name ?? "Beacon",
      userEmail: emails.get(r.user_id) ?? "unknown",
      note: r.note,
      status: r.status,
      requestedAt: r.requested_at,
    }));
  });

export const decideAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { watcherId: string; approve: boolean }) => data)
  .handler(async ({ data, context }) => {
    const admin = await adminClient(context);
    const { error } = await admin
      .from("beacon_watchers")
      .update({
        status: data.approve ? "approved" : "declined",
        decided_at: new Date().toISOString(),
        decided_by: context.userId,
      })
      .eq("id", data.watcherId);
    if (error) fail(error, "Could not update the request.");
    return { ok: true };
  });

export const revokeAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { watcherId: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await adminClient(context);
    const { error } = await admin.from("beacon_watchers").delete().eq("id", data.watcherId);
    if (error) fail(error, "Could not revoke access.");
    return { ok: true };
  });

export const listBeaconFollowers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { beaconId: string }) => data)
  .handler(async ({ data, context }) => {
    const admin = await adminClient(context);
    const { data: rows } = await admin
      .from("beacon_watchers")
      .select("id, user_id, status")
      .eq("beacon_id", data.beaconId)
      .eq("status", "approved");

    const out: { id: string; email: string }[] = [];
    for (const row of rows ?? []) {
      const { data: user } = await admin.auth.admin.getUserById(row.user_id);
      out.push({ id: row.id, email: user?.user?.email ?? "unknown" });
    }
    return out;
  });
