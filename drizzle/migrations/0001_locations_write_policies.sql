-- Explicit ownership-scoped write policies for locations
GRANT INSERT, UPDATE, DELETE ON public.locations TO authenticated;

CREATE POLICY "Parents insert own device locations"
ON public.locations FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.devices d
  WHERE d.id = locations.device_id AND d.owner_id = auth.uid()
));

CREATE POLICY "Parents update own device locations"
ON public.locations FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.devices d
  WHERE d.id = locations.device_id AND d.owner_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.devices d
  WHERE d.id = locations.device_id AND d.owner_id = auth.uid()
));

CREATE POLICY "Parents delete own device locations"
ON public.locations FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.devices d
  WHERE d.id = locations.device_id AND d.owner_id = auth.uid()
));
