---
phase: 18-ops-pricing-source
plan: 04
subsystem: pricing
tags: [D-02, D-03, D-06, D-07, D-08, D-09, publish, vitest, asStaff]

requires:
  - phase: 18-ops-pricing-source
    provides: D-11 live distance recipe (start + all-km per-km + per-class band extras)
  - phase: 18-ops-pricing-source
    provides: Hosted Zurich per-class bands and D-08 completeness without min_fare
provides:
  - D-08 loadCompleteness lockstep with 20260913180000 (name, start, per-km, max pax)
  - Publish-only public_chf + vat_rate_bps in one asStaff tx
  - forkLiveRateVersion clone of live/retired source after successful Publish
affects: [18-05, 18-06, 18-08, 18-10]

tech-stack:
  added: []
  patterns:
    - Completeness 409 with gaps[] before any live write
    - public_chf and vat_rate_bps move only inside the Publish asStaff tx
    - forkLiveRateVersion accepts a source version id and optional existing tx

key-files:
  created: []
  modified:
    - apps/web/lib/ops/pricing.ts
    - apps/web/lib/ops/pricing.test.ts
    - apps/web/lib/ops/rate-book.ts
    - apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts
    - apps/web/lib/ops/publish-public-chf.test.ts

key-decisions:
  - "Publish retires other live rows, sets this id live, public_chf true, and VAT in one asStaff tx"
  - "forkLiveRateVersion joins that tx when passed; one function clones live or retired sources"
  - "Frozen/not-draft wins over incomplete so the second admin sees the last-write-wins envelope"

patterns-established:
  - "D-08 checklist is stricter than the trigger on empty coupon/rule/band rows; zero rows are not gaps"
  - "Dual-mount publish route stays export { POST }"

requirements-completed: [D-02, D-03, D-06, D-07, D-08, D-09]

duration: 5min
completed: 2026-09-14
---

# Phase 18 Plan 04: Publish-only flip Summary

**Publish is the only public flip: one asStaff tx sets live, `public_chf` true, and `vat_rate_bps` from the version, then clones a new draft. Completeness 409 names exact D-08 gaps. Dispatcher cannot publish; last successful admin Publish wins with `not-draft`.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-09-13T22:24:02Z
- **Completed:** 2026-09-13T22:29:00Z
- **Tasks:** 3 completed
- **Files modified:** 5

## Accomplishments

- `loadCompleteness` matches D-08: name, start, per-km, max pax — no `min_fare_rappen`. Empty added surcharge/route/coupon/rule/band rows are gaps; zero rows are not.
- Publish tx retires other live rows, stamps `published_at` / `published_by`, sets `public_chf` true, copies VAT onto `settings`, copies lock/service area onto the live `settings_versions` row, then `forkLiveRateVersion`.
- `forkLiveRateVersion` copies hide-from-public, classed bands, rules, coupons, and draft VAT/lock/geo/wait/stops. One function; live or retired source id.
- `withAdmin` stays. Frozen/not-draft returns `{ ok: false, code: "not-draft", gaps }`. Dual-mount remains `export { POST }`.

## Task Commits

Each task was committed atomically:

1. **Task 1: loadCompleteness = D-08** - `4a053c6` (feat)
2. **Task 2: Publish tx applies VAT, clones draft, writes history** - `9308a96` (feat)
3. **Task 3: Admin-only Publish and last-write-wins error** - `475f270` (feat)

**Plan metadata:** pending this commit (docs: complete plan)

## Files Created/Modified

- `apps/web/lib/ops/pricing.ts` — D-08 completeness SQL; lockstep comment on `20260913180000_ops_pricing_source.sql`
- `apps/web/lib/ops/pricing.test.ts` — D-08 green; empty added rows vs zero rows
- `apps/web/lib/ops/rate-book.ts` — generalized `forkLiveRateVersion` with optional tx
- `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts` — all-or-nothing Publish
- `apps/web/lib/ops/publish-public-chf.test.ts` — source-read proofs for VAT, fork, withAdmin, not-draft
- `apps/web/app/api/staff/rate-versions/[id]/publish/route.ts` — **unmodified** re-export

## Decisions Made

- Completeness is allowed to be stricter than the trigger (coupon/rule/band empty rows) so Publish 409s before a live write.
- `forkLiveRateVersion` takes an optional `tx` so clone rolls back with the Publish flip. Callers without a tx still open `asStaff`.
- VAT null on the draft does not clobber `settings.vat_rate_bps` (`coalesce`). Do not invent a number.
- Coupon copy uses `ON CONFLICT (code) DO NOTHING` because `coupons.code` is still globally unique; a later unique `(rate_version_id, code)` is 18-05 territory.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Coupon clone must not 409 unique(code)**
- **Found during:** Task 2 (Publish tx / fork)
- **Issue:** `coupons.code` is still globally unique. Copying live coupons onto the new draft would abort the whole Publish tx with 23505.
- **Fix:** `INSERT … ON CONFLICT (code) DO NOTHING` so D-06 still clones rates/routes/rules. True per-version coupon copies wait on a later unique `(rate_version_id, code)`.
- **Files modified:** `apps/web/lib/ops/rate-book.ts`
- **Verification:** `pnpm --filter web exec vitest run lib/ops/publish-public-chf.test.ts` → 10 passed (source-read includes `insert into public.coupons`)
- **Committed in:** `9308a96` (Task 2)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Required so first Publish is not blocked by existing coupon codes. No scope creep. Did not apply a migration.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 18-05 (draft staff APIs, VAT off PATCH, preview / test unpaid / clone). Kernel is D-11. Completeness is D-08. Publish is the only flip. `public_chf` still false on hosted until the owner clicks Publish. Stripe still test. Do not invent CHF. Do not apply migrations / `db push` / restore.

## Self-Check: PASSED

- key-files.modified exist on disk
- `git log --grep=18-04` returns 3 task commits (`4a053c6`, `9308a96`, `475f270`)
- Task 1–3 acceptance_criteria all PASS
- Plan verification: `pnpm --filter web exec vitest run lib/ops/pricing.test.ts lib/ops/publish-public-chf.test.ts` → 2 files, 19 passed
- Dual-mount remains `export { POST }`
- No migration apply / db push / restore / live Publish click / deploy
- `pricing.ts` completeness SQL has no `min_fare_rappen`

---
*Phase: 18-ops-pricing-source*
*Completed: 2026-09-14*
