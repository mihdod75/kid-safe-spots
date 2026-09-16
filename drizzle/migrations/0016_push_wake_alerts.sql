ALTER TABLE public.beacon_watchers
  ADD COLUMN IF NOT EXISTS notify_wake boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_gap_minutes integer NOT NULL DEFAULT 5;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON public.push_subscriptions(user_id);

GRANT SELECT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users read own push subscriptions"
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users delete own push subscriptions"
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);