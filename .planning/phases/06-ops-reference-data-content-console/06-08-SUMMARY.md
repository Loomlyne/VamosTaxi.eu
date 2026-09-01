---
phase: 06-ops-reference-data-content-console
plan: 08
subsystem: ops
tags: [coupons, crud, asStaff, revalidatePath, i18n]
requires:
  - phase: 06-ops-reference-data-content-console
    provides: "06-04 staff session, MFA fixtures, ops shell"
provides:
  - "Staff coupons CRUD on public.coupons"
  - "Kind-discriminated validator + CHF 000 amount cells"
  - "ops.coupons-* keys in en/de/fr/ar"
key-files:
  created:
    - apps/web/lib/ops/coupons.ts
    - apps/web/lib/ops/coupons.test.ts
    - apps/web/lib/ops/sqlstate.ts
    - apps/web/app/[locale]/(ops)/ops/coupons/page.tsx
    - apps/web/app/[locale]/(ops)/ops/coupons/actions.ts
    - apps/web/components/ops/CouponTable.tsx
    - apps/web/components/ops/CouponForm.tsx
    - apps/web/tests/integration/ops-coupons.spec.ts
  modified:
    - apps/web/components/ops/index.ts
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json
key-decisions:
  - "Codes upper-cased in assertCouponInput and in the form before submit; CHECK is the second gate"
  - "NULL amount_rappen renders via formatAmount(null) → CHF 000; percent kind renders percent"
  - "No seed rows; every test coupon is created and cleaned up (D-32)"
patterns-established:
  - "Ops CRUD: requireStaffClaims → assert* → asStaff → revalidatePath; mapSqlState keys, never err.message"
  - "audit_log assertion after create: actor_kind=staff + acting uid proves no service-role shortcut"
requirements-completed: [OPS-06]
---

# Plan 06-08 Summary — Coupons CRUD

**Staff coupons list/form on `dashboard.vamostaxi.site/ops/coupons`: kind-exclusive percent/amount, uppercase codes, CHF 000 while NULL.**

## Task commits

1. **Task 1 tests** — `34046b8` `test(06-08): add failing tests for coupon validator`
2. **Task 1 impl** — `2b14d6e` `feat(06-08): implement coupon reader and validator`
3. **Task 2 screen** — `a97721c` `feat(06-08): add coupons CRUD screen and spec`

## ops.coupons-* keys added

`coupons-activate`, `coupons-add`, `coupons-cancel`, `coupons-close`, `coupons-code-required`, `coupons-col-code`, `coupons-col-expires`, `coupons-col-status`, `coupons-col-uses`, `coupons-col-value`, `coupons-constraint`, `coupons-count-all`, `coupons-count-live`, `coupons-deactivate`, `coupons-delete`, `coupons-delete-body`, `coupons-duplicate`, `coupons-edit`, `coupons-empty`, `coupons-empty-body`, `coupons-error`, `coupons-expired`, `coupons-field-active`, `coupons-field-amount`, `coupons-field-code`, `coupons-field-global-limit`, `coupons-field-kind`, `coupons-field-note`, `coupons-field-per-user-limit`, `coupons-field-percent`, `coupons-field-valid-from`, `coupons-field-valid-until`, `coupons-foot-all`, `coupons-foot-live`, `coupons-hint-amount`, `coupons-hint-code`, `coupons-hint-expires`, `coupons-hint-percent`, `coupons-kind-amount`, `coupons-kind-exclusive`, `coupons-kind-percent`, `coupons-limit-dec`, `coupons-limit-inc`, `coupons-limit-integer`, `coupons-live`, `coupons-no-end`, `coupons-note`, `coupons-paused`, `coupons-percent-decimals`, `coupons-percent-range`, `coupons-rappen-integer`, `coupons-save`, `coupons-subtitle`, `coupons-unlimited`, `coupons-window`.

No example codes in the dictionary.

## Verification

- Vitest `lib/ops/coupons.test.ts`: 6 passed
- `i18n:check`: passed (1745 keys)
- Greps: yellow 0, `tone="warning"` 0, `revalidatePath` 5, Realtime/localStorage 0, `audit_log` in actions 0, `seed.sql` unchanged
- Playwright `@ops-coupons` component-1440: **7 skipped** (worktree has no `apps/web/node_modules`; executor must not `pnpm install`). Local Auth was up. Audit-attribution assertion is in the spec; it did not run live this sitting.
- `lint:css`: inherited red on `WhenPicker.css` yellow tokens (not this plan)
- `tsc --noEmit`: inherited red (`Cannot find type definition file for 'node'`) — no worktree `@types`

## Deviations

- Dates use `Input type="date"` not `DatePicker` (`onChange` is day-of-month only; no ISO contract).
- `sqlstate.ts` written here because 06-07 is not on this branch; map is 23505/23514 keys only.

## Self-Check: PASSED

Audit-attribution: **not live-proven this sitting** (spec skipped). Re-run `playwright test tests/integration/ops-coupons.spec.ts --project=component-1440` from a tree with `apps/web/node_modules` after `pnpm db:start`.

---
*Phase: 06-ops-reference-data-content-console*
*Completed: 2026-09-01*
