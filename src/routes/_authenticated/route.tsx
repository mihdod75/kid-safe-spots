import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession() reads the stored session and refreshes it when expired.
    // Only send the visitor to sign-in when there is genuinely no session,
    // never because a single network call hiccuped.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) throw redirect({ to: "/auth" });

    const { data, error } = await supabase.auth.getUser();
    if (data?.user) return { user: data.user };

    // Network/transient failure: keep the stored session instead of signing out.
    const message = (error as { message?: string } | null)?.message ?? "";
    const transient =
      !!error &&
      (error.name === "AuthRetryableFetchError" ||
        /fetch|network|timeout|load failed/i.test(message));
    if (transient) return { user: sessionData.session.user };

    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
