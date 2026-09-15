import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { toast } from "sonner";

import {
  listBeacons,
  getBeacon,
  requestAccess,
  stopFollowing,
  relabelBeacon,
  amIAdmin,
} from "@/lib/tracking.functions";
import { decideAccessRequest } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ChildMap = lazy(() => import("@/components/ChildMap"));

export const Route = createFileRoute("/_authenticated/tracker")({
  head: () => ({
    meta: [
      { title: "Live tracker — Beacon Kid" },
      {
        name: "description",
        content: "Follow an approved beacon live: position, battery level and last signal on one private map.",
      },
      { property: "og:title", content: "Live tracker — Beacon Kid" },
      {
        property: "og:description",
        content: "Follow an approved beacon live: position, battery level and last signal on one private map.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TrackerPage,
});

// Timestamps arrive as "2026-09-14 18:19:31+00", which some browsers parse as a
// local time (shifting it by the time-zone offset). Normalise to strict ISO.
function parseTimestamp(value: string) {
  let s = value.trim().replace(" ", "T");
  const offset = /([+-]\d{2})(?::?(\d{2}))?$/.exec(s);
  if (offset) {
    s = s.slice(0, offset.index) + offset[1] + ":" + (offset[2] ?? "00");
  } else if (!/[zZ]$/.test(s)) {
    s += "Z";
  }
  return new Date(s);
}

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const parsed = parseTimestamp(iso);
  if (Number.isNaN(parsed.getTime())) return "unknown";
  const seconds = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function TrackerPage() {
  const fetchList = useServerFn(listBeacons);
  const fetchBeacon = useServerFn(getBeacon);
  const askAccess = useServerFn(requestAccess);
  const unfollow = useServerFn(stopFollowing);
  const rename = useServerFn(relabelBeacon);
  const checkAdmin = useServerFn(amIAdmin);
  const decide = useServerFn(decideAccessRequest);

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const mapRef = useRef<{ recenter: () => void } | null>(null);
  const [, setTick] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [live, setLive] = useState(false);

  const withRefresh = async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Error && /unauthor/i.test(err.message)) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed.session) return await fn();
      }
      throw err;
    }
  };

  const listQuery = useQuery({
    queryKey: ["beacons"],
    queryFn: () => withRefresh(() => fetchList()),
    retry: false,
    // While a request is waiting for approval, check often so the beacon
    // appears as soon as an admin approves it — no manual refresh needed.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((b) => b.status === "pending") ? 10_000 : false,
    refetchOnWindowFocus: true,
  });


  const adminQuery = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => withRefresh(() => checkAdmin()),
    retry: false,
  });

  useEffect(() => {
    if (listQuery.error instanceof Error && /unauthor/i.test(listQuery.error.message)) {
      navigate({ to: "/auth", replace: true });
    }
  }, [listQuery.error, navigate]);

  const beacons = listQuery.data ?? [];
  const approved = useMemo(() => beacons.filter((b) => b.status === "approved"), [beacons]);
  const others = useMemo(() => beacons.filter((b) => b.status !== "approved"), [beacons]);

  useEffect(() => {
    if (!selectedId && approved[0]) setSelectedId(approved[0].id);
    if (selectedId && !approved.some((b) => b.id === selectedId)) {
      setSelectedId(approved[0]?.id ?? null);
    }
  }, [approved, selectedId]);

  const snapshot = useQuery({
    queryKey: ["beacon", selectedId],
    enabled: !!selectedId,
    queryFn: () => withRefresh(() => fetchBeacon({ data: { beaconId: selectedId! } })),
    retry: false,
    refetchInterval: 60_000,
  });

  const data = snapshot.data ?? null;

  // The selected beacon is gone (deleted, or access removed) — drop it,
  // clear its cached snapshot and refresh the list.
  useEffect(() => {
    const lostAccess =
      snapshot.error instanceof Error && /do not have access/i.test(snapshot.error.message);
    const gone = (snapshot.isSuccess && snapshot.data === null) || lostAccess;

    if (gone && selectedId) {
      queryClient.removeQueries({ queryKey: ["beacon", selectedId] });
      setSelectedId(null);
      setLive(false);
      listQuery.refetch();
    }
  }, [snapshot.isSuccess, snapshot.isError, snapshot.data, selectedId, listQuery, queryClient]);


  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const channel = supabase
      .channel(`beacon-${selectedId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "beacon_positions",
          filter: `beacon_id=eq.${selectedId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["beacon", selectedId] });
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      setLive(false);
      supabase.removeChannel(channel);
    };
  }, [selectedId, queryClient]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function saveName() {
    if (!selectedId) return;
    try {
      await rename({ data: { beaconId: selectedId, label: nameDraft } });
      setEditing(false);
      await Promise.all([listQuery.refetch(), snapshot.refetch()]);
      toast.success("Name updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the name");
    }
  }

  async function handleRequest(beaconId: string) {
    try {
      await askAccess({ data: { beaconId } });
      await listQuery.refetch();
      toast.success("Request sent — an admin will review it");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the request");
    }
  }

  async function handleDecide(watcherId: string, approve: boolean, beaconId: string) {
    try {
      await decide({ data: { watcherId, approve } });
      await listQuery.refetch();
      if (approve) setSelectedId(beaconId);
      toast.success(approve ? "Access approved" : "Request declined");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the request");
    }
  }

  async function handleStop(beaconId: string) {
    if (!window.confirm("Stop following this beacon?")) return;
    try {
      await unfollow({ data: { beaconId } });
      await listQuery.refetch();
      toast.success("Removed from your list");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove it");
    }
  }

  const displayName = data?.beacon.label ?? data?.beacon.name ?? "…";
  const stale =
    data?.position &&
    Date.now() - parseTimestamp(data.position.recordedAt).getTime() > 10 * 60 * 1000;
  const lowBattery = (data?.beacon.batteryLevel ?? 100) <= 20;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
          <span className="text-sm font-semibold tracking-tight">Beacon Kid</span>
        </div>
        <div className="flex items-center gap-1">
          {adminQuery.data?.isAdmin && (
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin">Admin</Link>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6 lg:flex-row">
        <section className="relative h-[60vh] min-h-[320px] flex-1 overflow-hidden rounded-xl border border-border bg-muted lg:h-auto lg:min-h-[calc(100vh-7rem)]">
          {data?.position ? (
            <ClientOnly fallback={<MapPlaceholder text="Loading the map…" />}>
              <Suspense fallback={<MapPlaceholder text="Loading the map…" />}>
                <ChildMap
                  ref={mapRef}
                  latitude={data.position.latitude}
                  longitude={data.position.longitude}
                  label={displayName}
                />
              </Suspense>
            </ClientOnly>
          ) : (
            <MapPlaceholder
              text={
                listQuery.isPending
                  ? "Loading…"
                  : approved.length === 0
                    ? "Pick a beacon below and ask an admin for access."
                    : "Waiting for the first signal from this beacon."
              }
            />
          )}
          {data?.position && (
            <Button
              variant="secondary"
              size="sm"
              className="absolute bottom-4 left-4 shadow-sm"
              onClick={() => mapRef.current?.recenter()}
              aria-label="Re-center map on last seen location"
            >
              Re-center
            </Button>
          )}
        </section>

        <aside className="w-full space-y-4 lg:max-w-sm">
          {approved.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {approved.map((b) => (
                <Button
                  key={b.id}
                  size="sm"
                  variant={b.id === selectedId ? "default" : "outline"}
                  onClick={() => setSelectedId(b.id)}
                >
                  {b.label ?? b.name}
                </Button>
              ))}
            </div>
          )}

          {selectedId && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Tracking</p>
                    {live && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
                        Live
                      </span>
                    )}
                  </div>
                  {editing ? (
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        className="h-9"
                        aria-label="Beacon name"
                      />
                      <Button size="sm" onClick={saveName}>
                        Save
                      </Button>
                    </div>
                  ) : (
                    <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
                  )}
                </div>
                {!editing && data && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setNameDraft(data.beacon.label ?? data.beacon.name);
                      setEditing(true);
                    }}
                  >
                    Edit
                  </Button>
                )}
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Battery</dt>
                  <dd
                    className={`mt-1 text-xl font-semibold ${
                      lowBattery ? "text-destructive" : "text-foreground"
                    }`}
                  >
                    {data?.beacon.batteryLevel != null ? `${data.beacon.batteryLevel}%` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Last seen</dt>
                  <dd
                    className={`mt-1 text-xl font-semibold ${
                      stale ? "text-destructive" : "text-foreground"
                    }`}
                  >
                    {timeAgo(data?.beacon.lastSeenAt ?? data?.position?.recordedAt ?? null)}
                  </dd>
                </div>
              </dl>

              {stale && (
                <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  No fresh signal for over 10 minutes.
                </p>
              )}

              <div className="mt-5 flex gap-2">
                <Button
                  className="flex-1"
                  variant="secondary"
                  onClick={() => snapshot.refetch()}
                  disabled={snapshot.isFetching}
                >
                  {snapshot.isFetching ? "Refreshing…" : "Refresh now"}
                </Button>
                <Button variant="ghost" onClick={() => handleStop(selectedId)}>
                  Stop following
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm font-medium">Beacons</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask an admin for access to a beacon you want to follow.
            </p>
            <ul className="mt-4 space-y-2">
              {others.length === 0 && (
                <li className="text-sm text-muted-foreground">No other beacons registered.</li>
              )}
              {others.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <span className="text-sm">{b.name}</span>
                  {b.status !== "approved" && b.status !== "none" && adminQuery.data?.isAdmin && b.watcherId ? (
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {b.status === "pending" ? "Waiting for approval" : "Declined"}
                      </span>
                      <Button size="sm" onClick={() => handleDecide(b.watcherId!, true, b.id)}>
                        Approve
                      </Button>
                      {b.status === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDecide(b.watcherId!, false, b.id)}
                        >
                          Decline
                        </Button>
                      )}
                    </span>
                  ) : b.status === "pending" ? (
                    <span className="text-xs text-muted-foreground">Waiting for approval</span>
                  ) : b.status === "declined" ? (
                    <span className="text-xs text-destructive">Declined</span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => handleRequest(b.id)}>
                      Request access
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}

function MapPlaceholder({ text }: { text: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
