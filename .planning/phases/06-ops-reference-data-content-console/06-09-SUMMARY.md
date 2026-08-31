---
phase: 06-ops-reference-data-content-console
plan: 09
subsystem: ops
tags: [customers, bookings, read-only, chf-000, erasure]
requires:
  - phase: 06-ops-reference-data-content-console
    provides: "06-04 staff sign-in/MFA; 06-02 requireStaffClaims; 06-03 ops shell"
provides:
  - "Read-only loadCustomers / loadCustomerHistory via asStaff (D-26)"
  - "/ops/customers list + /ops/customers/[id] history"
  - "CHF 000 for NULL price_total_rappen (D-14)"
  - "erased_at customers marked redacted, contact fields omitted"
affects: [08-ops-bookings, 10-erasure]
tech-stack:
  added: []
  patterns:
    - "Ops customer queries are SELECT-only; Phase 8 extends customers.ts rather than replacing it"
    - "Search is GET ?q= server-side; no client filter, no Realtime"
key-files:
  created:
    - apps/web/lib/ops/customers.ts
    - apps/web/app/[locale]/(ops)/ops/customers/page.tsx
    - apps/web/app/[locale]/(ops)/ops/customers/[id]/page.tsx
    - apps/web/components/ops/CustomerTable.tsx
    - apps/web/components/ops/CustomerDetail.tsx
    - apps/web/components/ops/BookingHistoryList.tsx
    - apps/web/tests/integration/ops-customers.spec.ts
  modified:
    - apps/web/components/ops/index.ts
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json
key-decisions:
  - "D-26: module exports no write; route has no use server"
  - "customer_type is private|corporate (schema), not business"
  - "ops.customers-* kebab keys — ops.customers is already the nav string"
requirements-completed: [OPS-07]
duration: 90min
completed: 2026-09-01
---

# Phase 06 Plan 09: Read-only customers list + history

**Staff can search customers and read booking history. Nothing on the route mutates a booking. NULL totals render CHF 000.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-08-31T21:00:00Z
- **Completed:** 2026-09-01T01:23:00Z
- **Tasks:** 2
- **Files modified:** 12 production + this SUMMARY

## Accomplishments

- `loadCustomers` / `loadCustomerHistory` go through `asStaff`, SELECT only. Search is bound ILIKE on name+email with `%`/`_` escaped. Redacted rows omit email/phone/company/note from the mapped object.
- List: designed empty state, GET `?q=` search (refresh keeps the term), row → `/ops/customers/<id>`.
- Detail: redaction notice first (no field grid). History cards: reference (`.vt-dir-keep`), `StatusBadge`, `RouteSummary` per leg, `formatAmount(priceTotalRappen)` so NULL is `CHF 000`.
- Host remains `dashboard.vamostaxi.site` (D-01a). `dynamic = "force-dynamic"`. No Realtime, no localStorage.

## Task Commits

1. **Task 1: The two read queries** — `e1d5086` (feat)
2. **Task 2: list, detail, spec, i18n** — `3bd9d54` (feat)
3. **Plan metadata:** (this commit)

## Read-only module export list (Phase 8 extends, does not replace)

`apps/web/lib/ops/customers.ts`:

- `loadCustomers(env, claims, search?)`
- `loadCustomerHistory(env, claims, customerId)`
- `type CustomerRow`
- `type BookingHistoryRow`
- also: `CustomerType`, `BookingLegRow`, `CustomerHistory`

No INSERT/UPDATE/DELETE. No `sql.unsafe`. Amounts stay `number | null`.

## `ops.customers-*` keys added

Appended under `ops` in all four locales (`ops.customers` is already the nav label string, so kebab keys):

`customers-subtitle`, `customers-empty`, `customers-empty-body`, `customers-search`, `customers-search-submit`, `customers-col-name`, `customers-col-phone`, `customers-col-company`, `customers-col-trips`, `customers-col-type`, `customers-type-private`, `customers-type-corporate`, `customers-redacted`, `customers-redacted-notice`, `customers-history`, `customers-history-empty`, `customers-field-name`, `customers-field-phone`, `customers-field-type`, `customers-field-company`, `customers-field-since`, `customers-field-note`, `customers-back`, `customers-dash`

## Phase 8 starting inventory — mock write controls left read-only (D-26)

| Mock control | This plan |
|---|---|
| Add customer (list) | Comment only — no button |
| Edit customer (detail) | Comment only — no button |
| Delete this customer (detail) | Comment only — no button |
| Assign / cancel / refund / status select on a booking | Not rendered; no form action targeting a booking route |

## Decisions Made

- Schema `customer_type` is `'private' | 'corporate'` (not the plan interface's `'business'`).
- i18n keys are `ops.customers-*` kebab, not a nested `ops.customers` object (would collide with the nav string).
- `formatAmount` from `lib/currency.ts` for CHF 000. No new money helper.

## Deviations from Plan

None that change scope. i18n shape is kebab under `ops` because a nested `ops.customers` object cannot coexist with `"customers": "Customers"`.

## Issues Encountered

- Worktree has no `node_modules` (no install, no symlink). `pnpm typecheck` / `lint:css` cannot run against this tree; `i18n:check` passed (1714 keys). Inherited `WhenPicker.css` stylelint red is not this plan's files.
- Playwright `@ops-customers` **skipped** (exit 0): worktree Next cannot compile `/ops/sign-in` without local `node_modules`. Spec skips when local next/auth is not ready, same pattern as 06-04 gates.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- OPS-07 read-only surface is in place for Phase 8 to add mutation on `customers.ts` and the detail cards.
- Erasure display is ready for Phase 10's routine to set `erased_at`.

---
*Phase: 06-ops-reference-data-content-console*
*Completed: 2026-09-01*
