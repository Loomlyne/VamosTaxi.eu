-- Comment 11. Two nullable amounts on the existing distance_rates book.
-- One way uses base_fare_rappen (start) + per_km_rappen + selected extras.
-- Airport pickup uses airport_start_rappen (a different start) and the same per_km.
-- City to city uses the one-way start + per_km, plus exactly one city_price_rappen.
-- NULL until staff set them. Do not seed CHF. Do not UPDATE rate_versions.
-- quote_rate_book already emits to_jsonb(distance_rates), so these columns
-- flow into the quote document without replacing that function.

alter table public.distance_rates
  add column if not exists airport_start_rappen rappen,
  add column if not exists city_price_rappen rappen;

comment on column public.distance_rates.airport_start_rappen is
  'Airport pickup start in rappen. Same per_km as base_fare. NULL until staff set it.';

comment on column public.distance_rates.city_price_rappen is
  'One city-to-city add in rappen, on top of start + km. Not a fee per city. NULL until staff set it.';
