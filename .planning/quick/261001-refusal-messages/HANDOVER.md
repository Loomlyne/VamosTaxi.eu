# Refusal messages and "show bookings anyway" — hand-over

**To:** control session. **From:** 26.2 audit session, 2026-10-01.
**Folder:** `/Users/koss/Developer/vamos-wt/phase-26.2-u13`, branch `gsd/26.2-refusal-messages`, main
`ce55cd75` (Phase 27) merged in without conflict. Folder clean. Pushed as archive; no deploy.
The final commit is the one that adds this file. Details: `RECORD.md` in this folder.

## What changes (owner said "Fix" and "Show them anyway", question form, 2026-10-01)

| # | Before | After |
|---|---|---|
| 1 | Dashboard Cancel, Complete, No-show and the refund Decline/Reject: a refusal from the database came back as a 500 and the page showed its general "Could not …" | The page shows the specific reason, four languages (two new texts, see RECORD); an unexpected error is logged |
| 2 | vamostaxi.site "My bookings": if linking earlier guest bookings failed, the page said "We could not load your bookings" and showed none | The bookings show; the failed linking is logged and retried on the next open |

Cause of both: postgres.js `begin()` throws a query error again after the callback, even when the
callback caught it (same as the Assign fix on the dashboard design branch).

## Checks on the merge commit, run once by the lead

typecheck, lint (5 old warnings), lint:css, i18n:check, check:numbers, check:db-fences,
check:public-env, check:legal-claims, seed:check, build: pass. Unit: web 3142 + 2 skipped, emails
151, db 14. No SQL, no migration, no setting. pgTAP not re-run (no SQL changed).

## Not verified

No live click, no real database run of the refusal paths; texts not read by a native speaker.

## Owner UAT (after the ship)

1. Dashboard: open a completed trip, choose Cancel. **Expected:** "This trip is frozen." instead of a general error.
2. vamostaxi.site, signed in: open My bookings. **Expected:** your bookings show as before.
