import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  listEnrollments,
  approveEnrollment,
  rejectEnrollment,
  adminListBeacons,
  adminRenameBeacon,
  adminRotateSecret,
  adminDeleteBeacon,
  listAccessRequests,
  decideAccessRequest,
} from "@/lib/admin.functions";
import { amIAdmin } from "@/lib/tracking.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Beacon Kid" },
      {
        name: "description",
        content: "Approve phones that ask to join, manage beacons and decide who may follow them.",
      },
      { property: "og:title", content: "Admin — Beacon Kid" },
      {
        property: "og:description",
        content: "Approve phones that ask to join, manage beacons and decide who may follow them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const s = iso.trim().replace(" ", "T");
  const parsed = new Date(/[zZ]|[+-]\d{2}/.test(s) ? s : `${s}Z`);
  if (Number.isNaN(parsed.getTime())) return "unknown";
  const seconds = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function AdminPage() {
  const navigate = useNavigate();
  const checkAdmin = useServerFn(amIAdmin);
  const fetchEnrollments = useServerFn(listEnrollments);
  const approve = useServerFn(approveEnrollment);
  const reject = useServerFn(rejectEnrollment);
  const fetchBeacons = useServerFn(adminListBeacons);
  const renameBeacon = useServerFn(adminRenameBeacon);
  const rotate = useServerFn(adminRotateSecret);
  const remove = useServerFn(adminDeleteBeacon);
  const fetchRequests = useServerFn(listAccessRequests);
  const decide = useServerFn(decideAccessRequest);

  const [names, setNames] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const adminQuery = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => checkAdmin(),
    retry: false,
  });
  const isAdmin = adminQuery.data?.isAdmin === true;

  const enrollmentsQuery = useQuery({
    queryKey: ["enrollments"],
    queryFn: () => fetchEnrollments(),
    enabled: isAdmin,
    refetchInterval: 20_000,
    retry: false,
  });

  const beaconsQuery = useQuery({
    queryKey: ["admin-beacons"],
    queryFn: () => fetchBeacons(),
    enabled: isAdmin,
    retry: false,
  });

  const requestsQuery = useQuery({
    queryKey: ["access-requests"],
    queryFn: () => fetchRequests(),
    enabled: isAdmin,
    refetchInterval: 20_000,
    retry: false,
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      await Promise.all([
        enrollmentsQuery.refetch(),
        beaconsQuery.refetch(),
        requestsQuery.refetch(),
      ]);
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
          <span className="text-sm font-semibold tracking-tight">Beacon Kid admin</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/tracker">Tracker</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4 sm:p-6">
        {adminQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !isAdmin ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            This area is not available for your account.
          </p>
        ) : (
          <>
            <section className="rounded-xl border border-border bg-card p-5">
              <h1 className="text-lg font-semibold tracking-tight">Phones asking to join</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Check the code shown on the phone screen before approving.
              </p>
              <ul className="mt-4 space-y-3">
                {(enrollmentsQuery.data ?? []).length === 0 && (
                  <li className="text-sm text-muted-foreground">No requests waiting.</li>
                )}
                {(enrollmentsQuery.data ?? []).map((e) => (
                  <li key={e.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-mono text-lg font-semibold tracking-widest">
                          {e.pairingWord}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {e.deviceLabel} · {timeAgo(e.requestedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Input
                        className="h-9 max-w-[200px]"
                        placeholder="Name this beacon"
                        value={names[e.id] ?? ""}
                        onChange={(ev) =>
                          setNames((n) => ({ ...n, [e.id]: ev.target.value }))
                        }
                        aria-label="Beacon name"
                      />
                      <Button
                        size="sm"
                        disabled={!(names[e.id] ?? "").trim()}
                        onClick={() => {
                          const name = (names[e.id] ?? "").trim();
                          if (!name) {
                            toast.error("Please name this beacon first.");
                            return;
                          }
                          run(
                            () => approve({ data: { enrollmentId: e.id, name } }),
                            "Beacon approved",
                          );
                        }}
                      >
                        Approve
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          run(() => reject({ data: { enrollmentId: e.id } }), "Request rejected")
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold tracking-tight">People asking to follow</h2>
              <ul className="mt-4 space-y-2">
                {(requestsQuery.data ?? []).length === 0 && (
                  <li className="text-sm text-muted-foreground">No requests waiting.</li>
                )}
                {(requestsQuery.data ?? []).map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <div>
                      <p className="text-sm">{r.userEmail}</p>
                      <p className="text-xs text-muted-foreground">
                        wants {r.beaconName} · {timeAgo(r.requestedAt)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          run(
                            () => decide({ data: { watcherId: r.id, approve: true } }),
                            "Access granted",
                          )
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          run(
                            () => decide({ data: { watcherId: r.id, approve: false } }),
                            "Request declined",
                          )
                        }
                      >
                        Decline
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold tracking-tight">Beacons</h2>
              <ul className="mt-4 space-y-3">
                {(beaconsQuery.data ?? []).length === 0 && (
                  <li className="text-sm text-muted-foreground">No beacons yet.</li>
                )}
                {(beaconsQuery.data ?? []).map((b) => (
                  <li key={b.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.batteryLevel != null ? `${b.batteryLevel}% · ` : ""}
                          last seen {timeAgo(b.lastSeenAt)} · {b.followers} follower
                          {b.followers === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    <code className="mt-2 block break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">
                      {revealed[b.id] ? b.secretCode : "•".repeat(32)}
                    </code>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRevealed((r) => ({ ...r, [b.id]: !r[b.id] }))}
                      >
                        {revealed[b.id] ? "Hide secret" : "Show secret"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(b.secretCode);
                          toast.success("Secret copied");
                        }}
                      >
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const name = window.prompt("New name", b.name);
                          if (!name) return;
                          run(
                            () => renameBeacon({ data: { beaconId: b.id, name } }),
                            "Beacon renamed",
                          );
                        }}
                      >
                        Rename
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (
                            !window.confirm(
                              "Issue a new secret? The phone will stop sending until it enrols again.",
                            )
                          )
                            return;
                          run(() => rotate({ data: { beaconId: b.id } }), "New secret issued");
                        }}
                      >
                        New secret
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Delete "${b.name}" and all its history? ${b.followers} ${
                                b.followers === 1 ? "person" : "people"
                              } following it will lose access immediately.`,
                            )
                          )
                            return;
                          run(() => remove({ data: { beaconId: b.id } }), "Beacon deleted");
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
