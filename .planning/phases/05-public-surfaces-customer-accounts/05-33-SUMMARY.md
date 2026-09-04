---
phase: 05-public-surfaces-customer-accounts
plan: 33
subsystem: staging-connection-table
status: executed
completed: 2026-09-04
---

# Plan 05-33: Staging connection table — execution summary

## Delivered

- Deployed branch `gsd/phase-05-leftover-public-wiring` to Worker **`vamos`** (not `vamos-web`, not `vamos-web-staging`). Printed URL `https://vamos.koussayzayeni.workers.dev` + custom domains. Version **`093a4976-a8fe-4fe3-ab97-2ac1bc83ed7b`** at 100%.
- Chrome-UA curls of every in-scope URL + the five APIs. Wrote `05-CONNECTION-TABLE.md`.
- Home leftover column is **none** for `const FLIGHTS` and pending-notice. `GET /api/reviews` is **200** published JSON (5 rows). `GET /api/staff/reviews` logged-out **401**. `/become-a-partner` **404**.

## Not run

- `POST /api/quote`
- Contact form submit
- Dashboard clicks / Gmail staff JWT

## Verification

- `test -f .planning/phases/05-public-surfaces-customer-accounts/05-CONNECTION-TABLE.md`
- Live `GET /api/reviews` 200 `{ ok: true, data: [...] }`
- Live `/app/home/home.dc.html` has no `const FLIGHTS`
- Live `/app/vamos-reviews.js` contains `/api/reviews`
- Secret names after deploy: 11 (unchanged)

## Still owner

- 05-27 contact UAT
- 05-28 gated on that UAT
