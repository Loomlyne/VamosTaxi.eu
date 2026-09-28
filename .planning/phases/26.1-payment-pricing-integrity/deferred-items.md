# Deferred items — Phase 26.1

Out-of-scope discoveries found during plan execution. Not fixed by the plan
that found them (Scope Boundary rule) — listed here for the phase owner /
next plan to pick up.

## RESOLVED in wave 3 gate — `pnpm db:seed:check` fails — `price.line.airport_fee` missing from `seed.sql`

- **Found during:** 26.1-06, Task 1 verification (`pnpm db:seed:check`)
- **Cause:** commit `e413d456` (plan 26.1-04, already on this branch before
  26.1-06 started) added `price.line.airport_fee` to
  `apps/web/i18n/messages/{en,de,fr,ar}.json` but did not regenerate
  `packages/db/supabase/seed.sql` (`pnpm db:seed:gen`). The generator's
  `content_strings` count is 2502; the committed seed file still says 2501.
- **Scope:** `apps/web/i18n/messages/*.json` and `packages/db/supabase/seed.sql`
  are not in 26.1-06's `files_modified` list, and the gap predates 26.1-06's
  own first commit on this branch — not caused by this plan's changes.
- **Fix (for whichever plan/wave owns it):** `pnpm db:seed:gen` from a
  worktree with local Supabase running, then commit the regenerated
  `packages/db/supabase/seed.sql`.

## Rate-version labels accumulate " draft" words

- **Found during:** 26.1-14 live read-back (2026-09-28).
- **What:** live v18 and draft v19 labels read "Staging matrix — placeholder, not owner-approved draft draft draft …". The draft-copy/clone path appears to append " draft" to the label on every copy.
- **Impact:** cosmetic; the "placeholder, not owner-approved" wording is still present.
- **Fix:** find the clone path in `apps/web/lib/ops` (rate-book draft copy) and stop appending; the owner can reset the label text in the dashboard.

## Legacy zones typed 'other'

- **What:** `zrh-airport`, `gva-airport`, `zurich-city` have `zone_type = 'other'`.
- **Impact:** none on the airport fee (Mapbox/flight driven). City pairs created from ops now get Mapbox-typed zones (26.1-10).
- **Fix (optional):** retype via ops or owner SQL once the owner confirms.
