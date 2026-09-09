-- 04.3 distance_bands + region_premiums. Owner D-46 figures appear only as
-- a draft insert in rappen. This file never publishes live.

begin;
select plan(6);

select has_table('public', 'distance_bands', 'distance_bands exists');
select has_table('public', 'region_premiums', 'region_premiums exists');

select is(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'distance_bands'),
  true,
  'distance_bands has RLS'
);

select is(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'region_premiums'),
  true,
  'region_premiums has RLS'
);

select ok(
  (select public.quote_rate_book(false) ? 'distance_bands'),
  'quote_rate_book includes distance_bands'
);

select ok(
  (select public.quote_rate_book(false) ? 'region_premiums'),
  'quote_rate_book includes region_premiums'
);

select * from finish();
rollback;
