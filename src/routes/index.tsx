import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Beacon Kid — know where your child is" },
      {
        name: "description",
        content:
          "A private map showing your child's live position, phone battery and last signal, sent by the Beacon Kid Android app.",
      },
      { property: "og:title", content: "Beacon Kid — know where your child is" },
      {
        property: "og:description",
        content:
          "A private map showing your child's live position, phone battery and last signal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
          Beacon Kid
        </span>
        <Link
          to={signedIn ? "/tracker" : "/auth"}
          className="rounded-md border border-input px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          {signedIn ? "Open tracker" : "Parent sign in"}
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24 pt-16 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Know where your child is, without the guesswork
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
          The Beacon Kid app on your child's Android phone sends its position here. You see it on a
          live map, together with the phone's battery and the time of the last signal.
        </p>
        <Link
          to={signedIn ? "/tracker" : "/auth"}
          className="mt-8 inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {signedIn ? "Open the map" : "Get started"}
        </Link>

        <ul className="mt-16 grid gap-4 text-left sm:grid-cols-3">
          {[
            ["Live map", "The latest position on a Google map, refreshed automatically."],
            ["Battery & last seen", "Know if the phone is running low or has gone quiet."],
            ["Private by default", "Positions are visible only to the parent account they belong to."],
          ].map(([title, body]) => (
            <li key={title} className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
