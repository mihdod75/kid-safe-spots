import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { toast } from "sonner";

import { getTracker, renameChild, regeneratePairingKey } from "@/lib/tracking.functions";
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
        content: "See your child's live position, battery level and last signal on one private map.",
      },
      { property: "og:title", content: "Live tracker — Beacon Kid" },
      {
        property: "og:description",
        content: "See your child's live position, battery level and last signal on one private map.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TrackerPage,
});

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function TrackerPage() {
  const fetchTracker = useServerFn(getTracker);
  const rename = useServerFn(renameChild);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const mapRef = useRef<{ recenter: () => void } | null>(null);
  const [, setTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ["tracker"],
    queryFn: () => fetchTracker(),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function saveName() {
    if (!data) return;
    try {
      await rename({ data: { deviceId: data.device.id, childName: nameDraft } });
      setEditing(false);
      await refetch();
      toast.success("Name updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the name");
    }
  }

  const stale =
    data?.position && Date.now() - new Date(data.position.recordedAt).getTime() > 10 * 60 * 1000;
  const lowBattery = (data?.device.batteryLevel ?? 100) <= 20;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
          <span className="text-sm font-semibold tracking-tight">Beacon Kid</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          Sign out
        </Button>
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
                  label={data.device.childName}
                />
              </Suspense>
            </ClientOnly>
          ) : (
            <MapPlaceholder
              text={
                isPending
                  ? "Loading…"
                  : "Waiting for the first signal from the beacon app."
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
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Tracking</p>
                {editing ? (
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      className="h-9"
                      aria-label="Child name"
                    />
                    <Button size="sm" onClick={saveName}>
                      Save
                    </Button>
                  </div>
                ) : (
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {data?.device.childName ?? "…"}
                  </h1>
                )}
              </div>
              {!editing && data && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNameDraft(data.device.childName);
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
                  {data?.device.batteryLevel != null ? `${data.device.batteryLevel}%` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Last seen</dt>
                <dd
                  className={`mt-1 text-xl font-semibold ${
                    stale ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {timeAgo(data?.device.lastSeenAt ?? data?.position?.recordedAt ?? null)}
                </dd>
              </div>
            </dl>

            {stale && (
              <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                No fresh signal for over 10 minutes.
              </p>
            )}
            {isError && (
              <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Could not load the latest position.
              </p>
            )}

            <Button
              className="mt-5 w-full"
              variant="secondary"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Refreshing…" : "Refresh now"}
            </Button>
          </div>

          {data && (
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm font-medium">Pair the Android beacon</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.device.isDemo
                  ? "Showing a simulated position until the phone starts sending its own."
                  : "This phone is sending real positions."}
              </p>
              <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
                Pairing key
              </p>
              <code className="mt-1 block break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">
                {data.device.pairingKey}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  navigator.clipboard.writeText(data.device.pairingKey);
                  toast.success("Pairing key copied");
                }}
              >
                Copy key
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">
                The app sends the key plus latitude, longitude and battery to{" "}
                <code className="font-mono">/api/public/beacon</code>.
              </p>
            </div>
          )}
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
