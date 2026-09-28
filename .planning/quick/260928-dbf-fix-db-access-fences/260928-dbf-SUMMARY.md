---
phase: quick-260928-dbf
plan: 01
subsystem: web-db-fences
tags: [check-db-fences, D-06, isolate-memoisation, force-dynamic]
---

# Summary

`pnpm check:db-fences` now passes. It was also failing on main, where it runs late in the
Schema CI job.

## D-06: every identity-wrapper importer is a Route Handler or force-dynamic

Five lib modules imported `@/lib/db/identity` or `@/lib/db/public` without declaring
force-dynamic:

- resolve-booking-id
- ticket-inbound
- tickets-write
- voucher
- public/reviews

Each now declares `export const dynamic = "force-dynamic";` after its imports. This is the same
house pattern as lib/ops/bookings.ts and lib/ops/edit-request.ts.

## Isolate memoisation: no module-scope Map/Set in app/ or lib/

18 module-scope `new Set([...])` lookups were flagged. Every one is a constant membership table
that is never written to, so none is a request-scoped store. Following the fence's own
guidance (lookup tables are frozen config), each is now
`const X: readonly string[] = Object.freeze([...])`, and `.has(` became `.includes(`.

- `lib/security/origin.ts` now takes `hosts: readonly string[]`.
- Behaviour for string membership is identical.

## Checked

- check:db-fences exits 0.
- typecheck and lint pass.
- test:unit passes: web 1631/1631, db 9/9, emails 95/95.
- `pnpm build` passes: 151/151 pages generated.

## Gap noted, not changed

The fence regex only matches an untyped `new Set(`. A generic declaration
(`new Set<TicketStatus>(`) or a type-annotated one (`X: ReadonlySet<...> = new Set(`) is not
caught; examples are in ticket-inbound.ts, tickets-write.ts and dc-mock-urls.ts. They are the
same kind of constant tables. Tightening the regex is a separate change.
