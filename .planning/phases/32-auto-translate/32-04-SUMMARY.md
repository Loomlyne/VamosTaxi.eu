---
phase: 32-auto-translate
plan: 04
subsystem: i18n
tags: [i18n, dictionary, arabic, brand, seed, emails]
requires: [32-01]
provides:
  - Signed translator strings (14 rows) and the "Translated from" pattern in app/vamos-i18n-dict.js
  - "Vamos Taxi" in Latin in the Arabic dictionary, Next messages, e-mail catalog and OpsReviews
  - strings-signed.test.ts (reads 32-STRINGS.md at test time)
key-files:
  modified:
    - app/vamos-i18n-dict.js
    - apps/web/i18n/messages/ar.json
    - packages/emails/src/messages/ar.json
    - packages/emails/src/__snapshots__/ConfirmationEmail.test.tsx.snap
    - packages/emails/src/PayLinkEmail.test.tsx
    - app/ops/OpsReviews.dc.html
    - packages/db/supabase/seed.sql
  created:
    - apps/web/lib/translate/strings-signed.test.ts
metrics:
  tasks: 2
  completed: 2026-10-14
---

# Phase 32 Plan 04: Signed strings and Latin brand in Arabic Summary

Signed translator strings resolve in de/fr/ar from the dictionary, `Translated from (.+)` is a pattern placed before `Saved on`, and every Arabic-letter spelling of "Vamos Taxi" in the four files is now Latin.

## Commits
- f28a178d: 14 dictionary rows (block `Automatic translator (phase 32)` before `/* Reviews */`) + pattern + strings-signed.test.ts. Block and pattern taken from the signed prototype patch; none of the 14 English keys existed before; `Try again` and `Reviews` reused.
- d89d1a3a: brand edit in dictionary (23 lines), apps/web ar.json (21), e-mail ar.json (3: footer x2, "presented"), OpsReviews `verifiedHint` (1); e-mail snapshot updated; PayLinkEmail test also asserts the Latin footer `Vamos Taxi · زيورخ` absent; seed regenerated (21 lines changed, nothing else).
- OpsSidebar's spelling was already done in 32-03.

## Pages and Legal rows: both kept
- `Legal`: used by the footer heading, the breadcrumb of cancellation/cookies/privacy/terms, and the sitemap group heading.
- `Pages`: still used by `app/pages/sitemap.dc.html` (`data-sm-n`).

## Owner-approved legal lines left untouched
None. No `legal.*` / `cookies.*` message, decision-file text, `$meta.noParamKeys` entry or `data-vt-legal` page string contained the Arabic brand. The test pins an empty exclusion list (`F01_KEPT`).

## Verification
- strings-signed.test.ts: 13 passed. `pnpm i18n:check`: passed. `pnpm db:seed:check`: no drift. `packages/emails` tests: 293 passed.
- en/de/fr message files: no diff against merge base.
- `git grep فاموس` over the four files plus OpsSidebar: 0.
- Not run: full web suite, Playwright.

## Deviations from Plan
None in behaviour. Snapshot was updated with `pnpm exec vitest run -u` in the package, because `pnpm test -- -u` forwards the flag after `--` and does not update.

## Notes for the controller
- `ADR-011-data-tok-labels-stay-english.md` quotes the old Arabic of `Awaiting a confirmed value from Vamos Taxi`; it sits outside `.planning/decisions/`, so the dictionary row was changed and the ADR text left as is.
- Phase 31 is not on origin/main (no `*_refund_check_reader.sql`, no `refundCheck(`). When it lands, keep both sides of the dictionary, messages and seed files, then run `pnpm db:seed:gen` and `pnpm db:seed:check` (never hand-merge seed.sql).
- Stale, out of scope: `app/pages/sitemap.dc.html` lines 147-148 still list dashboard `/pages` and `/legal`, which plan 32-03 removed. Needs a decision on the sitemap rows; the `Pages` dictionary row goes with it if they are dropped.

## Known Stubs
None.

## Self-Check: PASSED
f28a178d and d89d1a3a exist; strings-signed.test.ts and this file exist.
