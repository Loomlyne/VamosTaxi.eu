-- quote_lock_24h.test.sql
--
-- D-31: 1440-minute lock. Isolated fixture — never mutate launch-baseline.
-- D-24: null quote_lock_minutes still raises restrict_violation (23001).
-- No CHF figures.

begin;
select plan(3);

insert into public.settings_versions (slug, label, quote_lock_minutes, checkout_window_minutes, effective_from)
values
  ('07-11-lock-24h', '07-11 24h fixture', 1440, 1440, now()),
  ('07-11-lock-null', '07-11 null fixture', null, null, now());

select ok(
  public.quote_lock_deadline(
    (select id from public.settings_versions where slug = '07-11-lock-24h')
  ) > now() + interval '23 hours',
  '(1) 1440-minute lock is strictly after now()+23h'
);

select ok(
  public.quote_lock_deadline(
    (select id from public.settings_versions where slug = '07-11-lock-24h')
  ) < now() + interval '25 hours',
  '(2) 1440-minute lock is strictly before now()+25h'
);

select throws_ok(
  $$ select public.quote_lock_deadline(
       (select id from public.settings_versions where slug = '07-11-lock-null')
     ) $$,
  '23001',
  null,
  '(3) null quote_lock_minutes raises restrict_violation'
);

select * from finish();
rollback;
