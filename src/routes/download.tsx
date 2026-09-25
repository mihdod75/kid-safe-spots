import { createFileRoute, Link } from "@tanstack/react-router";
import beaconApp from "@/assets/beacon-kid-app.apk.asset.json";
import parentApp from "@/assets/parent-tracker-app.apk.asset.json";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download the apps — Beacon Kid" },
      {
        name: "description",
        content:
          "Download the Beacon Kid Android apps: the beacon app for the child's phone and the tracker app for the parent's phone.",
      },
      { property: "og:title", content: "Download the apps — Beacon Kid" },
      {
        property: "og:description",
        content:
          "Download the Beacon Kid Android apps: the beacon app for the child's phone and the tracker app for the parent's phone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DownloadPage,
});

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DownloadPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
          Beacon Kid
        </Link>
        <Link
          to="/tracker"
          className="rounded-md border border-input px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          Open tracker
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24 pt-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Download the apps</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Both apps run on Android. After downloading, open the file and allow installing from
          your browser if Android asks.
        </p>

        <div className="mt-10 grid gap-4">
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold tracking-tight">Beacon app</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Install this on the <strong>child's phone</strong>. It sends the position, battery
              level and last signal to this site. Ask an admin on the tracker page to approve the
              phone and give you its secret code.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <a
                href={beaconApp.url}
                download
                className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Download beacon app ({formatSize(beaconApp.size)})
              </a>
              <a
                href="https://github.com/mihdod75/LocationBeacon"
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                View source on GitHub ↗
              </a>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold tracking-tight">Parent tracker app</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Install this on the <strong>parent's phone</strong> if you prefer an app over the
              website. It uses the same account and shows the same live map.
            </p>
            <a
              href={parentApp.url}
              download
              className="mt-5 inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Download parent app ({formatSize(parentApp.size)})
            </a>
          </section>
        </div>

        <section className="mt-10 border-t border-border pt-8">
          <h2 className="text-lg font-semibold tracking-tight">This website</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            View the source code for the Beacon Kid tracking website.
          </p>
          <a
            href="https://github.com/mihdod75/kid-safe-spots"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            View website source on GitHub ↗
          </a>
        </section>
      </main>
    </div>
  );
}
