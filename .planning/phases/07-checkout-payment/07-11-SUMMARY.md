---
phase: 07-checkout-payment
plan: 11
subsystem: db
tags: [checkout, quote-lock, settings]

requires:
  - phase: 07-checkout-payment
    provides: quote_lock_deadline + HMAC lock
provides:
  - D-31 24h quote_lock_minutes / checkout_window_minutes
  - i18n checkoutWindowHours + livePriceChangedLocked
affects: [07-12, 07-13, 07-15]

tech-stack:
  added: []
  patterns:
    - append-only settings_versions clone, never UPDATE launch-baseline
    - Postgres quote_lock_deadline() still the only exp author

key-files:
  created:
    - packages/db/supabase/migrations/20260907000001_quote_lock_24h.sql
    - packages/db/supabase/tests/quote_lock_24h.test.sql
  modified:
    - packages/db/seed/generate-seed.mjs
    - packages/db/supabase/seed.sql
    - packages/db/supabase/tests/seed_idempotent.test.sql
    - apps/web/lib/quote/lock.ts
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json

key-decisions:
  - "1440 minutes both columns. Hosted apply is still owner-gated."
  - "seed:gen could not rewrite seed.sql (Node 26 fetch in vamos-reviews.js); seed.sql patched by hand to match generate-seed."

requirements-completed: []
requirements-stub-only: [PAY-01-live]

completed: 2026-09-07T12:00:00Z
---

# Plan 07-11 Summary

24h lock in schema/seed/copy. Not live on hosted until owner apply.

## Task 1

Migration clones the current `settings_versions` row as `checkout-lock-24h` with 1440 / 1440. Fresh reset has no row to clone; seed `launch-baseline` now 1440.

pgTAP `quote_lock_24h.test.sql`: fixture 1440 is between 23h and 25h; null minutes still `23001`. Docker was down this sitting — isolated file not executed. Inherited full suite not run.

`lock.ts` comments: 24h, Worker still does not author exp. (Also committed pre-existing `first` class slug on `class_totals` in the same dirty file.)

i18n: `checkoutWindowHours`, `livePriceChangedLocked` in en/de/fr/ar. `pnpm i18n:check` passed.

## Task 2 — hosted apply

**Not applied** on `yaumjzvylngfjhtuffqs`. Wait for owner **apply**.

## Deviations

- `generate-seed.mjs` + `seed.sql` + `seed_idempotent.test.sql` not in PLAN `files_modified`; required so local reset is 24h (append-only cannot UPDATE launch-baseline).
